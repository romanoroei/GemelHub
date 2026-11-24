import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const config = await fs.readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const apiSource = await fs.readFile(new URL('../js/api.js', import.meta.url), 'utf8');
const appSource = await fs.readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const metadata = JSON.parse(await fs.readFile(new URL('../data/ckan/report-periods.json', import.meta.url), 'utf8'));
const population = 'כלל האוכלוסיה';
const requests = [];
const context = vm.createContext({ fetch: async url => {
  requests.push(url);
  assert.equal(url, 'data/ckan/report-periods.json', 'selector must never request records or archives');
  return { ok: true, json: async () => metadata };
} });
vm.runInContext(config + '\n' + apiSource + '\nglobalThis.api = APIModule;', context);
const periods = await context.api.getComparisonReportPeriods('gemel_tagmulim', population);
assert.ok(periods.length > 120, 'historical selection must extend beyond ten years');
assert.ok(Math.min(...periods) < 201601);
await Promise.all([
  context.api.getComparisonReportPeriods('pension_mekafit', population),
  context.api.getComparisonReportPeriods('polisa_chisachon', population),
  context.api.getComparisonReportPeriods('gemel_tagmulim', '')
]);
assert.equal(requests.length, 1, 'categories share a cached metadata request');
assert.ok(Buffer.byteLength(JSON.stringify(metadata)) < 100000, 'selector metadata stays small');

function extract(name) {
  const start = appSource.search(new RegExp('  (?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  return appSource.slice(start, appSource.indexOf('\n  }', start) + 4);
}
const current = 202610;
let finish;
const range = { availablePeriods: [], availabilityRequestId: 0, startPeriod: '202501', endPeriod: '202609', selectedYear: '2025', active: true, yieldMap: new Map([['1', 42]]) };
const ui = vm.createContext({
  state: { activeCategoryId: 'gemel_tagmulim', targetPopulation: population, organizedData: [{ records: [{ REPORT_PERIOD: current }] }], customRange: range },
  getCurrentCompareMode: () => 'returns', isCustomRangeFeatureEnabled: () => true,
  hydrateCustomRangePeriodOptions() {}, syncCustomRangeControls() {}, setCustomRangeStatus() {},
  resetCustomRangeSorts() { throw Error('metadata must not invalidate an applied range'); },
  APIModule: {
    getAvailableReportPeriods() { throw Error('must not download historical records'); },
    getComparisonReportPeriods() { return new Promise(resolve => { finish = resolve; }); }
  }
});
vm.runInContext(extract('buildImmediateCustomRangePeriods') + '\n' + extract('refreshCustomRangeAvailability'), ui);
const loading = ui.refreshCustomRangeAvailability();
assert.equal(range.availablePeriods.length, 120, 'recent options are immediately usable');
assert.equal(range.availabilityLoading, true);
range.startPeriod = '202401'; // User changed selection while metadata was in flight.
finish(periods);
await loading;
assert.ok(range.availablePeriods.length > 120);
assert.equal(range.availablePeriods[0], current, 'new months survive stale metadata');
assert.equal(range.startPeriod, '202401');
assert.equal(range.endPeriod, '202609');
assert.equal(range.active, true);
assert.equal(range.yieldMap.get('1'), 42);
assert.equal(range.availabilityLoading, false);

// A response for a category that has since been left must not overwrite its replacement.
const pending = ui.refreshCustomRangeAvailability();
ui.state.activeCategoryId = 'pension_mekafit';
const before = range.availablePeriods;
finish([199901]);
await pending;
assert.equal(range.availablePeriods, before);

// Metadata failures leave the recent options usable and allow a retry.
ui.state.activeCategoryId = 'gemel_tagmulim';
ui.APIModule.getComparisonReportPeriods = async () => { throw Error('offline'); };
range.availabilityResolved = false;
await assert.rejects(ui.refreshCustomRangeAvailability(), /offline/);
assert.equal(range.availabilityLoading, false);
assert.equal(range.availabilityResolved, false);
assert.equal(range.availablePeriods, before);
console.log('Custom range: history, metadata-only fetch, cache, pending selection, stale response, and offline checks passed.');

// The actual calculation accepts an eleven-year range and rejects incomplete histories.
const functions = ['listPeriodsInRange', 'getCustomRangeYields'].map(name => {
  const start = apiSource.search(new RegExp('  (?:async )?function ' + name + '\\('));
  return apiSource.slice(start, apiSource.indexOf('\n  }', start) + 4);
}).join('\n');
let rows;
const calculation = vm.createContext({ getRangeEligibleRecords: async () => rows });
vm.runInContext(functions, calculation);
rows = Array.from(calculation.listPeriodsInRange(201001, 202012), REPORT_PERIOD => ({ FUND_ID: '1', REPORT_PERIOD, MONTHLY_YIELD: 1 }));
assert.equal(rows.length, 132);
let yields = await calculation.getCustomRangeYields('gemel_tagmulim', 201001, 202012);
assert.ok(Math.abs(yields.get('1') - (1.01 ** 132 - 1) * 100) < 1e-8);
rows.pop();
yields = await calculation.getCustomRangeYields('gemel_tagmulim', 201001, 202012);
assert.equal(yields.get('1'), null);
console.log('Eleven-year compounded return and incomplete-history checks passed.');
