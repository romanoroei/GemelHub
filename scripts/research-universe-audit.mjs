import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data', 'ckan');
const unwrap = value => Array.isArray(value) ? value : (value.records || value.result?.records || []);
const read = file => unwrap(JSON.parse(fs.readFileSync(file, 'utf8')));
const norm = value => String(value || '').trim().toLowerCase();
const has = (text, terms) => terms.some(term => norm(text).includes(norm(term)));
const excludesPension = name => has(name, ['מקבלי', 'קצבה', 'קיצבה']);

function classifyGemel(row) {
  const classification = norm(row.FUND_CLASSIFICATION);
  const sub = norm(row.SUB_SPECIALIZATION);
  const name = norm(row.FUND_NAME);
  const products = {
    'תגמולים ואישית לפיצויים': 'gemel_regular',
    'קופת גמל להשקעה': 'gemel_investment',
    'קרנות השתלמות': 'training_fund',
  };
  const product = products[classification];
  if (!product) return null;
  let track = null;
  if (sub === 'כללי') track = 'general';
  else if (sub === 'מניות') track = 'equities';
  else if (sub === 'עד 50') track = 'age_upto_50';
  else if (sub === '50-60') track = 'age_50_60';
  else if (sub === '60 ומעלה') track = 'age_60_plus';
  else if (sub === 'אשראי ואג"ח' || sub === 'אשראי ואגח') {
    track = has(name, ['מניות', '25%']) ? 'credit_bonds_upto_25_equities' : 'credit_bonds';
  }
  // Older GemelNet rows often omit SUB_SPECIALIZATION even when the stable
  // fund name clearly identifies a requested general/equity track.
  else if (has(name, ['מניות']) && !has(name, ['25%', 'אג"ח', 'אגח', 'עוקב', 'סחיר', 's&p', 'sp500', 'sp 500'])) track = 'equities';
  else if (has(name, ['כללי']) && !has(name, ['מניות', 'אג"ח', 'אגח', 'הלכה', 'כספי', 'עוקב', 'סחיר'])) track = 'general';
  return track ? { product, track } : null;
}

function classifyPension(row) {
  const classification = norm(row.FUND_CLASSIFICATION);
  const name = norm(row.FUND_NAME);
  const product = classification === 'קרנות חדשות' ? 'comprehensive_pension'
    : classification === 'קרנות כלליות' ? 'supplementary_pension' : null;
  if (!product || excludesPension(name)) return null;
  let track = null;
  if (has(name, ['50 ומטה'])) track = 'age_upto_50';
  else if (has(name, ['50-60', '50 עד 60'])) track = 'age_50_60';
  else if (has(name, ['60 ומעלה'])) track = 'age_60_plus';
  else if (has(name, ['אשראי']) && has(name, ['מניות', '25%'])) track = 'credit_bonds_upto_25_equities';
  else if (has(name, ['אשראי'])) track = 'credit_bonds';
  else if (has(name, ['מניות']) && !has(name, ['עוקב', 'סחיר', 's&p', 'sp500', 'sp 500'])) track = 'equities';
  else if (has(name, ['כללי']) && !has(name, ['מניות', 'הלכה', 'אשראי', 'כספי', 'סחיר', 'עוקב', 'קיימות', 'לבני', 'ומטה', 'ומעלה', '50-60', 's&p'])) track = 'general';
  return track ? { product, track } : null;
}

function classifyPolisa(row) {
  const classification = norm(row.FUND_CLASSIFICATION);
  const name = norm(row.FUND_NAME);
  if (!classification.startsWith('פוליסות שהונפקו')) return null;
  let track = null;
  if (has(name, ['אשראי']) && has(name, ['מניות', '25%'])) track = 'credit_bonds_upto_25_equities';
  else if (has(name, ['אשראי ואג"ח', 'אשראי אג"ח']) && !has(name, ['מניות'])) track = 'credit_bonds';
  else if (has(name, ['מניות']) && !has(name, ['סחיר', 'עוקב', 's&p', 'אג"ח', '25%', 'ממשלות', 'ממשלתי'])) track = 'equities';
  else if (has(name, ['כללי']) && !has(name, ['פאסיבי', 'apollo', 'שריעה', 'קצבה'])) track = 'general';
  return track ? { product: 'savings_policy', track } : null;
}

function loadGemel() {
  const rows = [...read(path.join(DATA, 'gemel-2023.json')), ...read(path.join(DATA, 'gemel-current.json'))];
  const dir = path.join(DATA, 'gemel-1999-2022');
  for (const file of fs.readdirSync(dir)) if (file.endsWith('.json') && file !== '_index.json') rows.push(...read(path.join(dir, file)));
  return rows;
}
function loadFamily(family) {
  return [
    ...read(path.join(DATA, `${family}-1999-2022.json`)),
    ...read(path.join(DATA, `${family}-2023.json`)),
    ...read(path.join(DATA, `${family}-current.json`)),
  ];
}

const sources = [
  ['gemel', loadGemel(), classifyGemel],
  ['pension', loadFamily('pension'), classifyPension],
  ['polisa', loadFamily('polisa'), classifyPolisa],
];
const dedup = new Map();
const continuity = { inferredRows: 0, inferredFunds: new Set(), byCohort: new Map() };
const generalTrackProducts = new Set(['gemel_investment', 'training_fund', 'savings_policy']);
for (const [source, rows, classify] of sources) {
  const latestByFund = new Map();
  for (const row of rows) {
    const fundId = String(row.FUND_ID || '').trim(), period = Number(row.REPORT_PERIOD);
    if (!fundId || !period) continue;
    const previous = latestByFund.get(fundId);
    if (!previous || Number(previous.REPORT_PERIOD) < period) latestByFund.set(fundId, row);
  }
  const continuityCohort = new Map();
  for (const [fundId, row] of latestByFund) {
    const cohort = classify(row);
    if (cohort && ['general', 'equities', 'credit_bonds', 'credit_bonds_upto_25_equities'].includes(cohort.track)) continuityCohort.set(fundId, cohort);
  }
  for (const row of rows) {
    const fundId = String(row.FUND_ID || '').trim(), period = Number(row.REPORT_PERIOD);
    const direct = classify(row);
    const inferred = !direct ? continuityCohort.get(fundId) : null;
    const cohort = direct || inferred;
    if (!cohort || !fundId || !period || !Number.isFinite(Number(row.MONTHLY_YIELD))) continue;
    if (cohort.track === 'general' && !generalTrackProducts.has(cohort.product)) continue;
    if (inferred) {
      continuity.inferredRows++;
      continuity.inferredFunds.add(`${source}_${fundId}`);
      const key = `${cohort.product}__${cohort.track}`;
      continuity.byCohort.set(key, (continuity.byCohort.get(key) || 0) + 1);
    }
    dedup.set(`${source}_${fundId}_${period}`, { source, fundId, period, fundName: String(row.FUND_NAME || ''), classificationMethod: inferred ? 'fund_id_continuity' : 'direct', raw: row, ...cohort });
  }
}

const cohorts = new Map();
for (const row of dedup.values()) {
  const key = `${row.product}__${row.track}`;
  if (!cohorts.has(key)) cohorts.set(key, { product: row.product, track: row.track, rows: 0, funds: new Set(), periods: new Set(), firstPeriod: Infinity, lastPeriod: 0 });
  const item = cohorts.get(key);
  item.rows++; item.funds.add(row.fundId); item.periods.add(row.period);
  item.firstPeriod = Math.min(item.firstPeriod, row.period); item.lastPeriod = Math.max(item.lastPeriod, row.period);
}
const summary = [...cohorts.values()].map(item => ({
  product: item.product,
  track: item.track,
  fundCount: item.funds.size,
  monthlyRows: item.rows,
  distinctMonths: item.periods.size,
  firstPeriod: item.firstPeriod,
  lastPeriod: item.lastPeriod,
  eligibleForStandaloneModel: item.funds.size >= 8 && item.periods.size >= 84,
})).sort((a, b) => a.product.localeCompare(b.product) || a.track.localeCompare(b.track));
const result = {
  generatedAt: new Date().toISOString(),
  scope: {
    products: ['gemel_regular', 'gemel_investment', 'training_fund', 'savings_policy', 'comprehensive_pension', 'supplementary_pension'],
    tracks: ['general', 'equities', 'credit_bonds', 'age_upto_50', 'age_50_60', 'age_60_plus', 'credit_bonds_upto_25_equities'],
    generalTrackProducts: [...generalTrackProducts],
    exclusions: ['child_savings', 'central_severance', 'index_tracking', 'tradable_only', 'cash', 'halacha', 'pension_recipients'],
  },
  totalEligibleRows: dedup.size,
  continuity: {
    inferredRows: continuity.inferredRows,
    inferredFunds: continuity.inferredFunds.size,
    inferredRowsByCohort: Object.fromEntries([...continuity.byCohort].sort()),
  },
  cohorts: summary,
};
export const researchRows = [...dedup.values()];
fs.mkdirSync(path.join(ROOT, 'backtest-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'research-universe-audit.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
