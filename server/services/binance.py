import requests
from fastapi import HTTPException
from config import TICKER_API_URL, BINANCE_API_URL

def get_top_coins(limit: int = 20):
    """Fetch the top 20 coins by 24hr trading volume paired with USDT."""
    try:
        response = requests.get(TICKER_API_URL)
        response.raise_for_status()
        tickers = response.json()
        
        # Filter USDT pairs and sort by quote volume
        usdt_pairs = [ticker for ticker in tickers if ticker["symbol"].endswith("USDT")]
        sorted_pairs = sorted(usdt_pairs, key=lambda x: float(x["quoteVolume"]), reverse=True)
        
        return [pair["symbol"] for pair in sorted_pairs[:limit]]
    
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch ticker data: {str(e)}")

def get_kline_data(symbol: str, interval: str, limit: int):
    """Fetch Kline (OHLC) data from Binance API."""
    try:
        params = {"symbol": symbol, "interval": interval, "limit": limit}
        response = requests.get(BINANCE_API_URL, params=params)
        response.raise_for_status()
        return response.json()
    
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Kline data: {str(e)}")
