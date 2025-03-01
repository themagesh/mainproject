"use client"; // Add this directive at the top

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const CandlestickChart = ({ coinData, livePrice, liveData }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!coinData || !chartRef.current) return;

    const drawChart = () => {
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
        if (prev.sma !== null && current.sma !== null) {
          if (current.close > current.sma && prev.close <= prev.sma) {
            return { timestamp: current.timestamp, type: 'buy', price: current.close };
          }
          if (current.close < current.sma && prev.close >= prev.sma) {
            return { timestamp: current.timestamp, type: 'sell', price: current.close };
          }
        }
        return null;
      }).filter(signal => signal !== null);

      const margin = { top: 20, right: 20, bottom: 50, left: 0 };
      const initialWidth = 1200 - margin.left - margin.right;
      const height = 400 - margin.top - margin.bottom;

      d3.select(chartRef.current).selectAll('*').remove();

      const svg = d3
        .select(chartRef.current)
        .append('svg')
        .attr('width', initialWidth + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .style('background-color', '#1a1a1a')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      const x = d3
        .scaleTime()
        .domain(d3.extent(data, d => new Date(d.timestamp)))
        .range([0, initialWidth]);

      const yPrice = d3
        .scaleLinear()
        .domain([
          d3.min(data, d => Math.min(d.open || d.close, d.close)) || 0,
          d3.max(data, d => Math.max(d.open || d.close, d.close)) || 0,
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
        .attr('transform', d => `translate(${x(new Date(d.timestamp))},0)`);

      candlestick
        .append('rect')
        .attr('x', -3)
        .attr('width', 6)
        .attr('y', d => yPrice(Math.max(d.open || d.close, d.close)))
        .attr('height', d =>
          (d.open || d.close) === d.close ? 1 : Math.abs(yPrice(d.open || d.close) - yPrice(d.close))
        )
        .attr('fill', d => (d.close >= (d.open || d.close) ? '#0ECB81' : '#F6465D'));

      svg
        .selectAll('.sma-dot')
        .data(data.filter(d => d.sma !== null))
        .enter()
        .append('circle')
        .attr('class', 'sma-dot')
        .attr('cx', d => x(new Date(d.timestamp)))
        .attr('cy', d => yPrice(d.sma))
        .attr('r', 3)
        .attr('fill', '#0000ff');

      const signalDots = svg
        .selectAll('.buy-signal-dot')
        .data(signals.filter(s => s.type === 'buy'))
        .enter()
        .append('text')
        .attr('x', d => x(new Date(d.timestamp)))
        .attr('y', d => yPrice(d.price) - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '55px')
        .attr('fill', '#ffff00')
        .text('.');

      const sellSignalsData = signals.filter(s => s.type === 'sell');
      svg
        .selectAll('.sell-signal-dot')
        .data(sellSignalsData)
        .enter()
        .append('text')
        .attr('x', d => x(new Date(d.timestamp)))
        .attr('y', d => yPrice(d.price) + 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '55px')
        .attr('fill', '#800080')
        .text('.');

      svg
        .selectAll('.sell-ellipse')
        .data(sellSignalsData)
        .enter()
        .append('ellipse')
        .attr('cx', d => x(new Date(d.timestamp)))
        .attr('cy', d => yPrice(d.price))
        .attr('rx', 15)
        .attr('ry', 8)
        .attr('fill', '#ff0000')
        .style('filter', 'blur(8px)');

      const buyConfirmations = signals.filter(s => s.type === 'buy' && Math.random() < 0.5);
      svg
        .selectAll('.buy-ellipse')
        .data(buyConfirmations)
        .enter()
        .append('ellipse')
        .attr('cx', d => x(new Date(d.timestamp)))
        .attr('cy', d => yPrice(d.price) - 10)
        .attr('rx', 15)
        .attr('ry', 8)
        .attr('fill', '#00ff00')
        .style('filter', 'blur(6px)');

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
        const newWidth = screenWidth < 768 
          ? screenWidth * 0.9 - margin.left - margin.right 
          : initialWidth;

        svg.attr('width', newWidth + margin.left + margin.right);
        x.range([0, newWidth]);
        xAxis.call(d3.axisBottom(x).ticks(30).tickFormat(d3.timeFormat('%b %d')));
        candlestick.attr('transform', d => `translate(${x(new Date(d.timestamp))},0)`);
        svg.selectAll('.sma-dot').attr('cx', d => x(new Date(d.timestamp)));
        signalDots.attr('x', d => x(new Date(d.timestamp)));
      };

      window.addEventListener('resize', handleResize);
      handleResize();

      return () => window.removeEventListener('resize', handleResize);
    };

    drawChart();
  }, [coinData, livePrice, liveData]);

  return (
    <div 
      ref={chartRef} 
      className="w-full mx-auto md:w-[1200px]"
    ></div>
  );
};

export default CandlestickChart;