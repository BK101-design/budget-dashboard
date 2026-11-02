// 50/30/20 budget + live investments dashboard.
// Zero-dependency Node server: serves the UI and proxies Trading 212 + market quotes,
// so your API key never touches the browser.
//
//   node server.js        -> http://localhost:3212
//
// Configure in .env (see .env.example). With no key it runs in demo mode.

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- config ----------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3212);
const KEY = process.env.T212_API_KEY || '';
const SECRET = process.env.T212_API_SECRET || '';
const T212_BASE = process.env.T212_ENV === 'demo'
  ? 'https://demo.trading212.com/api/v0'
  : 'https://live.trading212.com/api/v0';
const DEMO = !KEY;

// Newer Trading 212 keys come as key + secret (HTTP Basic); older ones are a bare key.
const AUTH = SECRET ? 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64') : KEY;

// ---------- small helpers ----------
function cached(ttlMs, fn) {
  let value, at = 0, inflight = null;
  return async () => {
    if (value !== undefined && Date.now() - at < ttlMs) return value;
    if (inflight) return inflight;
    inflight = fn().then(v => { value = v; at = Date.now(); return v; })
      .finally(() => { inflight = null; });
    return inflight;
  };
}

async function t212(endpoint) {
  const res = await fetch(T212_BASE + endpoint, { headers: { Authorization: AUTH } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Trading 212 ${endpoint} -> ${res.status} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (budget-dashboard)' };
const quoteCache = new Map(); // symbol -> { at, data }

async function yahooQuote(symbol) {
  const hit = quoteCache.get(symbol);
  if (hit && Date.now() - hit.at < 15000) return hit.data;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`quote ${symbol} -> ${res.status}`);
  const json = await res.json();
  const r = json.chart && json.chart.result && json.chart.result[0];
  if (!r) throw new Error(`no data for ${symbol}`);
  const m = r.meta;
  const data = {
    symbol: m.symbol,
    name: m.shortName || m.longName || m.symbol,
    price: m.regularMarketPrice,
    prevClose: m.chartPreviousClose ?? m.previousClose,
    currency: m.currency,
    marketState: m.marketState || null,
  };
  quoteCache.set(symbol, { at: Date.now(), data });
  return data;
}

// FX: convert an amount in `from` currency to `to`. GBX (pence) handled as GBP/100.
async function fxRate(from, to) {
  if (!from || !to) return 1;
  let mult = 1;
  if (from === 'GBX') { from = 'GBP'; mult = 0.01; }
  if (from === to) return mult;
  try {
    const q = await yahooQuote(`${from}${to}=X`);
    return q.price * mult;
  } catch {
    return mult; // best effort
  }
}

// ---------- Trading 212 ----------
// Rate limits: portfolio 1/5s, cash 1/2s, info 1/30s, instruments 1/50s.
const getPortfolio = cached(5000, () => t212('/equity/portfolio'));
const getCash = cached(5000, () => t212('/equity/account/cash'));
const getInfo = cached(10 * 60 * 1000, () => t212('/equity/account/info'));
const getInstruments = cached(6 * 60 * 60 * 1000, async () => {
  const list = await t212('/equity/metadata/instruments');
  const map = {};
  for (const i of list) map[i.ticker] = { name: i.name, currency: i.currencyCode, short: i.shortName };
  return map;
});

async function livePortfolio() {
  const [positions, cash, info] = await Promise.all([getPortfolio(), getCash(), getInfo()]);
  const instruments = await getInstruments().catch(() => ({}));
  const acct = info.currencyCode || 'GBP';

  const rates = {};
  const out = [];
  for (const p of positions) {
    const meta = instruments[p.ticker] || {};
    const ccy = meta.currency || acct;
    if (!(ccy in rates)) rates[ccy] = await fxRate(ccy, acct);
    const valueLocal = p.quantity * p.currentPrice;
    const ppl = (p.ppl || 0) + (p.fxPpl || 0); // already in account currency
    const value = valueLocal * rates[ccy];
    out.push({
      ticker: p.ticker,
      symbol: meta.short || p.ticker.split('_')[0],
      name: meta.name || p.ticker,
      qty: p.quantity,
      avgPrice: p.averagePrice,
      price: p.currentPrice,
      priceCurrency: ccy,
      value,
      ppl,
      pplPct: value - ppl > 0 ? (ppl / (value - ppl)) * 100 : 0,
    });
  }
  return {
    source: 'trading212',
    currency: acct,
    cash: { free: cash.free, invested: cash.invested, ppl: cash.ppl, total: cash.total },
    positions: out.sort((a, b) => b.value - a.value),
    ts: Date.now(),
  };
}

// ---------- demo mode: a random walk so the UI moves like a market ----------
const demo = require('./public/demo.js').createDemo();
setInterval(demo.tick, 3000);

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/portfolio') {
      return send(res, 200, DEMO ? demo.snapshot() : await livePortfolio());
    }
    if (url.pathname === '/api/quotes') {
      const symbols = (url.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
      const to = url.searchParams.get('currency') || 'GBP';
      const results = await Promise.all(symbols.map(async s => {
        try {
          const q = await yahooQuote(s);
          return { ...q, fx: await fxRate(q.currency, to) };
        } catch (e) { return { symbol: s, error: e.message }; }
      }));
      return send(res, 200, { quotes: results, ts: Date.now() });
    }
    if (url.pathname === '/api/status') {
      return send(res, 200, { demo: DEMO, env: process.env.T212_ENV === 'demo' ? 'practice' : 'live' });
    }

    // static files from ./public
    const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file)) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? 401 : e.status === 429 ? 429 : 502;
    send(res, status, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Budget dashboard on http://localhost:${PORT}  (${DEMO ? 'DEMO mode – add T212_API_KEY to .env for live data' : 'Trading 212 ' + (process.env.T212_ENV === 'demo' ? 'practice' : 'live')})`);
});
