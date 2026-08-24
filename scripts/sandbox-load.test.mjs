import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const names = ['_sbItemKey', '_sbFindPortfolioItemFromElement', '_sbSyncVisibleInputsToState', 'saveSandboxPortfolio', '_sbGetSavedPortfolios', '_sbPutSavedPortfolios', '_sbSetDirty', '_sbSetAutoSaveId', '_sbFindMirrorEntry', '_sbEnsureCurrentPortfolioPersisted', '_sbOpenLoadDialog', '_sbCloseLoadDialog', '_sbDoLoadPortfolio'];
names.push('_sbCurrentSavedPortfolioId', '_sbSaveRenamedPortfolio', '_sbConfirmClearPortfolio');
names.push('_sbDefaultPortfolioName', '_sbDiscardAutoSavedDraft');
const code = names.map(name => {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
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
    confirm: () => true, history: { pushState() {} }, crypto: { randomUUID: () => 'new-id' },
    _sbResetSaveButtonUI() {},
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

test('renaming an unsaved portfolio creates a loadable snapshot with pending edits', () => {
  const h = setup([row('1', '100000')], []);
  h.c.state.sandbox.portfolioName = '';
  h.c.state.sandbox.autoSaveId = null;
  h.inputs()[0].value = '123,456';
  h.c._sbSaveRenamedPortfolio('My portfolio');
  const entry = h.c._sbGetSavedPortfolios().find(p => p.id === 'new-id');
  assert.equal(entry.name, 'My portfolio');
  assert.equal(entry.portfolio[0].investAmount, '123456');
  assert.equal(h.c.state.sandbox.autoSaveId, entry.id);
  assert.equal(h.c.state.sandbox.isDirty, false);
  assert.deepEqual(h.draft(), copy(entry.portfolio));
});

test('renaming a draft updates the same entry and makes it permanent', () => {
  const h = setup([row('1', '100000')], []);
  const list = h.c._sbGetSavedPortfolios();
  list[0].autoNamed = true;
  h.c._sbPutSavedPortfolios(list);
  h.inputs()[0].value = '250,000';
  h.c._sbSaveRenamedPortfolio('Named draft');
  const saved = h.c._sbGetSavedPortfolios();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].name, 'Named draft');
  assert.equal(saved[0].autoNamed, undefined);
  assert.equal(saved[0].portfolio[0].investAmount, '250000');
});

test('failed rename save keeps the existing identity and saved snapshot', () => {
  const h = setup([row('1', '100000')], []);
  h.c._sbPutSavedPortfolios = () => { throw new Error('quota'); };
  h.c._sbSaveRenamedPortfolio('New name');
  assert.equal(h.c.state.sandbox.portfolioName, 'A');
  assert.equal(h.c._sbGetSavedPortfolios()[0].name, 'A');
});

for (const choice of ['cancel', 'save', 'discard']) {
  test(`unsaved deletion offers ${choice} without altering the portfolio`, async () => {
    const h = setup([row('1', '100000')], []);
    h.c.state.sandbox.portfolioName = '';
    h.c.state.sandbox.autoSaveId = null;
    const buttons = ['cancel', 'save', 'discard'].map(value => ({ dataset: { clearChoice: value }, focus() {} }));
    const dialog = { hidden: true, querySelectorAll: () => buttons };
    const message = {};
    const getElement = h.c.document.getElementById;
    h.c.document.getElementById = id => id === 'sb-clear-dialog' ? dialog : id === 'sb-clear-message' ? message : getElement(id);
    let saveOpened = false;
    h.c._sbOpenSaveDialog = () => { saveOpened = true; };
    const result = h.c._sbConfirmClearPortfolio();
    assert.equal(dialog.hidden, false);
    assert.match(message.textContent, /לא ניתן יהיה לטעון אותו שוב/);
    buttons.find(button => button.dataset.clearChoice === choice).onclick();
    assert.equal(await result, choice === 'discard');
    assert.equal(saveOpened, choice === 'save');
    assert.equal(h.c.state.sandbox.portfolio.length, 1);
    assert.equal(dialog.hidden, true);
  });
}

test('unchanged saved portfolio can be cleared with the saved-copy confirmation', async () => {
  const h = setup([row('1', '100000')], []);
  let message;
  h.c.confirm = text => { message = text; return true; };
  assert.equal(await h.c._sbConfirmClearPortfolio(), true);
  assert.match(message, /התיק השמור לא יימחק/);
});

test('a clean portfolio gets an unused default name and browsing never saves it', () => {
  const h = setup([row('1', '100000')], []);
  h.c.state.sandbox.portfolioName = '';
  h.c.state.sandbox.autoSaveId = null;
  const list = h.c._sbGetSavedPortfolios();
  list[0].name = 'תיק השקעות 1';
  list[1].name = '\u200fתיק  השקעות 2';
  h.c._sbPutSavedPortfolios(list);
  const before = copy(h.c._sbGetSavedPortfolios());
  assert.equal(h.c._sbDefaultPortfolioName(), 'תיק השקעות 3');
  h.c._sbOpenLoadDialog();
  h.c._sbOpenLoadDialog();
  assert.deepEqual(copy(h.c._sbGetSavedPortfolios()), before);
  assert.equal(h.c.state.sandbox.autoSaveId, null);
  assert.equal(h.c.state.sandbox.portfolioName, '');
  assert.equal(h.c._sbDefaultPortfolioName(), 'תיק השקעות 3');
});

test('legacy automatic drafts are not silently updated or promoted', () => {
  const h = setup([row('1', '100000')], []);
  const list = h.c._sbGetSavedPortfolios();
  list[0].autoNamed = true;
  h.c._sbPutSavedPortfolios(list);
  h.inputs()[0].value = '999,999';
  h.c._sbOpenLoadDialog();
  assert.equal(h.c._sbGetSavedPortfolios()[0].portfolio[0].investAmount, '100000');
  assert.equal(h.c._sbGetSavedPortfolios()[0].autoNamed, true);
});

for (const choice of ['cancel', 'save', 'discard']) {
  test(`switching away from an unsaved draft: ${choice}`, async () => {
    const a = [row('1', '100000')], b = [row('2', '800000')];
    const h = setup(a, b);
    h.c.state.sandbox.portfolioName = '';
    h.c.state.sandbox.autoSaveId = null;
    const buttons = ['cancel', 'save', 'discard'].map(value => ({ dataset: { clearChoice: value }, focus() {} }));
    const dialog = { hidden: true, querySelectorAll: () => buttons };
    const getElement = h.c.document.getElementById;
    h.c.document.getElementById = id => id === 'sb-clear-dialog' ? dialog : getElement(id);
    let saveOpened = false;
    h.c._sbOpenSaveDialog = () => { saveOpened = true; };
    const result = h.c._sbDoLoadPortfolio('b');
    assert.equal(dialog.hidden, false);
    buttons.find(button => button.dataset.clearChoice === choice).onclick();
    await result;
    assert.deepEqual(copy(h.c.state.sandbox.portfolio), choice === 'discard' ? b : a);
    assert.deepEqual(h.saved(), [a, b]);
    assert.equal(saveOpened, choice === 'save');
  });
}
