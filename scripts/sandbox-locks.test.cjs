const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8');
const names = ['_sbAllocationValue', '_sbCategoryPercent', '_sbCategoryInvestTotal', '_sbDistribute', '_sbLockedPercent', '_sbAllocateLocked', '_sbSetCategoryTotal', '_sbSetPercent', '_sbSetAmount', '_sbMiniItem', '_sbExpandMiniItem', '_sbSyncVisibleInputsToState'];
const code = names.map(name => {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}).join('\n');
const c = vm.createContext({});
vm.runInContext(code, c);
const row = (amount, locks = {}) => ({ investMode: 'amount', investAmount: String(amount), investPct: '', ...locks });
const percentRow = (pct, locks = {}) => ({ investMode: 'percent', investAmount: '', investPct: String(pct), ...locks });
const amounts = rows => rows.map(it => Number(it.investAmount));
const clone = value => JSON.parse(JSON.stringify(value));
const near = (a, b) => assert(Math.abs(a - b) < .000001, `${a} != ${b}`);
const atomicFailure = (rows, operation) => {
  const before = JSON.stringify(rows);
  assert.equal(operation(), false);
  assert.equal(JSON.stringify(rows), before);
};

test('legacy percentage lock survives editing another amount; its own amount scales with total', () => {
  const rows = [row(60000, { pctLocked: true }), row(40000)];
  assert.equal(c._sbSetAmount(rows[1], rows, '80000'), true);
  assert.deepEqual(amounts(rows), [120000, 80000]);
  near(c._sbCategoryPercent(rows[0], rows), 60);
  assert.equal(rows[0].lockedPct, 60);
});
test('total edit preserves every percentage lock and changes the corresponding amounts', () => {
  const rows = [row(30000, { pctLocked: true }), row(20000, { pctLocked: true }), row(50000)];
  assert.equal(c._sbSetCategoryTotal(rows, 200000), true);
  assert.deepEqual(amounts(rows), [60000, 40000, 100000]);
});
test('editing the money on a percentage-locked row changes total while preserving its share', () => {
  const rows = [row(60000, { pctLocked: true }), row(40000)];
  assert.equal(c._sbSetAmount(rows[0], rows, '90000'), true);
  assert.deepEqual(amounts(rows), [90000, 60000]);
  near(c._sbCategoryPercent(rows[0], rows), 60);
});
test('percentage-only locks survive first money entry and subsequent total edits', () => {
  const rows = [percentRow(60, { pctLocked: true }), percentRow(40)];
  assert.equal(c._sbSetAmount(rows[1], rows, '40000'), true);
  assert.equal(c._sbSetCategoryTotal(rows, 200000), true);
  assert.deepEqual(amounts(rows), [120000, 80000]);
});
test('zero percentage lock remains zero during edits', () => {
  const rows = [row(0, { pctLocked: true }), row(1000)];
  assert.equal(c._sbSetAmount(rows[1], rows, '2000'), true);
  assert.deepEqual(amounts(rows), [0, 2000]);
  atomicFailure(rows, () => c._sbSetAmount(rows[0], rows, '1'));
});
test('all percentage-locked routes can scale together including rounding thirds', () => {
  const rows = [row(33333.33, { pctLocked: true }), row(33333.33, { pctLocked: true }), row(33333.34, { pctLocked: true })];
  assert.equal(c._sbSetCategoryTotal(rows, 50000.01), true);
  near(c._sbCategoryInvestTotal(rows), 50000.01);
  rows.forEach(it => assert.equal(c._sbCategoryPercent(it, rows).toFixed(1), '33.3'));
});
test('repeated total edits and reloads do not drift the stored percentage', () => {
  let rows = [row(133333.33, { pctLocked: true }), row(66666.67)];
  for (const total of [450000, 120000, 999999.99, 300000, 200000]) {
    assert.equal(c._sbSetCategoryTotal(rows, total), true);
    rows = clone(rows);
    assert.equal(c._sbCategoryPercent(rows[0], rows).toFixed(1), '66.7');
    near(rows[0].lockedPct, 66.666665);
  }
});
test('clearing total keeps locked percentage in percentage-only mode', () => {
  const rows = [row(60000, { pctLocked: true }), row(40000)];
  assert.equal(c._sbSetCategoryTotal(rows, 0), true);
  assert.equal(rows[0].investPct, '60');
  assert.equal(c._sbSetCategoryTotal(rows, 200000), true);
  assert.deepEqual(amounts(rows), [120000, 80000]);
});
test('amount lock survives total edits and other row amount changes', () => {
  const rows = [row(20000, { amountLocked: true }), row(80000)];
  assert.equal(c._sbSetCategoryTotal(rows, 200000), true);
  assert.deepEqual(amounts(rows), [20000, 180000]);
  assert.equal(c._sbSetAmount(rows[1], rows, '50000'), true);
  assert.deepEqual(amounts(rows), [20000, 50000]);
});
test('percentage editing cannot redistribute money out of an amount lock', () => {
  const rows = [row(20000, { amountLocked: true }), row(30000), row(50000)];
  assert.equal(c._sbSetPercent(rows[1], rows, '90'), true);
  assert.deepEqual(amounts(rows), [20000, 80000, 0]);
});
test('percentage and amount locks on different rows can coexist', () => {
  const rows = [row(30000, { pctLocked: true }), row(20000, { amountLocked: true }), row(50000)];
  assert.equal(c._sbSetCategoryTotal(rows, 200000), true);
  assert.deepEqual(amounts(rows), [60000, 20000, 120000]);
  assert.equal(c._sbSetAmount(rows[2], rows, '80000'), true);
  assert.deepEqual(amounts(rows), [42857.14, 20000, 80000]);
  assert.equal(c._sbCategoryPercent(rows[0], rows).toFixed(1), '30.0');
});
test('direct writes to either field of an amount-locked row are rejected atomically', () => {
  const rows = [row(20000, { amountLocked: true }), row(80000)];
  atomicFailure(rows, () => c._sbSetAmount(rows[0], rows, '25000'));
  atomicFailure(rows, () => c._sbSetPercent(rows[0], rows, '25'));
});
test('a direct percentage edit to a percentage lock is rejected atomically', () => {
  const rows = [row(20000, { pctLocked: true }), row(80000)];
  atomicFailure(rows, () => c._sbSetPercent(rows[0], rows, '25'));
});
test('all money-locked routes reject changes to category total', () => {
  const rows = [row(20000, { amountLocked: true }), row(80000, { amountLocked: true })];
  atomicFailure(rows, () => c._sbSetCategoryTotal(rows, 200000));
  atomicFailure(rows, () => c._sbSetCategoryTotal(rows, 0));
  assert.equal(c._sbSetCategoryTotal(rows, 100000), true);
});
test('simultaneous money and percent locks reject incompatible totals', () => {
  const rows = [row(20000, { amountLocked: true, pctLocked: true }), row(80000)];
  atomicFailure(rows, () => c._sbSetCategoryTotal(rows, 200000));
  atomicFailure(rows, () => c._sbSetAmount(rows[1], rows, '100000'));
  assert.equal(c._sbSetCategoryTotal(rows, 100000), true);
});
test('a fully reserved percent-and-money total rejects edits without changing anything', () => {
  const rows = [row(50000, { pctLocked: true }), row(50000, { amountLocked: true }), row(0, { amountLocked: true })];
  atomicFailure(rows, () => c._sbSetCategoryTotal(rows, 200000));
});
test('locked amounts exceeding a requested total are rejected atomically', () => {
  const rows = [row(60000, { amountLocked: true }), row(40000)];
  atomicFailure(rows, () => c._sbSetCategoryTotal(rows, 50000));
});
test('the category total limit also applies to totals inferred from a locked share', () => {
  const rows = [row(90000000, { pctLocked: true }), row(10000000)];
  atomicFailure(rows, () => c._sbSetAmount(rows[1], rows, '50000000'));
});
test('unrepresentable locked percentages at tiny totals are rejected', () => {
  const rows = [row(60000, { pctLocked: true }), row(40000)];
  atomicFailure(rows, () => c._sbSetCategoryTotal(rows, .01));
});
test('hidden rows and their locks are not changed by visible allocation edits', () => {
  const hidden = row(99999, { hidden: true, pctLocked: true, amountLocked: true, lockedPct: 90 });
  const rows = [row(60000, { pctLocked: true }), row(40000), hidden];
  const original = JSON.stringify(hidden);
  assert.equal(c._sbSetAmount(rows[1], rows, '80000'), true);
  assert.equal(JSON.stringify(hidden), original);
  assert.deepEqual(amounts(rows).slice(0, 2), [120000, 80000]);
});
test('sharing serializes both lock types and the exact locked percentage', () => {
  const original = { ...row(12345.67, { pctLocked: true, amountLocked: true, lockedPct: 66.666665 }), fundId: '1', categoryId: 'gemel' };
  const shared = c._sbExpandMiniItem(c._sbMiniItem(original));
  assert.equal(shared.pctLocked, true);
  assert.equal(shared.amountLocked, true);
  assert.equal(shared.lockedPct, 66.666665);
  const legacy = c._sbExpandMiniItem(c._sbMiniItem(original).slice(0, 22));
  assert.equal(legacy.pctLocked, false);
  assert.equal(legacy.amountLocked, false);
  assert.equal(legacy.lockedPct, undefined);
});
test('saving pending inputs cannot bypass percentage or amount locks', () => {
  const rows = [row(60000, { pctLocked: true }), row(40000), row(10000, { amountLocked: true, hidden: true })];
  const inputs = rows.map((item, i) => ({ item, value: i === 1 ? '80,000' : i === 2 ? '99999' : item.investAmount }));
  const section = { style: {}, querySelectorAll: selector => selector === '.sandbox-invest-input' ? inputs : [] };
  c.state = { sandbox: { portfolio: rows } };
  c.document = { getElementById: () => section };
  c._sbFindPortfolioItemFromElement = input => input.item;
  const originalSync = c._sbSyncAllocationDom;
  c._sbSyncAllocationDom = () => inputs.forEach(input => { input.value = input.item.investAmount; });
  c._sbSyncVisibleInputsToState();
  assert.deepEqual(amounts(rows), [120000, 80000, 10000]);
  c._sbSyncAllocationDom = originalSync;
});
test('mixed lock allocations retain all invariants across 200 deterministic scenarios', () => {
  for (let i = 1; i <= 200; i++) {
    const p = 5 + i % 65;
    const rows = [row(p * 1000, { pctLocked: true }), row(10000, { amountLocked: true }), row((90 - p) * 1000)];
    const total = 20000 + i * 1777.13;
    const before = JSON.stringify(rows);
    if (c._sbSetCategoryTotal(rows, total)) {
      near(c._sbCategoryInvestTotal(rows), Math.round(total * 100) / 100);
      assert.equal(rows[1].investAmount, '10000');
      assert.equal(c._sbCategoryPercent(rows[0], rows).toFixed(1), p.toFixed(1));
      assert(rows.every(it => Number(it.investAmount) >= 0));
    } else assert.equal(JSON.stringify(rows), before);
  }
});
