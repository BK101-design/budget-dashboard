// ---------------- state ----------------
const STORE = 'wealth-dash-v1';
const defaults = {
  income: 2800,
  items: [
    { id: 1, name: 'Rent / mortgage', amount: 950, bucket: 'needs' },
    { id: 2, name: 'Bills & utilities', amount: 180, bucket: 'needs' },
    { id: 3, name: 'Groceries', amount: 260, bucket: 'needs' },
    { id: 4, name: 'Transport', amount: 90, bucket: 'needs' },
    { id: 5, name: 'Eating out', amount: 160, bucket: 'wants' },
    { id: 6, name: 'Subscriptions', amount: 45, bucket: 'wants' },
    { id: 7, name: 'Shopping & hobbies', amount: 220, bucket: 'wants' },
    { id: 8, name: 'Trading 212 ISA', amount: 300, bucket: 'savings' },
    { id: 9, name: 'Emergency fund', amount: 150, bucket: 'savings' },
  ],
  holds: [],
};
let state;
try { state = { ...defaults, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { state = { ...defaults }; }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };

let currency = 'GBP';
let portfolio = null;    // from /api/portfolio
let quotes = {};         // symbol -> quote
let lastPrices = {};     // for flash
let range = 86400000;

const BUCKETS = [
  { key: 'needs', label: 'Needs', pct: 0.5, color: 'var(--needs)', hint: 'Rent, bills, food, transport' },
  { key: 'wants', label: 'Wants', pct: 0.3, color: 'var(--wants)', hint: 'Fun, dining, shopping' },
  { key: 'savings', label: 'Savings', pct: 0.2, color: 'var(--savings)', hint: 'Investing, emergency fund, debt' },
];

const $ = id => document.getElementById(id);
const fmt = (n, c = currency, d) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: c === 'GBX' ? 'GBP' : c,
  minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2,
}).format(n);
const fmt0 = n => fmt(n, currency, 0);
const priceFmt = (p, c) => c === 'GBX' ? `${p.toFixed(2)}p` : fmt(p, c);
const signed = (n, f = fmt) => (n > 0 ? '▲ +' : n < 0 ? '▼ −' : '') + f(Math.abs(n));
const pct = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2) + '%';
const cls = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- budget ----------------
function renderBudget() {
  const income = Number(state.income) || 0;
  $('income').value = income || '';
  const sum = Budget.summarize(income, state.items);
  const total = sum.total;
  const spent = { needs: sum.buckets.needs.spent, wants: sum.buckets.wants.spent, savings: sum.buckets.savings.spent };

  $('kIncome').textContent = fmt0(income);
  $('kIncomeSub').textContent = `${fmt0(income * 12)} a year`;
  const left = sum.unallocated;
  $('kLeft').textContent = fmt0(left);
  $('kLeft').className = 'value ' + (left < 0 ? 'down' : '');
  $('kLeftSub').textContent = left < 0 ? 'Over budget – trim wants first' : left > 0 ? 'Unassigned – move it to savings?' : 'Every pound has a job';

  $('buckets').innerHTML = BUCKETS.map(b => {
    const { target, spent: s, ratio, onTrack } = sum.buckets[b.key];
    let status;
    if (b.key === 'savings') status = onTrack ? `✓ Target hit${s > target ? ` (+${fmt0(s - target)})` : ''}` : `${fmt0(target - s)} short of target`;
    else status = onTrack ? `${fmt0(target - s)} left` : `⚠ ${fmt0(s - target)} over`;
    const bad = !onTrack && b.key !== 'savings';
    return `<div class="card bucket">
      <div class="name"><span class="swatch" style="background:${b.color}"></span>${b.label} · ${b.pct * 100}%</div>
      <div class="amt">${fmt0(s)}</div>
      <div class="of">of ${fmt0(target)} · ${b.hint}</div>
      <div class="meter"><span style="width:${Math.min(100, ratio * 100)}%;background:${bad ? 'var(--down)' : b.color}"></span></div>
      <div class="status ${bad ? 'down' : b.key === 'savings' && onTrack ? 'up' : ''}">${status}</div>
    </div>`;
  }).join('');

  const seg = (vals, sum) => BUCKETS.map(b => {
    const p = sum ? (vals[b.key] / sum) * 100 : 0;
    return `<div style="flex:${p} 1 0;background:${b.color}" title="${b.label}: ${p.toFixed(0)}%">${p >= 9 ? p.toFixed(0) + '%' : ''}</div>`;
  }).join('');
  $('stackTarget').innerHTML = seg({ needs: 50, wants: 30, savings: 20 }, 100);
  $('stackActual').innerHTML = total ? seg(spent, total) : '<div style="flex:1;background:var(--grid)"></div>';
  $('splitLegend').innerHTML = BUCKETS.map(b =>
    `<span><span class="swatch" style="background:${b.color}"></span>${b.label} ${total ? ((spent[b.key] / total) * 100).toFixed(0) : 0}%</span>`).join('');

  const label = { needs: 'Needs', wants: 'Wants', savings: 'Savings' };
  const color = { needs: 'var(--needs)', wants: 'var(--wants)', savings: 'var(--savings)' };
  const order = { needs: 0, wants: 1, savings: 2 };
  const items = [...state.items].sort((a, b) => order[a.bucket] - order[b.bucket] || b.amount - a.amount);
  $('itemCount').textContent = `· ${fmt0(total)} total`;
  $('items').innerHTML = items.length ? items.map(i => `<tr>
      <td>${esc(i.name)}</td>
      <td><span class="tag"><span class="swatch" style="background:${color[i.bucket]}"></span>${label[i.bucket]}</span></td>
      <td>${fmt(Number(i.amount))}</td>
      <td><button class="x" data-del="${i.id}" aria-label="Remove ${esc(i.name)}">×</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Add your first outgoing above.</td></tr>';
}

$('income').addEventListener('input', e => { state.income = Number(e.target.value) || 0; save(); renderBudget(); });
$('addItem').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  state.items.push({ id: Date.now(), name: f.get('name').trim(), amount: Number(f.get('amount')), bucket: f.get('bucket') });
  save(); renderBudget(); e.target.reset(); e.target.name.focus();
});
$('items').addEventListener('click', e => {
  const id = e.target.dataset.del; if (!id) return;
  state.items = state.items.filter(i => String(i.id) !== id); save(); renderBudget();
});

// ---------------- investments ----------------
function setConn(kind, text) {
  $('connDot').className = 'dot ' + kind;
  $('connText').textContent = text;
}
function banner(html) { $('banner').innerHTML = html || ''; $('banner').classList.toggle('show', !!html); }

// With no local server (e.g. the GitHub Pages demo) the page simulates the market itself.
let staticDemo = null;
async function detectServer() {
  try {
    const r = await fetch('api/status');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return;
  } catch {}
  staticDemo = Demo.createDemo();
}

async function pollPortfolio() {
  try {
    let data;
    if (staticDemo) {
      staticDemo.tick();
      data = staticDemo.snapshot();
    } else {
      const r = await fetch('api/portfolio');
      data = await r.json();
      if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
    }
    if (!portfolio || portfolio.source !== data.source) loadHistory(data.source, data.cash.total);
    portfolio = data;
    currency = data.currency;
    banner(data.source !== 'demo' ? '' : staticDemo
      ? '<b>Live demo.</b> Prices are simulated in your browser. Run it locally with a Trading 212 API key to track your real portfolio – see the <a href="https://github.com/BK101-design/budget-dashboard">README</a>.'
      : '<b>Demo mode.</b> Prices below are simulated. To connect your real account, create a read‑only API key in the Trading 212 app (Settings → API), put it in <code>.env</code> and restart the server.');
    setConn(data.source === 'demo' ? 'demo' : 'live',
      (data.source === 'demo' ? 'Demo data' : 'Trading 212 live') + ' · ' + new Date(data.ts).toLocaleTimeString());
    $('invSource').textContent = data.source === 'demo' ? 'Simulated portfolio (demo mode)' : 'Live from Trading 212 · refreshes every 5s';
  } catch (e) {
    setConn('err', e.status === 401 ? 'API key rejected' : e.status === 429 ? 'Rate limited – retrying' : 'Connection error');
    if (e.status === 401) banner('<b>Trading 212 rejected the API key.</b> Check <code>T212_API_KEY</code> / <code>T212_API_SECRET</code> and that <code>T212_ENV</code> matches the account (live vs practice).');
  }
  renderInvestments();
}

async function pollQuotes() {
  if (!state.holds.length) return renderInvestments();
  if (staticDemo) {
    for (const h of state.holds) quotes[h.symbol] = { symbol: h.symbol, error: 'Live quotes need the local server' };
    return renderInvestments();
  }
  try {
    const syms = [...new Set(state.holds.map(h => h.symbol))].join(',');
    const r = await fetch(`api/quotes?symbols=${encodeURIComponent(syms)}&currency=${currency}`);
    const data = await r.json();
    for (const q of data.quotes) quotes[q.symbol.toUpperCase()] = q;
  } catch {}
  renderInvestments();
}

function holdRows() {
  return state.holds.map(h => {
    const q = quotes[h.symbol];
    if (!q || q.error || q.price == null) return { h, q, value: 0, day: 0, ppl: null };
    const fx = q.fx ?? 1;
    const value = h.qty * q.price * fx;
    const day = q.prevClose ? h.qty * (q.price - q.prevClose) * fx : 0;
    const ppl = h.cost ? h.qty * (q.price - h.cost) * fx : null;
    return { h, q, value, day, ppl };
  });
}

function flashCls(key, price) {
  const prev = lastPrices[key]; lastPrices[key] = price;
  if (prev == null || prev === price) return '';
  return price > prev ? 'flash-up' : 'flash-down';
}

function renderInvestments() {
  const hr = holdRows();
  const otherValue = hr.reduce((s, r) => s + r.value, 0);
  const otherPpl = hr.reduce((s, r) => s + (r.ppl || 0), 0);

  if (portfolio) {
    const c = portfolio.cash;
    const total = (c.total || 0) + otherValue;
    const ppl = (c.ppl || 0) + otherPpl;
    const cost = total - ppl - (c.free || 0);

    $('kInv').textContent = fmt0(total);
    $('kInvSub').textContent = `T212 ${fmt0(c.total)}${otherValue ? ` · other ${fmt0(otherValue)}` : ''}`;
    $('kPpl').innerHTML = `<span class="${cls(ppl)}">${signed(ppl, fmt0)}</span>`;
    $('kPplSub').textContent = cost > 0 ? `${pct((ppl / cost) * 100)} on ${fmt0(cost)} invested` : '';

    recordHistory(total);
    $('pfValue').textContent = fmt(total);
    drawChart();

    const pos = portfolio.positions;
    const posTotal = pos.reduce((s, p) => s + p.value, 0) || 1;
    const shades = ['var(--needs)', 'var(--wants)', 'var(--savings)'];
    // allocation strip: top 3 positions coloured, the rest folded into "Other"
    const top = pos.slice(0, 3), rest = pos.slice(3).reduce((s, p) => s + p.value, 0);
    $('alloc').innerHTML = top.map((p, i) => `<div style="flex:${p.value} 1 0;background:${shades[i]}" title="${esc(p.symbol)} ${(p.value / posTotal * 100).toFixed(1)}%"></div>`).join('')
      + (rest ? `<div style="flex:${rest} 1 0;background:var(--axis)" title="Other ${(rest / posTotal * 100).toFixed(1)}%"></div>` : '');

    $('positions').innerHTML = pos.length ? pos.map((p, i) => `<tr>
        <td><span class="tag">${i < 3 ? `<span class="swatch" style="background:${shades[i]}"></span>` : `<span class="swatch" style="background:var(--axis)"></span>`}<span class="sym">${esc(p.symbol)}</span></span><span class="nm">${esc(p.name)}</span></td>
        <td>${+p.qty.toFixed(4)}</td>
        <td class="${flashCls(p.ticker, p.price)}">${priceFmt(p.price, p.priceCurrency)}</td>
        <td>${fmt(p.value)}<span class="nm" style="margin-left:auto">${(p.value / posTotal * 100).toFixed(1)}%</span></td>
        <td class="${cls(p.ppl)}">${signed(p.ppl)}<span class="nm" style="margin-left:auto">${pct(p.pplPct)}</span></td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No open positions.</td></tr>';
    $('posUpdated').textContent = `· ${pos.length} holdings`;
    $('cashNote').textContent = `Free cash ${fmt(c.free || 0)} · invested ${fmt(c.invested || 0)} · return ${signed(c.ppl || 0)}`;
  }

  $('holds').innerHTML = hr.length ? hr.map(({ h, q, value, day, ppl }) => {
    if (!q) return `<tr><td><span class="sym">${esc(h.symbol)}</span></td><td colspan="3" class="empty">Fetching…</td><td><button class="x" data-hdel="${h.id}">×</button></td></tr>`;
    if (q.error) return `<tr><td><span class="sym">${esc(h.symbol)}</span></td><td colspan="3" class="${staticDemo ? 'empty' : 'down'}">${staticDemo ? esc(q.error) : 'Ticker not found'}</td><td><button class="x" data-hdel="${h.id}" aria-label="Remove">×</button></td></tr>`;
    const dayPct = q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
    return `<tr>
      <td><span class="sym">${esc(h.symbol)}</span><span class="nm">${esc(q.name)} · ${+h.qty}</span></td>
      <td class="${flashCls('y:' + h.symbol, q.price)}">${priceFmt(q.price, q.currency)}</td>
      <td class="${cls(day)}">${pct(dayPct)}<span class="nm">${signed(day)}</span></td>
      <td>${fmt(value)}${ppl != null ? `<span class="nm ${cls(ppl)}">${signed(ppl)}</span>` : ''}</td>
      <td><button class="x" data-hdel="${h.id}" aria-label="Remove ${esc(h.symbol)}">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">Track holdings held outside Trading 212 here.</td></tr>';
}

$('addHold').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  state.holds.push({ id: Date.now(), symbol: f.get('symbol').trim().toUpperCase(), qty: Number(f.get('qty')), cost: Number(f.get('cost')) || 0 });
  save(); e.target.reset(); renderInvestments(); pollQuotes();
});
$('holds').addEventListener('click', e => {
  const id = e.target.dataset.hdel; if (!id) return;
  state.holds = state.holds.filter(h => String(h.id) !== id); save(); renderInvestments();
});

// ---------------- history + chart ----------------
// Demo and live histories are kept apart so simulated values never mix into your real chart.
let HKEY = 'wealth-dash-history';
let history = [];
function loadHistory(source, value) {
  HKEY = 'wealth-dash-history-' + source;
  try { history = JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch { history = []; }
  if (source === 'demo' && history.length < 2) history = Demo.backfill(value);
}
function recordHistory(v) {
  const now = Date.now();
  const last = history[history.length - 1];
  if (last && now - last[0] < 4000) return;
  history.push([now, +v.toFixed(2)]);
  history = history.filter(p => now - p[0] < 7 * 86400000).slice(-6000);
  try { localStorage.setItem(HKEY, JSON.stringify(history)); } catch {}
}

function drawChart() {
  const svg = $('svg');
  const W = svg.clientWidth || 800, H = 220, padL = 8, padR = 64, padT = 12, padB = 24;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const now = Date.now();
  const pts = history.filter(p => now - p[0] <= range);
  const chg = pts.length > 1 ? pts[pts.length - 1][1] - pts[0][1] : 0;
  const base = pts.length ? pts[0][1] : 0;
  $('pfChg').innerHTML = pts.length > 1
    ? `<span class="${cls(chg)}">${signed(chg)} (${pct(base ? chg / base * 100 : 0)})</span> <span style="color:var(--muted);font-weight:400">since ${new Date(pts[0][0]).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: range >= 86400000 ? 'numeric' : undefined, month: range >= 86400000 ? 'short' : undefined })}</span>`
    : '';
  if (pts.length < 2) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)" font-size="13">Collecting data points…</text>`;
    svg._pts = null; return;
  }
  let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
  const padV = (hi - lo) * 0.12 || hi * 0.002 || 1; lo -= padV; hi += padV;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const x = t => padL + ((t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const ticks = 4; let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = lo + (hi - lo) * (i / ticks), yy = y(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>
             <text x="${W - padR + 8}" y="${yy + 4}" fill="var(--muted)" font-size="11" style="font-variant-numeric:tabular-nums">${fmt(v, currency, 0)}</text>`;
  }
  const tl = [t0, (t0 + t1) / 2, t1].map((t, i) =>
    `<text x="${x(t)}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="${['start', 'middle', 'end'][i]}">${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>`).join('');
  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('');
  const area = d + `L${x(t1)},${H - padB}L${x(t0)},${H - padB}Z`;
  const lp = pts[pts.length - 1];
  svg.innerHTML = `
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--line)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--line)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${tl}
    <line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" stroke="var(--axis)"/>
    <path d="${area}" fill="url(#fill)"/>
    <path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(lp[0])}" cy="${y(lp[1])}" r="4" fill="var(--line)" stroke="var(--surface)" stroke-width="2"/>
    <g id="cross" style="display:none"><line id="cx" y1="${padT}" y2="${H - padB}" stroke="var(--axis)" stroke-dasharray="3 3"/><circle id="cd" r="4.5" fill="var(--line)" stroke="var(--surface)" stroke-width="2"/></g>
    <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" id="hit"/>`;
  svg._pts = { pts, x, y };
}

$('chart').addEventListener('pointermove', e => {
  const svg = $('svg'), m = svg._pts; if (!m) return;
  const rect = svg.getBoundingClientRect();
  const W = svg.viewBox.baseVal.width, sx = (e.clientX - rect.left) * (W / rect.width);
  let best = m.pts[0], bd = Infinity;
  for (const p of m.pts) { const dd = Math.abs(m.x(p[0]) - sx); if (dd < bd) { bd = dd; best = p; } }
  const px = m.x(best[0]), py = m.y(best[1]);
  const g = svg.querySelector('#cross'); if (!g) return;
  g.style.display = ''; svg.querySelector('#cx').setAttribute('x1', px); svg.querySelector('#cx').setAttribute('x2', px);
  svg.querySelector('#cd').setAttribute('cx', px); svg.querySelector('#cd').setAttribute('cy', py);
  const tip = $('tip'); tip.style.display = 'block';
  tip.style.left = (px * rect.width / W) + 'px'; tip.style.top = (py * rect.height / svg.viewBox.baseVal.height) + 'px';
  tip.innerHTML = `<b>${fmt(best[1])}</b><span>${new Date(best[0]).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;
});
$('chart').addEventListener('pointerleave', () => {
  $('tip').style.display = 'none'; const g = $('svg').querySelector('#cross'); if (g) g.style.display = 'none';
});
$('ranges').addEventListener('click', e => {
  const r = e.target.dataset.r; if (!r) return;
  range = Number(r);
  for (const b of $('ranges').children) b.setAttribute('aria-pressed', b === e.target);
  drawChart();
});
window.addEventListener('resize', drawChart);

// ---------------- theme ----------------
$('themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('wealth-dash-theme', document.documentElement.dataset.theme); } catch {}
});
try { const t = localStorage.getItem('wealth-dash-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
const themeParam = new URLSearchParams(location.search).get('theme');
if (themeParam === 'light' || themeParam === 'dark') document.documentElement.dataset.theme = themeParam;

// ---------------- go ----------------
renderBudget();
detectServer().then(pollPortfolio).then(pollQuotes);
setInterval(pollPortfolio, 5000);   // Trading 212 allows 1 portfolio call / 5s
setInterval(pollQuotes, 15000);
