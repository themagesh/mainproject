from fastapi import APIRouter, HTTPException
import numpy as np
import talib
from indicators.binance_service import get_top_coins, get_kline_data
from utils import replace_nan_with_none

indicators_router = APIRouter()

@indicators_router.get("/top-coins/")
async def get_top_coins_indicators(interval: str = "1h", limit: int = 200):
    """
    Fetch Kline data for the top 20 coins and calculate SMA & RSI.
    - `interval`: Time interval (e.g., 15m, 1h, 1d)
    - `limit`: Number of data points per coin (max 1000)
    """
    try:
        top_symbols = get_top_coins(20)
        result = []

        for symbol in top_symbols:
            klines = get_kline_data(symbol, interval, limit)
            close_prices = np.array([float(kline[4]) for kline in klines], dtype=np.double)

            # Calculate indicators
            sma = talib.SMA(close_prices, timeperiod=20)
            rsi = talib.RSI(close_prices, timeperiod=14)

            # Prepare response
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

        return replace_nan_with_none(result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
