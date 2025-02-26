# from fastapi import FastAPI, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# import requests
# import numpy as np
# import talib
# from typing import List, Dict

# app = FastAPI()

# # Enable CORS for React frontend
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:3000"],
#     allow_credentials=True,
#     allow_methods=["GET"],
#     allow_headers=["*"],
# )

# # Binance API URLs
# BINANCE_API_URL = "https://api.binance.com/api/v3/klines"
# TICKER_API_URL = "https://api.binance.com/api/v3/ticker/24hr"

# def replace_nan_with_none(data):
#     """Recursively replace NaN with None in a nested data structure."""
#     if isinstance(data, list):
#         return [replace_nan_with_none(item) for item in data]
#     elif isinstance(data, dict):
#         return {key: replace_nan_with_none(value) for key, value in data.items()}
#     elif isinstance(data, float) and (np.isnan(data) or np.isinf(data)):
#         return None
#     return data

# def get_top_coins(limit: int = 20) -> List[str]:
#     """Fetch the top 20 coins by 24hr trading volume paired with USDT."""
#     try:
#         response = requests.get(TICKER_API_URL)
#         response.raise_for_status()
#         tickers = response.json()
        
#         # Filter for USDT pairs and sort by quote volume
#         usdt_pairs = [ticker for ticker in tickers if ticker["symbol"].endswith("USDT")]
#         sorted_pairs = sorted(usdt_pairs, key=lambda x: float(x["quoteVolume"]), reverse=True)
        
#         # Return top 'limit' symbols
#         return [pair["symbol"] for pair in sorted_pairs[:limit]]
#     except requests.RequestException as e:
#         raise HTTPException(status_code=502, detail=f"Failed to fetch ticker data: {str(e)}")

# @app.get("/indicators/top-coins/")
# async def get_top_coins_indicators(interval: str = "1h", limit: int = 200):
#     """
#     Fetch Kline data for the top 20 coins and calculate SMA and RSI.
#     - interval: Time interval (e.g., 15m, 1h, 1d)
#     - limit: Number of data points per coin (max 1000 per Binance API)
#     """
#     try:
#         # Get top 20 coins
#         top_symbols = get_top_coins(20)
#         result = []

#         for symbol in top_symbols:
#             # Fetch Kline data for each symbol
#             params = {"symbol": symbol, "interval": interval, "limit": limit}
#             response = requests.get(BINANCE_API_URL, params=params)
#             response.raise_for_status()
#             klines = response.json()

#             # Extract closing prices
#             close_prices = np.array([float(kline[4]) for kline in klines], dtype=np.double)

#             # Calculate SMA (20-period) and RSI (14-period)
#             sma = talib.SMA(close_prices, timeperiod=20)
#             rsi = talib.RSI(close_prices, timeperiod=14)

#             # Prepare data for this coin
#             coin_data = {
#                 "symbol": symbol,
#                 "interval": interval,
#                 "data": [
#                     {
#                         "timestamp": int(kline[0]),  # Open time
#                         "open": float(kline[1]),     # Open price
#                         "high": float(kline[2]),     # High price
#                         "low": float(kline[3]),      # Low price
#                         "close": float(kline[4]),    # Close price
#                         "sma": sma[i] if i < len(sma) else None,
#                         "rsi": rsi[i] if i < len(rsi) else None
#                     }
#                     for i, kline in enumerate(klines)
#                 ]
#             }
#             result.append(coin_data)

#         return replace_nan_with_none(result)

#     except requests.RequestException as e:
#         raise HTTPException(status_code=502, detail=f"Failed to fetch data from Binance: {str(e)}")
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# # Run with: uvicorn main:app --reload


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from auth.routes import auth_router
from indicators.routes import indicators_router


app = FastAPI()


# Enable CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Include Authentication Routes
app.include_router(auth_router, prefix="/auth", tags=["auth"])

# Include Crypto Indicator Routes
app.include_router(indicators_router, prefix="/indicators", tags=["indicators"])

@app.get("/")
async def root():
    return {"message": "Welcome to FastAPI API"}
