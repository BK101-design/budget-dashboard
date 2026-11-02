// API tests for server.js. They always run in demo mode, so no Trading 212 key or
// network access is needed. Setting the key to an empty string stops .env overriding it.
process.env.T212_API_KEY = '';

const test = require('node:test');
const assert = require('node:assert');
const server = require('../server.js');

let base;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise(resolve => server.close(resolve)));

test('status reports demo mode when no key is set', async () => {
  const res = await fetch(`${base}/api/status`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.demo, true);
});

test('portfolio returns demo positions with valid numbers', async () => {
  const res = await fetch(`${base}/api/portfolio`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.source, 'demo');
  assert.ok(Array.isArray(body.positions) && body.positions.length > 0);
  for (const p of body.positions) {
    assert.ok(Number.isFinite(p.value) && p.value > 0, `${p.symbol} has a valid value`);
  }
});

test('home page serves the dashboard HTML', async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('unknown files return 404', async () => {
  const res = await fetch(`${base}/does-not-exist.js`);
  assert.strictEqual(res.status, 404);
});

test('server files outside public/ are never served', async () => {
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/../.env.example']) {
    const res = await fetch(base + p);
    const text = await res.text();
    assert.ok(!text.includes('T212_API_KEY'), `${p} must not leak server files`);
  }
});
