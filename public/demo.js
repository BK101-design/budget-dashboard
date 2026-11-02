// Simulated portfolio used when no Trading 212 key is configured.
// Runs in Node (server demo mode) and in the browser (static GitHub Pages demo).
(function (root) {
  const FX = { GBP: 1, USD: 0.79, GBX: 0.01 };

  function createDemo() {
    const free = 842.17;
    const positions = [
      { ticker: 'VUAGl_EQ', symbol: 'VUAG', name: 'Vanguard S&P 500 (Acc)', qty: 42.5, avgPrice: 78.2, price: 92.4, ccy: 'GBP' },
      { ticker: 'AAPL_US_EQ', symbol: 'AAPL', name: 'Apple', qty: 6.2, avgPrice: 182.5, price: 231.1, ccy: 'USD' },
      { ticker: 'MSFT_US_EQ', symbol: 'MSFT', name: 'Microsoft', qty: 3.1, avgPrice: 365, price: 418.3, ccy: 'USD' },
      { ticker: 'VWRPl_EQ', symbol: 'VWRP', name: 'Vanguard FTSE All-World (Acc)', qty: 25, avgPrice: 104.9, price: 117.6, ccy: 'GBP' },
      { ticker: 'NVDA_US_EQ', symbol: 'NVDA', name: 'NVIDIA', qty: 8, avgPrice: 118.4, price: 139.7, ccy: 'USD' },
      { ticker: 'RRl_EQ', symbol: 'RR', name: 'Rolls-Royce', qty: 120, avgPrice: 412, price: 538, ccy: 'GBX' },
    ];

    // One market-wide move plus a smaller move per stock, so holdings drift together like a real market.
    function tick() {
      const market = (Math.random() - 0.5) * 0.002;
      for (const p of positions) {
        const idio = (Math.random() - 0.5) * 0.004;
        p.price = Math.max(0.01, p.price * (1 + market + idio));
      }
    }

    function snapshot() {
      let invested = 0, ppl = 0;
      const out = positions.map(p => {
        const fx = FX[p.ccy];
        const value = p.qty * p.price * fx;
        const cost = p.qty * p.avgPrice * fx;
        invested += cost; ppl += value - cost;
        return {
          ticker: p.ticker, symbol: p.symbol, name: p.name, qty: p.qty,
          avgPrice: p.avgPrice, price: p.price, priceCurrency: p.ccy,
          value, ppl: value - cost, pplPct: ((value - cost) / cost) * 100,
        };
      });
      return {
        source: 'demo',
        currency: 'GBP',
        cash: { free, invested, ppl, total: free + invested + ppl },
        positions: out.sort((a, b) => b.value - a.value),
        ts: Date.now(),
      };
    }

    return { tick, snapshot };
  }

  // A plausible past day of account values ending at `endValue`, so the demo chart isn't empty.
  function backfill(endValue, hours = 24, stepMs = 5 * 60 * 1000) {
    const n = Math.floor((hours * 3600 * 1000) / stepMs);
    const now = Date.now();
    const pts = [];
    let v = endValue;
    for (let i = 0; i < n; i++) {
      pts.push([now - i * stepMs, +v.toFixed(2)]);
      v = v / (1 + (Math.random() - 0.48) * 0.003);
    }
    return pts.reverse();
  }

  const api = { createDemo, backfill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Demo = api;
})(this);
