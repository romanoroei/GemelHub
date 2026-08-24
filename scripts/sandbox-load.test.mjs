import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const names = ['_sbItemKey', '_sbFindPortfolioItemFromElement', '_sbSyncVisibleInputsToState', 'saveSandboxPortfolio', '_sbGetSavedPortfolios', '_sbPutSavedPortfolios', '_sbSetDirty', '_sbSetAutoSaveId', '_sbFindMirrorEntry', '_sbEnsureCurrentPortfolioPersisted', '_sbOpenLoadDialog', '_sbCloseLoadDialog', '_sbDoLoadPortfolio'];
const code = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));
const row = (fundId, amount, mode = 'amount') => ({ categoryId: 'gemel', trackId: 'general', fundId, investAmount: amount, investPct: mode === 'percent' ? amount : '', investMode: mode, dnCumulative: amount === '100000' ? '0.5' : '0.2' });

function setup(a, b) {
  const storage = new Map();
  let inputs = [];
  const dialog = { hidden: true };
  const c = {
    state: { activeCategoryId: 'sandbox', sandbox: { portfolio: copy(a), selections: [], categoryNotes: {}, portfolioName: 'A', autoSaveId: 'a' } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    document: {
      getElementById: id => id === 'sandbox-section' ? { style: {}, querySelectorAll: selector => inputs.filter(input => input.selector === selector) } : dialog,
      querySelectorAll: () => [], querySelector: () => null,
    },
    confirm: () => true, history: { pushState() {} },
    _sbUpdateTabBadge() {}, syncFundMembershipIndicators() {}, _sbShowAutosaveIndicator() {}, _sbRenderLoadList() {}, showToast() {},
    renderSandboxPage() {
      inputs = c.state.sandbox.portfolio.flatMap((item, index) => [
        { selector: '.sandbox-invest-input', value: item.investMode === 'percent' ? item.investPct : Number(item.investAmount).toLocaleString('en-US'), dataset: { sandboxKey: c._sbItemKey(item), portfolioIdx: String(index) } },
        { selector: '.sandbox-fee-input', value: item.dnCumulative, dataset: { sandboxKey: c._sbItemKey(item), portfolioIdx: String(index), field: 'dnCumulative' } },
      ]);
    },
  };
  for (const key of ['SB_PORTFOLIOS_KEY', 'SANDBOX_STORAGE_KEY', 'SANDBOX_SELECTIONS_KEY', 'SANDBOX_CATEGORY_NOTES_KEY', 'SANDBOX_NAME_KEY', 'SANDBOX_LAST_MOD_KEY', 'SANDBOX_DIRTY_KEY', 'SANDBOX_AUTOSAVE_ID_KEY']) c[key] = key;
  vm.createContext(c);
  vm.runInContext(code, c);
  c._sbPutSavedPortfolios([{ id: 'a', name: 'A', portfolio: copy(a) }, { id: 'b', name: 'B', portfolio: copy(b) }]);
  c.renderSandboxPage();
  return { c, inputs: () => inputs, saved: () => copy(c._sbGetSavedPortfolios()).map(p => p.portfolio), draft: () => JSON.parse(storage.get('SANDBOX_STORAGE_KEY')) };
}

for (const [label, a, b] of [
  ['shared funds reordered', [row('1', '100000'), row('2', '200000')], [row('2', '700000'), row('1', '900000')]],
  ['different funds at the same indexes', [row('1', '100000')], [row('3', '800000')]],
  ['different investment modes', [row('1', '100000')], [row('1', '25', 'percent')]],
]) {
  test(`round trip preserves both portfolios: ${label}`, () => {
    const h = setup(a, b);
    h.c._sbOpenLoadDialog();
    assert.deepEqual(h.saved(), [a, b]);
    h.c._sbDoLoadPortfolio('b');
    assert.deepEqual(copy(h.c.state.sandbox.portfolio), b);
    assert.deepEqual(h.draft(), b);
    h.c._sbOpenLoadDialog();
    h.c._sbDoLoadPortfolio('a');
    assert.deepEqual(copy(h.c.state.sandbox.portfolio), a);
    assert.deepEqual(h.saved(), [a, b]);
    assert.deepEqual(h.draft(), a);
  });
}
test('pending edits belong only to the outgoing portfolio; normal saves still sync', () => {
  const a = [row('1', '100000')], b = [row('1', '800000')];
  const h = setup(a, b);
  h.inputs()[0].value = '123,456';
  h.inputs()[1].value = '0.7';
  h.c._sbOpenLoadDialog();
  h.c._sbDoLoadPortfolio('b');
  assert.deepEqual(h.saved()[0], [{ ...a[0], investAmount: '123456', dnCumulative: '0.7' }]);
  assert.deepEqual(h.draft(), b);
  h.inputs()[0].value = '654,321';
  h.c.saveSandboxPortfolio();
  assert.equal(h.draft()[0].investAmount, '654321');
});
test('cancelling load leaves both portfolios intact', () => {
  const a = [row('1', '100000')], b = [row('1', '800000')];
  const h = setup(a, b);
  h.c.confirm = () => false;
  h.c._sbDoLoadPortfolio('b');
  assert.deepEqual(copy(h.c.state.sandbox.portfolio), a);
  assert.deepEqual(h.saved(), [a, b]);
});
