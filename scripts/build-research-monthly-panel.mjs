import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { researchRows } from './research-universe-audit.mjs';

const ROOT = process.cwd();
const HORIZONS = [3, 6, 12, 24];
const num = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
function addMonths(period, offset) {
  const year = Math.floor(period / 100), month = period % 100;
  const serial = year * 12 + month - 1 + offset;
  return Math.floor(serial / 12) * 100 + (serial % 12) + 1;
}
function compound(records, endPeriod, months, forward = false) {
  let wealth = 1;
  for (let i = 0; i < months; i++) {
    const period = addMonths(endPeriod, forward ? i + 1 : i - months + 1);
    const value = num(records.get(period)?.raw.MONTHLY_YIELD);
    if (value === null) return null;
    wealth *= 1 + value / 100;
  }
  return (wealth - 1) * 100;
}
function returnSeries(records, endPeriod, months) {
  const values = [];
  for (let i = 0; i < months; i++) {
    const value = num(records.get(addMonths(endPeriod, i - months + 1))?.raw.MONTHLY_YIELD);
    if (value === null) return null;
    values.push(value);
  }
  return values;
}
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
}
function maxDrawdown(values) {
  let wealth = 1, peak = 1, drawdown = 0;
  for (const value of values) {
    wealth *= 1 + value / 100;
    peak = Math.max(peak, wealth);
    drawdown = Math.max(drawdown, (peak - wealth) / peak);
  }
  return drawdown * 100;
}
function percentileMap(items, field) {
  const sorted = items.filter(item => Number.isFinite(item.targets[field])).sort((a, b) => a.targets[field] - b.targets[field]);
  const result = new Map();
  if (sorted.length < 5) return result;
  sorted.forEach((item, index) => result.set(item.fundId, sorted.length > 1 ? index / (sorted.length - 1) * 100 : 50));
  return result;
}

const byFund = new Map();
for (const row of researchRows) {
  const key = `${row.source}_${row.fundId}`;
  if (!byFund.has(key)) byFund.set(key, new Map());
  byFund.get(key).set(row.period, row);
}

const panel = [];
for (const row of researchRows) {
  const records = byFund.get(`${row.source}_${row.fundId}`);
  const monthly12 = returnSeries(records, row.period, 12);
  const monthly36 = returnSeries(records, row.period, 36);
  if (!monthly12) continue;
  const downside12 = monthly12.map(value => Math.min(value, 0));
  const raw = row.raw;
  const features = {
    return_1m: compound(records, row.period, 1),
    return_3m: compound(records, row.period, 3),
    return_6m: compound(records, row.period, 6),
    return_12m: compound(records, row.period, 12),
    return_24m: compound(records, row.period, 24),
    return_36m: compound(records, row.period, 36),
    return_60m: compound(records, row.period, 60),
    return_year_1: compound(records, row.period, 12),
    return_year_2: compound(records, addMonths(row.period, -12), 12),
    return_year_3: compound(records, addMonths(row.period, -24), 12),
    return_year_4: compound(records, addMonths(row.period, -36), 12),
    return_year_5: compound(records, addMonths(row.period, -48), 12),
    positive_month_ratio_12m: monthly12.filter(value => value > 0).length / 12,
    volatility_12m: standardDeviation(monthly12),
    downside_deviation_12m: Math.sqrt(mean(downside12.map(value => value ** 2))),
    positive_month_ratio_36m: monthly36 ? monthly36.filter(value => value > 0).length / 36 : null,
    volatility_36m: monthly36 ? standardDeviation(monthly36) : null,
    max_drawdown_36m: monthly36 ? maxDrawdown(monthly36) : null,
    sharpe: num(raw.SHARPE_RATIO),
    alpha: num(raw.ALPHA),
    reported_standard_deviation: num(raw.STANDARD_DEVIATION),
    total_assets_log: num(raw.TOTAL_ASSETS) > 0 ? Math.log1p(num(raw.TOTAL_ASSETS)) : null,
    management_fee: num(raw.AVG_ANNUAL_MANAGEMENT_FEE),
    deposit_fee: num(raw.AVG_DEPOSIT_FEE),
    net_flow_to_assets: num(raw.NET_MONTHLY_DEPOSITS) !== null && num(raw.TOTAL_ASSETS) > 0 ? num(raw.NET_MONTHLY_DEPOSITS) / num(raw.TOTAL_ASSETS) : null,
    stock_exposure: num(raw.STOCK_MARKET_EXPOSURE),
    foreign_exposure: num(raw.FOREIGN_EXPOSURE),
    fx_exposure: num(raw.FOREIGN_CURRENCY_EXPOSURE),
    liquid_assets: num(raw.LIQUID_ASSETS_PERCENT),
  };
  const targets = Object.fromEntries(HORIZONS.map(horizon => [`return_${horizon}m`, compound(records, row.period, horizon, true)]));
  panel.push({
    source: row.source, product: row.product, track: row.track, cohort: `${row.product}__${row.track}`,
    fundId: row.fundId, period: row.period, classificationMethod: row.classificationMethod,
    features, targets,
  });
}

const byDecision = new Map();
for (const row of panel) {
  const key = `${row.cohort}_${row.period}`;
  if (!byDecision.has(key)) byDecision.set(key, []);
  byDecision.get(key).push(row);
}
const finalRows = [];
for (const rows of byDecision.values()) {
  const percentileMaps = Object.fromEntries(HORIZONS.map(horizon => [`return_${horizon}m`, percentileMap(rows, `return_${horizon}m`)]));
  for (const row of rows) {
    row.targets = {
      ...row.targets,
      ...Object.fromEntries(HORIZONS.map(horizon => [`percentile_${horizon}m`, percentileMaps[`return_${horizon}m`].get(row.fundId) ?? null])),
    };
    if (HORIZONS.some(horizon => row.targets[`percentile_${horizon}m`] !== null)) finalRows.push(row);
  }
}

const cohortSummary = new Map();
for (const row of finalRows) {
  if (!cohortSummary.has(row.cohort)) cohortSummary.set(row.cohort, { rows: 0, funds: new Set(), periods: new Set(), targets: Object.fromEntries(HORIZONS.map(h => [h, 0])) });
  const item = cohortSummary.get(row.cohort);
  item.rows++; item.funds.add(row.fundId); item.periods.add(row.period);
  for (const horizon of HORIZONS) if (row.targets[`percentile_${horizon}m`] !== null) item.targets[horizon]++;
}
const summary = {
  generatedAt: new Date().toISOString(),
  rowCount: finalRows.length,
  featureCount: Object.keys(finalRows[0]?.features || {}).length,
  features: Object.keys(finalRows[0]?.features || {}),
  horizons: HORIZONS,
  cohorts: Object.fromEntries([...cohortSummary].sort().map(([key, item]) => [key, {
    rows: item.rows, funds: item.funds.size, months: item.periods.size, targetRows: item.targets,
  }])),
};
fs.mkdirSync(path.join(ROOT, 'backtest-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'research-monthly-panel-summary.json'), JSON.stringify(summary, null, 2));
const ndjson = finalRows.map(row => JSON.stringify(row)).join('\n');
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'research-monthly-panel.ndjson.gz'), zlib.gzipSync(ndjson, { level: 9 }));
console.log(JSON.stringify(summary, null, 2));
