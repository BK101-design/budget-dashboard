const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('../public/budget.js');

test('targets follow the 50/30/20 rule', () => {
  const r = summarize(3000, []);
  assert.equal(r.buckets.needs.target, 1500);
  assert.equal(r.buckets.wants.target, 900);
  assert.equal(r.buckets.savings.target, 600);
  assert.equal(r.unallocated, 3000);
});

test('sums outgoings per bucket', () => {
  const r = summarize(2000, [
    { amount: 800, bucket: 'needs' },
    { amount: 150, bucket: 'needs' },
    { amount: 300, bucket: 'wants' },
    { amount: 400, bucket: 'savings' },
  ]);
  assert.equal(r.buckets.needs.spent, 950);
  assert.equal(r.total, 1650);
  assert.equal(r.unallocated, 350);
  assert.equal(r.buckets.wants.remaining, 300);
});

test('overspending needs is off track, oversaving is on track', () => {
  const r = summarize(1000, [
    { amount: 600, bucket: 'needs' },
    { amount: 250, bucket: 'savings' },
  ]);
  assert.equal(r.buckets.needs.onTrack, false);
  assert.equal(r.buckets.savings.onTrack, true);
  assert.equal(r.unallocated, 150);
});

test('actual split percentages add up to 100', () => {
  const r = summarize(2500, [
    { amount: 1000, bucket: 'needs' },
    { amount: 500, bucket: 'wants' },
    { amount: 500, bucket: 'savings' },
  ]);
  assert.equal(r.buckets.needs.actualPct, 50);
  assert.equal(r.buckets.wants.actualPct + r.buckets.savings.actualPct, 50);
});

test('ignores bad input', () => {
  const r = summarize('abc', [
    { amount: 'x', bucket: 'needs' },
    { amount: -50, bucket: 'wants' },
    { amount: 100, bucket: 'holiday' },
  ]);
  assert.equal(r.income, 0);
  assert.equal(r.total, 0);
  assert.equal(r.buckets.needs.ratio, 0);
});
