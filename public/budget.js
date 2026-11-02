// Pure 50/30/20 budget maths, shared by the browser UI and the Node tests.
(function (root) {
  const RULE = { needs: 0.5, wants: 0.3, savings: 0.2 };

  function summarize(income, items) {
    income = Math.max(0, Number(income) || 0);
    const spent = { needs: 0, wants: 0, savings: 0 };
    for (const i of items || []) {
      if (!(i.bucket in spent)) continue;
      spent[i.bucket] += Math.max(0, Number(i.amount) || 0);
    }
    const total = spent.needs + spent.wants + spent.savings;

    const buckets = {};
    for (const key of Object.keys(RULE)) {
      const target = income * RULE[key];
      const s = spent[key];
      buckets[key] = {
        target,
        spent: s,
        remaining: target - s,
        ratio: target ? s / target : 0,
        // Overspending is bad for needs/wants; for savings, going over the target is good.
        onTrack: key === 'savings' ? s >= target : s <= target,
        actualPct: total ? (s / total) * 100 : 0,
      };
    }
    return { income, total, unallocated: income - total, buckets };
  }

  const api = { RULE, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Budget = api;
})(this);
