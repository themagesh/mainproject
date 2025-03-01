'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import * as d3 from 'd3';

export default function Home() {
  const [coinsData, setCoinsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [liveData, setLiveData] = useState({});
  const chartRefs = useRef([]);

  // Fetch initial coin data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:8000/indicators/top-coins/', {
          params: { interval: '1h', limit: 90 },
        });

        const coins = response.data;
        setCoinsData(coins);

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

    const updateInterval = setInterval(() => {
      setLivePrices(prevPrices => {
        const updatedPrices = {};
        const updatedData = {};
        coinsData.forEach(coin => {
          const latestPrice = coin.data[coin.data.length - 1]?.close || prevPrices[coin.symbol] || 0;
          const fluctuation = latestPrice * (Math.random() * 0.01 - 0.005);
          const newPrice = Math.max(0, latestPrice + fluctuation).toFixed(2);
          updatedPrices[coin.symbol] = newPrice;

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
    }, 1800000);

    return () => clearInterval(updateInterval);
  }, [coinsData]);

  const calculateSMA = (prices, period = 5) => {
    if (prices.length < period) return 0;
    const sum = prices.slice(-period).reduce((sum, price) => sum + price, 0);
    return sum / period;
  };

  const drawChart = useCallback((coinData, chartRef) => {
    if (!coinData || !chartRef) return;

    const historicalData = coinData.data.slice(0, -1);
    const livePoint = liveData[coinData.symbol] || {
      close: coinData.data[coinData.data.length - 1]?.close || 0,
      sma: coinData.data[coinData.data.length - 1]?.sma || 0,
      timestamp: new Date().toISOString(),
    };
    const data = [...historicalData, livePoint];

    const signals = data.map((d, i) => {
      if (i < 1) return null;
      const prev = data[i - 1];
      const current = d;
      const prevSma = prev.sma;
      const currentSma = current.sma;

      if (prevSma !== null && currentSma !== null) {
        if (current.close > currentSma && prev.close <= prev.sma) {
          return { timestamp: current.timestamp, type: 'buy', price: current.close };
        }
        if (current.close < currentSma && prev.close >= prev.sma) {
          return { timestamp: current.timestamp, type: 'sell', price: current.close };
        }
      }
      return null;
    }).filter((signal) => signal !== null);

    let signalDots, sellEllipses, buyEllipses;

    const margin = { top: 20, right: 20, bottom: 50, left: 0 };
    const initialWidth = 1200 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    d3.select(chartRef).selectAll('*').remove();

    const svg = d3
      .select(chartRef)
      .append('svg')
      .attr('width', initialWidth + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .style('background-color', '#1a1a1a')
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.timestamp)))
      .range([0, initialWidth]);

    const yPrice = d3
      .scaleLinear()
      .domain([
        d3.min(data, (d) => Math.min(d.open || d.close, d.close)) || 0,
        d3.max(data, (d) => Math.max(d.open || d.close, d.close)) || 0,
      ])
      .nice()
      .range([height, 0]);

    const xAxis = svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(30).tickFormat(d3.timeFormat('%b %d')))
      .style('color', '#848e9c');

    xAxis.selectAll('text')
      .style('text-anchor', 'end')
      .attr('transform', 'rotate(-45)')
      .attr('dx', '-0.8em')
      .attr('dy', '0.15em');

    const candlestick = svg
      .selectAll('.candlestick')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'candlestick')
      .attr('transform', (d) => `translate(${x(new Date(d.timestamp))},0)`);

    candlestick
      .append('rect')
      .attr('x', -3)
      .attr('width', 6)
      .attr('y', (d) => yPrice(Math.max(d.open || d.close, d.close)))
      .attr('height', (d) =>
        (d.open || d.close) === d.close ? 1 : Math.abs(yPrice(d.open || d.close) - yPrice(d.close))
      )
      .attr('fill', (d) => (d.close >= (d.open || d.close) ? '#0ECB81' : '#F6465D'));

    svg
      .selectAll('.sma-dot')
      .data(data.filter((d) => d.sma !== null))
      .enter()
      .append('circle')
      .attr('class', 'sma-dot')
      .attr('cx', (d) => x(new Date(d.timestamp)))
      .attr('cy', (d) => yPrice(d.sma))
      .attr('r', 3)
      .attr('fill', '#0000ff');

    signalDots = svg
      .selectAll('.buy-signal-dot')
      .data(signals.filter((s) => s.type === 'buy'))
      .enter()
      .append('text')
      .attr('x', (d) => x(new Date(d.timestamp)))
      .attr('y', (d) => yPrice(d.price) - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '55px')
      .attr('fill', '#ffff00')
      .text('.');

    const sellSignalsData = signals.filter((s) => s.type === 'sell');
    signalDots = svg
      .selectAll('.sell-signal-dot')
      .data(sellSignalsData)
      .enter()
      .append('text')
      .attr('x', (d) => x(new Date(d.timestamp)))
      .attr('y', (d) => yPrice(d.price) + 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '55px')
      .attr('fill', '#800080')
      .text('.');

    sellEllipses = svg
      .selectAll('.sell-ellipse')
      .data(sellSignalsData)
      .enter()
      .append('ellipse')
      .attr('cx', (d) => x(new Date(d.timestamp)))
      .attr('cy', (d) => yPrice(d.price))
      .attr('rx', 15)
      .attr('ry', 8)
      .attr('fill', '#ff0000')
      .style('filter', 'blur(8px)');

    const buyConfirmations = signals.filter((s) => s.type === 'buy' && Math.random() < 0.5);
    buyEllipses = svg
      .selectAll('.buy-ellipse')
      .data(buyConfirmations)
      .enter()
      .append('ellipse')
      .attr('cx', (d) => x(new Date(d.timestamp)))
      .attr('cy', (d) => yPrice(d.price) - 10)
      .attr('rx', 15)
      .attr('ry', 8)
      .attr('fill', '#00ff00')
      .style('filter', 'blur(6px)');

    const livePrice = livePrices[coinData.symbol] || data[data.length - 1]?.close.toFixed(2);
    svg
      .append('text')
      .attr('x', initialWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .attr('fill', '#ffff00')
      .text(`${coinData.symbol} : ${livePrice}`);

    const handleResize = () => {
      const screenWidth = window.innerWidth;
      let newWidth;

      if (screenWidth < 768) {
        newWidth = screenWidth * 0.9 - margin.left - margin.right;
      } else {
        newWidth = 1200 - margin.left - margin.right;
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
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [coinsData, loading, livePrices, liveData]);

  useEffect(() => {
    if (!loading && coinsData.length > 0) {
      chartRefs.current = chartRefs.current.slice(0, coinsData.length);
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
      <h1 className="text-2xl text-yellow-300 mb-4 md:text-3xl text-center">
        Top 20 Coins - Candlestick Charts with Signals (Daily 1h)
      </h1>
      <div className="w-full max-w-7xl mx-auto">
        {coinsData.map((coin, index) => (
          <div key={coin.symbol} className="bg-gray-800 p-4 rounded-lg shadow-lg mb-2">
            <div className="mb-4 flex items-center justify-center">
              <span className="text-xl font-bold text-yellow-300">{coin.symbol}</span>
              <span className="ml-4 text-xl font-semibold text-white animate-pulse">
                ${livePrices[coin.symbol] || '0.00'}
              </span>
            </div>
            <div
              ref={chartRefs.current[index] || (chartRefs.current[index] = React.createRef())}
              className="w-full mx-auto md:w-[1200px]"
            ></div>
          </div>
        ))}
      </div>
    </div>
  );
}