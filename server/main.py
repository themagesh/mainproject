from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis
import requests
import numpy as np
import talib
import json
from typing import List, Dict

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (change to specific domains in production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Binance API URLs
BINANCE_API_URL = "https://api.binance.com/api/v3/klines"
TICKER_API_URL = "https://api.binance.com/api/v3/ticker/24hr"

# Redis config
REDIS_HOST = "localhost"
REDIS_PORT = 6379
CACHE_EXPIRE = 1800  # 30 minutes

# Excluded coins
EXCLUDED_COINS = {"SHELLUSDT", "KAITOUSDT", "TRUMPUSDT"}

async def get_redis():
    """Initialize Redis connection."""
    return await aioredis.from_url(f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True)

def replace_nan_with_none(data):
    """Recursively replace NaN with None in a nested data structure."""
    if isinstance(data, list):
        return [replace_nan_with_none(item) for item in data]
    elif isinstance(data, dict):
        return {key: replace_nan_with_none(value) for key, value in data.items()}
    elif isinstance(data, float) and (np.isnan(data) or np.isinf(data)):
        return None
    return data

def get_top_coins(limit: int = 20) -> List[str]:
    """Fetch the top 20 coins by 24hr trading volume paired with USDT, excluding specific coins."""
    try:
        response = requests.get(TICKER_API_URL)
        response.raise_for_status()
        tickers = response.json()

        usdt_pairs = [
            ticker for ticker in tickers 
            if ticker["symbol"].endswith("USDT") and ticker["symbol"] not in EXCLUDED_COINS
        ]
        sorted_pairs = sorted(usdt_pairs, key=lambda x: float(x["quoteVolume"]), reverse=True)
        
        return [pair["symbol"] for pair in sorted_pairs[:limit]]
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch ticker data: {str(e)}")

@app.get("/indicators/top-coins/")
async def get_top_coins_indicators(interval: str = "1h", limit: int = 200):
    """Fetch Kline data for the top 20 coins and calculate SMA and RSI with Redis caching."""
    try:
        redis = await get_redis()
        cache_key = f"top_coins_{interval}_{limit}"
        cached_data = await redis.get(cache_key)

        if cached_data:
            return json.loads(cached_data)  # Serve cached data

        # Get top 20 coins
        top_symbols = get_top_coins(20)
        result = []

        for symbol in top_symbols:
            params = {"symbol": symbol, "interval": interval, "limit": limit}
            response = requests.get(BINANCE_API_URL, params=params)
            response.raise_for_status()
            klines = response.json()

            close_prices = np.array([float(kline[4]) for kline in klines], dtype=np.double)

            sma = talib.SMA(close_prices, timeperiod=20)
            rsi = talib.RSI(close_prices, timeperiod=14)

            coin_data = {
                "symbol": symbol,
                "interval": interval,
                "data": [
                    {
                        "timestamp": int(kline[0]),
                        "open": float(kline[1]),
                        "high": float(kline[2]),
                        "low": float(kline[3]),
                        "close": float(kline[4]),
                        "sma": sma[i] if i < len(sma) else None,
                        "rsi": rsi[i] if i < len(rsi) else None
                    }
                    for i, kline in enumerate(klines)
                ]
            }
            result.append(coin_data)

        final_result = replace_nan_with_none(result)

        # Store in Redis cache
        await redis.set(cache_key, json.dumps(final_result), ex=CACHE_EXPIRE)

        return final_result

    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch data from Binance: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

