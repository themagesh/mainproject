'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import * as d3 from 'd3';

export default function Home() {
  const [coinsData, setCoinsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [livePrices, setLivePrices] = useState({}); // State for live prices
  const [liveData, setLiveData] = useState({}); // State for live data points (including SMA)
  const chartRefs = useRef([]); // Array of refs for each chart

  // Fetch initial coin data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:8000/indicators/top-coins/', {
          params: { interval: '1d', limit: 120 }, // Daily data for ~4 months (Sep to Jan or Mar to Oct)
        });

        const coins = response.data;
        setCoinsData(coins);

        // Initialize live prices and data with the latest from each coin
        const initialPrices = {};
        const initialData = {};
        coins.forEach(coin => {
          const latest = coin.data[coin.data.length - 1] || {};
          initialPrices[coin.symbol] = latest.close || 0;
          initialData[coin.symbol] = {
            close: latest.close || 0,
            sma: latest.sma || 0,
            timestamp: latest.timestamp || new Date().toISOString(),
          };
        });
        setLivePrices(initialPrices);
        setLiveData(initialData);
      } catch (err) {
        setError('Failed to fetch data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Update live prices and data every 30 minutes (replace with real-time API if available)
    const updateInterval = setInterval(() => {
      setLivePrices(prevPrices => {
        const updatedPrices = {};
        const updatedData = {};
        coinsData.forEach(coin => {
          // Simulate a small random price fluctuation (e.g., ±0.5%)
          const latestPrice = coin.data[coin.data.length - 1]?.close || prevPrices[coin.symbol] || 0;
          const fluctuation = latestPrice * (Math.random() * 0.01 - 0.005); // ±0.5%
          const newPrice = Math.max(0, latestPrice + fluctuation).toFixed(2);
          updatedPrices[coin.symbol] = newPrice;

          // Update live data with new price and recalculate SMA (simple moving average for last 5 points)
          const currentData = liveData[coin.symbol] || {};
          const newData = {
            close: parseFloat(newPrice),
            sma: calculateSMA(coin.data.slice(-5).map(d => d.close || 0).concat(parseFloat(newPrice))),
            timestamp: new Date().toISOString(),
          };
          updatedData[coin.symbol] = newData;
        });
        setLiveData(updatedData);
        return updatedPrices;
      });
    }, 1800000); // Update every 30 minutes (1800000 milliseconds)

    // Cleanup interval on unmount
    return () => clearInterval(updateInterval);
  }, [coinsData]);

  // Function to calculate Simple Moving Average (SMA) for the last n points
  const calculateSMA = (prices, period = 5) => {
    if (prices.length < period) return 0;
    const sum = prices.slice(-period).reduce((sum, price) => sum + price, 0);
    return sum / period;
  };

  // Function to render D3 chart for a specific coin
  const drawChart = useCallback((coinData, chartRef) => {
    if (!coinData || !chartRef) return;

    // Use live data for the latest point, combined with historical data
    const historicalData = coinData.data.slice(0, -1); // All but the last point
    const livePoint = liveData[coinData.symbol] || {
      close: coinData.data[coinData.data.length - 1]?.close || 0,
      sma: coinData.data[coinData.data.length - 1]?.sma || 0,
      timestamp: new Date().toISOString(),
    };
    const data = [...historicalData, livePoint];

    // Generate buy/sell signals (using SMA crossover strategy, updated with live data)
    const signals = data.map((d, i) => {
      if (i < 1) return null; // Need at least two points for comparison
      const prev = data[i - 1];
      const current = d;
      const prevSma = prev.sma;
      const currentSma = current.sma;

      if (prevSma !== null && currentSma !== null) {
        // Buy signal: Price (close) crosses above SMA
        if (current.close > currentSma && prev.close <= prev.sma) {
          return { timestamp: current.timestamp, type: 'buy', price: current.close };
        }
        // Sell signal: Price (close) crosses below SMA
        if (current.close < currentSma && prev.close >= prev.sma) {
          return { timestamp: current.timestamp, type: 'sell', price: current.close };
        }
      }
      return null;
    }).filter((signal) => signal !== null);

    // Store signal elements for dynamic updates
    let signalDots, sellEllipses, buyEllipses;

    const margin = { top: 20, right: 20, bottom: 50, left: 0 }; // No left margin for no y-axis
    const initialWidth = 1200 - margin.left - margin.right; // Base width for laptop
    const height = 400 - margin.top - margin.bottom;

    // Clear previous SVG content
    d3.select(chartRef).selectAll('*').remove();

    // Create SVG with dark background
    const svg = d3
      .select(chartRef)
      .append('svg')
      .attr('width', initialWidth + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', '#1a1a1a') // Dark background
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X scale (time, daily)
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.timestamp)))
      .range([0, initialWidth]);

    // Y scale (price for candlesticks, SMA, and signals)
    const yPrice = d3
      .scaleLinear()
      .domain([
        d3.min(data, (d) => Math.min(d.open || d.close, d.close)) || 0,
        d3.max(data, (d) => Math.max(d.open || d.close, d.close)) || 0,
      ])
      .nice()
      .range([height, 0]);

    // Axes (only x-axis, no left y-axis)
    const xAxis = svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(30).tickFormat(d3.timeFormat('%b %d'))) // Daily ticks
      .style('color', '#848e9c'); // Light gray text

    // Rotate and adjust x-axis labels
    xAxis.selectAll('text')
      .style('text-anchor', 'end')
      .attr('transform', 'rotate(-45)')
      .attr('dx', '-0.8em')
      .attr('dy', '0.15em');

    // Candlesticks (only Open-Close body, no High-Low wicks, brighter colors, day-wise spacing)
    const candlestick = svg
      .selectAll('.candlestick')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'candlestick')
      .attr('transform', (d) => `translate(${x(new Date(d.timestamp))},0)`);

    // Open-Close body (adjusted for day-wise visibility, using live close price)
    candlestick
      .append('rect')
      .attr('x', -3) // Narrower for better daily spacing
      .attr('width', 6) // Slightly narrower for clarity over ~120 days
      .attr('y', (d) => yPrice(Math.max(d.open || d.close, d.close)))
      .attr('height', (d) =>
        (d.open || d.close) === d.close ? 1 : Math.abs(yPrice(d.open || d.close) - yPrice(d.close))
      )
      .attr('fill', (d) => (d.close >= (d.open || d.close) ? '#0ECB81' : '#F6465D')); // Bright green/red from SVG

    // SMA Points (blue dots, no line, like in the image)
    svg
      .selectAll('.sma-dot')
      .data(data.filter((d) => d.sma !== null))
      .enter()
      .append('circle')
      .attr('class', 'sma-dot')
      .attr('cx', (d) => x(new Date(d.timestamp)))
      .attr('cy', (d) => yPrice(d.sma))
      .attr('r', 3)
      .attr('fill', '#0000ff'); // Bright blue dots

    // Buy Signals (yellow dots, matching request)
    signalDots = svg
      .selectAll('.buy-signal-dot')
      .data(signals.filter((s) => s.type === 'buy'))
      .enter()
      .append('text')
      .attr('x', (d) => x(new Date(d.timestamp)))
      .attr('y', (d) => yPrice(d.price) - 10) // Position above candlestick
      .attr('text-anchor', 'middle')
      .attr('font-size', '55px')
      .attr('fill', '#ffff00') // Yellow dots, as requested
      .text('.');

    // Sell Signals (purple dots with red blurred ellipses, matching SVG)
    const sellSignalsData = signals.filter((s) => s.type === 'sell');
    signalDots = svg
      .selectAll('.sell-signal-dot')
      .data(sellSignalsData)
      .enter()
      .append('text')
      .attr('x', (d) => x(new Date(d.timestamp)))
      .attr('y', (d) => yPrice(d.price) + 10) // Position below candlestick
      .attr('text-anchor', 'middle')
      .attr('font-size', '55px')
      .attr('fill', '#800080') // Purple dots, matching SVG
      .text('.');

    // Add red blurred ellipses for sell signals
    sellEllipses = svg
      .selectAll('.sell-ellipse')
      .data(sellSignalsData)
      .enter()
      .append('ellipse')
      .attr('cx', (d) => x(new Date(d.timestamp)))
      .attr('cy', (d) => yPrice(d.price)) // Center on sell dot
      .attr('rx', 15) // Horizontal radius
      .attr('ry', 8) // Vertical radius
      .attr('fill', '#ff0000') // Red, matching SVG
      .style('filter', 'blur(8px)'); // Blurred effect, matching SVG

    // Buy Confirmation Signals (green blurred ellipses, matching SVG)
    const buyConfirmations = signals.filter((s) => s.type === 'buy' && Math.random() < 0.5); // Simplified logic for demo
    buyEllipses = svg
      .selectAll('.buy-ellipse')
      .data(buyConfirmations)
      .enter()
      .append('ellipse')
      .attr('cx', (d) => x(new Date(d.timestamp)))
      .attr('cy', (d) => yPrice(d.price) - 10) // Align with buy dot
      .attr('rx', 15) // Horizontal radius
      .attr('ry', 8) // Vertical radius
      .attr('fill', '#00ff00') // Green, matching SVG
      .style('filter', 'blur(6px)'); // Blurred effect, matching SVG

    // Title with coin name and live price, styled to match image
    const livePrice = livePrices[coinData.symbol] || data[data.length - 1]?.close.toFixed(2);
    svg
      .append('text')
      .attr('x', initialWidth / 2)
      .attr('y', -10) // Position higher to match "BAJAJ FINANCE : 7300.00" image
      .attr('text-anchor', 'middle')
      .style('font-size', '14px') // Match image font size
      .style('font-weight', 'bold')
      .attr('fill', '#ffff00') // Bright yellow, matching image
      .text(`${coinData.symbol} : ${livePrice}`);

    // Responsive design for each chart
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      let newWidth;

      if (screenWidth < 768) {
        newWidth = screenWidth * 0.9 - margin.left - margin.right; // 90% of mobile screen width
      } else {
        newWidth = 1200 - margin.left - margin.right; // Fixed 1200px for laptop
      }

      svg.attr('width', newWidth + margin.left + margin.right);
      x.range([0, newWidth]);
      xAxis.call(d3.axisBottom(x).ticks(30).tickFormat(d3.timeFormat('%b %d')));
      candlestick.attr('transform', (d) => `translate(${x(new Date(d.timestamp))},0)`);
      svg.selectAll('.sma-dot').attr('cx', (d) => x(new Date(d.timestamp)));
      signalDots.attr('x', (d) => x(new Date(d.timestamp)));
      sellEllipses.attr('cx', (d) => x(new Date(d.timestamp)));
      buyEllipses.attr('cx', (d) => x(new Date(d.timestamp)));
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => window.removeEventListener('resize', handleResize); // Cleanup
  }, [coinsData, loading, livePrices, liveData]); // Added liveData to dependencies for dynamic signals

  // Draw charts for all coins when data, live prices, or live data change
  useEffect(() => {
    if (!loading && coinsData.length > 0) {
      chartRefs.current = chartRefs.current.slice(0, coinsData.length); // Ensure refs match number of coins
      coinsData.forEach((coin, index) => {
        if (!chartRefs.current[index]) {
          chartRefs.current[index] = React.createRef();
        }
        drawChart(coin, chartRefs.current[index].current);
      });
    }
  }, [coinsData, loading, livePrices, liveData, drawChart]);

  if (loading) return <div className="text-white bg-gray-900 p-4">Loading...</div>;
  if (error) return <div className="text-red-500 bg-gray-900 p-4">{error}</div>;

  return (
    <div className="bg-gray-900 min-h-screen p-5">
      <h1 className="text-2xl text-yellow-300 mb-4 md:text-3xl">Top 20 Coins - Candlestick Charts with Signals (Daily)</h1>
      <div className="overflow-y-auto max-h-[80vh] space-y-6">
        {coinsData.map((coin, index) => (
          <div key={coin.symbol} className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <div className="mb-4 flex items-center justify-center">
              <span className="text-xl font-bold text-yellow-300">
                {coin.symbol}
              </span>
              <span className="ml-4 text-xl font-semibold text-white animate-pulse">
                Price: ${livePrices[coin.symbol] || coin.data[coin.data.length - 1]?.close.toFixed(2)}
              </span>
            </div>
            <div ref={chartRefs.current[index] || (chartRefs.current[index] = React.createRef())} className="w-full mx-auto md:w-[1200px]"></div>
          </div>
        ))}
      </div>
    </div>
  );
}