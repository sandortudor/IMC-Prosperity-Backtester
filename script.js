// Global variable to hold parsed CSV data
let csvData = [];

// Populate product dropdown based on CSV data
function populateProductDropdown() {
  const productSelect = document.getElementById("productSelect");
  productSelect.innerHTML = ""; // Clear existing options
  let products = new Set(csvData.map(row => row.product));
  products.forEach(prod => {
    let option = document.createElement("option");
    option.value = prod;
    option.text = prod;
    productSelect.appendChild(option);
  });
  console.log("Products found:", Array.from(products));
}

// Compute summary statistics for a given product (from market data)
function computeSummary(product) {
  let productData = csvData.filter(row => row.product === product);
  if (productData.length === 0) return null;
  let midPrices = productData.map(row => row.mid_price);
  let avgMid = midPrices.reduce((a, b) => a + b, 0) / midPrices.length;
  let spreads = productData.map(row => row.ask_price_1 - row.bid_price_1);
  let avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  let volatility = Math.sqrt(midPrices.map(x => Math.pow(x - avgMid, 2)).reduce((a, b) => a + b, 0) / midPrices.length);
  return { avgMid, avgSpread, volatility, count: productData.length };
}

// Update summary panel based on selected product
function updateSummary() {
  const product = document.getElementById("productSelect").value;
  let summary = computeSummary(product);
  let summaryPanel = document.getElementById("summaryPanel");
  if (summary) {
    summaryPanel.innerHTML = `<h3>Market Summary for ${product}</h3>
      <p><strong>Records:</strong> ${summary.count}</p>
      <p><strong>Average Mid Price:</strong> ${summary.avgMid.toFixed(2)}</p>
      <p><strong>Average Spread:</strong> ${summary.avgSpread.toFixed(2)}</p>
      <p><strong>Volatility (Std Dev):</strong> ${summary.volatility.toFixed(2)}</p>`;
  } else {
    summaryPanel.innerHTML = `<p>No market data available for ${product}</p>`;
  }
}

// Compute trade history summary (from past trade records)
function updateTradeHistorySummary() {
  const product = document.getElementById("productSelect").value;
  let tradeData = csvData.filter(row => row.product === product && row.profit_and_loss !== undefined && row.profit_and_loss !== null);
  let tradePanel = document.getElementById("tradeHistoryPanel");
  if (tradeData.length === 0) {
    tradePanel.innerHTML = `<h3>Trade History for ${product}</h3><p>No trade history data available.</p>`;
    tradePanel.classList.remove("hidden");
    return;
  }
  
  let numTrades = tradeData.length;
  let totalProfit = tradeData.reduce((sum, row) => sum + Number(row.profit_and_loss), 0);
  let avgProfit = totalProfit / numTrades;
  let maxProfit = Math.max(...tradeData.map(row => Number(row.profit_and_loss)));
  let minProfit = Math.min(...tradeData.map(row => Number(row.profit_and_loss)));
  
  tradePanel.innerHTML = `<h3>Trade History Summary for ${product}</h3>
    <p><strong>Number of Trades:</strong> ${numTrades}</p>
    <p><strong>Total Profit:</strong> ${totalProfit.toFixed(2)}</p>
    <p><strong>Average Profit per Trade:</strong> ${avgProfit.toFixed(2)}</p>
    <p><strong>Best Trade Profit:</strong> ${maxProfit.toFixed(2)}</p>
    <p><strong>Worst Trade Profit:</strong> ${minProfit.toFixed(2)}</p>`;
  tradePanel.classList.remove("hidden");
}

// Utility: Compute rolling average for an array given a window size
function rollingAverage(arr, windowSize) {
  let result = [];
  for (let i = 0; i < arr.length; i++) {
    let start = Math.max(0, i - windowSize + 1);
    let subset = arr.slice(start, i + 1);
    let avg = subset.reduce((a, b) => a + b, 0) / subset.length;
    result.push(avg);
  }
  return result;
}

// Generate signals for a given product's data
function generateSignals(data, fastWindow, slowWindow, threshold) {
  // Assume data is sorted by time (we use index as time)
  let midPrices = data.map(row => row.mid_price);
  let MA_fast = rollingAverage(midPrices, fastWindow);
  let MA_slow = rollingAverage(midPrices, slowWindow);
  
  for (let i = 0; i < data.length; i++) {
    data[i].MA_fast = MA_fast[i];
    data[i].MA_slow = MA_slow[i];
    let diff = MA_fast[i] - MA_slow[i];
    if (diff > threshold) {
      data[i].signal = 1;
    } else if (diff < -threshold) {
      data[i].signal = -1;
    } else {
      data[i].signal = 0;
    }
  }
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      data[i].crossover = 0;
    } else {
      data[i].crossover = data[i].signal - data[i-1].signal;
    }
  }
  return data;
}

// Compute RSI for an array of prices using a simple method
function computeRSI(prices, period = 14) {
  let rsi = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      rsi.push(null);
    } else {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        let change = prices[j] - prices[j - 1];
        if (change > 0) {
          gains += change;
        } else {
          losses += Math.abs(change);
        }
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      let rsiValue = 100 - (100 / (1 + rs));
      rsi.push(rsiValue);
    }
  }
  return rsi;
}

// Simple backtesting simulation
function backtest(data, tradeSize) {
  let position = 0;
  let entryPrice = 0;
  let cumPnl = 0;
  let pnlArray = [];
  
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    if (row.crossover === 2) {
      if (position !== 0) {
        cumPnl += (row.mid_price - entryPrice) * position;
        position = 0;
      }
      position = tradeSize;
      entryPrice = row.mid_price;
    } else if (row.crossover === -2) {
      if (position !== 0) {
        cumPnl += (row.mid_price - entryPrice) * position;
        position = 0;
      }
      position = -tradeSize;
      entryPrice = row.mid_price;
    }
    let unrealized = position !== 0 ? (row.mid_price - entryPrice) * position : 0;
    pnlArray.push(cumPnl + unrealized);
    row.cumulative_pnl = cumPnl + unrealized;
  }
  return data;
}

// Generate recommendations based on MA crossover and RSI
function generateRecommendation(processedData, threshold) {
  let last = processedData[processedData.length - 1];
  let diff = last.MA_fast - last.MA_slow;
  let maRec = diff > threshold ? "BUY" : (diff < -threshold ? "SELL" : "HOLD");
  
  let midPrices = processedData.map(row => row.mid_price);
  let rsiValues = computeRSI(midPrices, 14);
  let lastRSI = rsiValues[rsiValues.length - 1];
  let rsiRec = "HOLD";
  if (lastRSI !== null) {
    if (lastRSI < 30) {
      rsiRec = "BUY";
    } else if (lastRSI > 70) {
      rsiRec = "SELL";
    }
  }
  
  let finalRec = (maRec === rsiRec) ? maRec : "HOLD";
  return {
    maRecommendation: maRec,
    rsiRecommendation: rsiRec,
    finalRecommendation: finalRec,
    lastRSI: lastRSI,
    diff: diff
  };
}

// Update plots and recommendation panel based on current widget values
function updatePlots() {
  const product = document.getElementById("productSelect").value;
  const fastWindow = parseInt(document.getElementById("fastWindow").value);
  const slowWindow = parseInt(document.getElementById("slowWindow").value);
  const threshold = parseFloat(document.getElementById("threshold").value);
  const tradeSize = parseInt(document.getElementById("tradeSize").value);
  
  let productData = csvData.filter(row => row.product === product);
  productData.sort((a, b) => {
    if (a.day === b.day) {
      return a.timestamp - b.timestamp;
    }
    return a.day - b.day;
  });
  
  if (productData.length === 0) {
    console.warn("No data for product:", product);
    return;
  }
  
  let processedData = generateSignals(productData, fastWindow, slowWindow, threshold);
  processedData = backtest(processedData, tradeSize);
  
  let xData = processedData.map((row, idx) => idx);
  let midPrices = processedData.map(row => row.mid_price);
  let MA_fast = processedData.map(row => row.MA_fast);
  let MA_slow = processedData.map(row => row.MA_slow);
  let cumulativePnl = processedData.map(row => row.cumulative_pnl);
  
  let buyIndices = [];
  let buyPrices = [];
  let sellIndices = [];
  let sellPrices = [];
  processedData.forEach((row, idx) => {
    if (row.crossover === 2) {
      buyIndices.push(idx);
      buyPrices.push(row.mid_price);
    } else if (row.crossover === -2) {
      sellIndices.push(idx);
      sellPrices.push(row.mid_price);
    }
  });
  
  let priceTrace = {
    x: xData,
    y: midPrices,
    mode: 'lines',
    name: 'Mid Price',
    hovertemplate: 'Index: %{x}<br>Mid Price: %{y:.2f}'
  };
  let fastTrace = {
    x: xData,
    y: MA_fast,
    mode: 'lines',
    name: `MA Fast (${fastWindow})`,
    hovertemplate: 'Index: %{x}<br>MA Fast: %{y:.2f}'
  };
  let slowTrace = {
    x: xData,
    y: MA_slow,
    mode: 'lines',
    name: `MA Slow (${slowWindow})`,
    hovertemplate: 'Index: %{x}<br>MA Slow: %{y:.2f}'
  };
  let buyTrace = {
    x: buyIndices,
    y: buyPrices,
    mode: 'markers',
    name: 'BUY Signal',
    marker: { symbol: 'triangle-up', color: 'green', size: 12 },
    hovertemplate: 'Index: %{x}<br>BUY at: %{y:.2f}'
  };
  let sellTrace = {
    x: sellIndices,
    y: sellPrices,
    mode: 'markers',
    name: 'SELL Signal',
    marker: { symbol: 'triangle-down', color: 'red', size: 12 },
    hovertemplate: 'Index: %{x}<br>SELL at: %{y:.2f}'
  };
  
  let priceLayout = {
    title: `${product} Price & Moving Averages`,
    xaxis: { title: 'Time Index' },
    yaxis: { title: 'Price' },
    hovermode: 'x unified',
    paper_bgcolor: '#121212',
    plot_bgcolor: '#121212',
    font: { color: '#e0e0e0' }
  };
  
  Plotly.newPlot('priceChart', [priceTrace, fastTrace, slowTrace, buyTrace, sellTrace], priceLayout);
  
  let pnlTrace = {
    x: xData,
    y: cumulativePnl,
    mode: 'lines',
    name: 'Cumulative PnL',
    hovertemplate: 'Index: %{x}<br>PnL: %{y:.2f}'
  };
  let pnlLayout = {
    title: `${product} Cumulative PnL`,
    xaxis: { title: 'Time Index' },
    yaxis: { title: 'PnL' },
    hovermode: 'x unified',
    paper_bgcolor: '#121212',
    plot_bgcolor: '#121212',
    font: { color: '#e0e0e0' }
  };
  Plotly.newPlot('pnlChart', [pnlTrace], pnlLayout);
  
  let rsiValues = computeRSI(midPrices, 14);
  let rsiTrace = {
    x: xData,
    y: rsiValues,
    mode: 'lines',
    name: 'RSI (14)',
    hovertemplate: 'Index: %{x}<br>RSI: %{y:.2f}'
  };
  let rsiLayout = {
    title: `${product} RSI (14)`,
    xaxis: { title: 'Time Index' },
    yaxis: { title: 'RSI' },
    hovermode: 'x unified',
    paper_bgcolor: '#121212',
    plot_bgcolor: '#121212',
    font: { color: '#e0e0e0' }
  };
  Plotly.newPlot('rsiChart', [rsiTrace], rsiLayout);
  
  let rec = generateRecommendation(processedData, threshold);
  let recommendationPanel = document.getElementById("recommendationPanel");
  recommendationPanel.classList.remove("hidden");
  recommendationPanel.innerHTML = `<h3>Recommendation for ${product}</h3>
    <p><strong>MA Signal:</strong> ${rec.maRecommendation} (MA diff: ${rec.diff.toFixed(2)})</p>
    <p><strong>RSI Value:</strong> ${rec.lastRSI !== null ? rec.lastRSI.toFixed(2) : "N/A"} (${rec.rsiRecommendation})</p>
    <p><strong>Final Recommendation:</strong> ${rec.finalRecommendation}</p>`;
  
  updateTradeHistorySummary();
}

// Event listener for file upload using PapaParse
document.getElementById("csvUpload").addEventListener("change", function(e) {
  let file = e.target.files[0];
  if (file) {
    Papa.parse(file, {
      header: true,
      delimiter: ";",
      dynamicTyping: true,
      complete: function(results) {
        csvData = results.data;
        console.log("CSV Data Loaded:", csvData);
        csvData.forEach((row, idx) => {
          row.mid_price = Number(row.mid_price);
          if (isNaN(row.mid_price) && idx > 0) {
            row.mid_price = csvData[idx - 1].mid_price;
          }
          row.bid_price_1 = Number(row.bid_price_1);
          row.ask_price_1 = Number(row.ask_price_1);
        });
        populateProductDropdown();
        document.getElementById("controls").classList.remove("hidden");
        document.getElementById("plots").classList.remove("hidden");
        document.getElementById("summaryPanel").classList.remove("hidden");
        updateSummary();
        updatePlots();
      },
      error: function(err) {
        console.error("Error parsing CSV:", err);
      }
    });
  }
});

// Event listeners for update buttons
document.getElementById("updateButton").addEventListener("click", updatePlots);
document.getElementById("updateSummary").addEventListener("click", () => {
  updateSummary();
  updateTradeHistorySummary();
});
