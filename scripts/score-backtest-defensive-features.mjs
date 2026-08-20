import fs from 'node:fs';
import path from 'node:path';
import { MODELS, TRACKS, byTrackFund, obs, periodsForYear, compound, ranks, summarize } from './score-backtest.mjs';

const ROOT = process.cwd();
const FIRST_YEAR = 2005;
const TEST_YEARS = [2011, 2024];
const baseModels = Object.keys(MODELS).filter(name => name !== 'baseline');
const defensiveWeights = [.10, .20, .30];
const defensiveShapes = {
  balanced: [.25, .25, .25, .25],
  downside: [.15, .35, .35, .15],
  stability: [.35, .15, .15, .35],
};

const average = values => values.reduce((a, b) => a + b, 0) / values.length;
function deviation(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
}
function monthPeriods(endYear, count = 36) {
  const periods = [];
  let year = endYear, month = 12;
  for (let i = 0; i < count; i++) {
    periods.push(year * 100 + month);
    if (--month === 0) { month = 12; year--; }
  }
  return periods.reverse();
}
function monthlyFeatures(records, year) {
  const returns = monthPeriods(year).map(period => Number(records.get(period)?.MONTHLY_YIELD));
  if (returns.some(value => !Number.isFinite(value))) return null;
  const positiveRatio = returns.filter(value => value > 0).length / returns.length;
  const negatives = returns.map(value => Math.min(value, 0));
  const downsideDeviation = Math.sqrt(average(negatives.map(value => value ** 2)));
  let wealth = 1, peak = 1, maxDrawdown = 0;
  for (const value of returns) {
    wealth *= 1 + value / 100;
    peak = Math.max(peak, wealth);
    maxDrawdown = Math.max(maxDrawdown, (peak - wealth) / peak);
  }
  return { positiveRatio, downsideDeviation, maxDrawdown };
}

const extended = [];
const groups = new Map();
for (const row of obs) {
  const key = `${row.track}_${row.year}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
for (const group of groups.values()) {
  const track = group[0].track, year = group[0].year;
  const ids = new Set(group.map(row => row.fundId));
  const positive = new Map(), downside = new Map(), drawdown = new Map();
  for (const row of group) {
    const features = monthlyFeatures(byTrackFund.get(track).get(row.fundId), year);
    if (!features) continue;
    positive.set(row.fundId, features.positiveRatio);
    downside.set(row.fundId, features.downsideDeviation);
    drawdown.set(row.fundId, features.maxDrawdown);
  }
  const annualPercentiles = [];
  for (let annualYear = year - 4; annualYear <= year; annualYear++) {
    const values = new Map();
    for (const id of ids) {
      const value = compound(byTrackFund.get(track).get(id), periodsForYear(annualYear));
      if (Number.isFinite(value)) values.set(id, value);
    }
    annualPercentiles.push(ranks(values));
  }
  const rankInstability = new Map();
  for (const id of ids) {
    const values = annualPercentiles.map(map => map.get(id));
    if (values.every(Number.isFinite)) rankInstability.set(id, deviation(values));
  }
  const featureRanks = [ranks(positive, true), ranks(downside, false), ranks(drawdown, false), ranks(rankInstability, false)];
  for (const row of group) {
    const defensiveParts = featureRanks.map(map => map.get(row.fundId));
    const scores = { ...row.scores };
    for (const baseModel of baseModels) {
      for (const defensiveWeight of defensiveWeights) {
        for (const [shape, mix] of Object.entries(defensiveShapes)) {
          const defensiveScore = defensiveParts.reduce((sum, value, i) => sum + value * mix[i], 0);
          scores[`${baseModel}_d${defensiveWeight * 100}_${shape}`] = row.scores[baseModel] * (1 - defensiveWeight) + defensiveScore * defensiveWeight;
        }
      }
    }
    extended.push({ ...row, scores });
  }
}

const candidates = Object.keys(extended[0].scores).filter(name => name.includes('_d'));
function objective(metrics) {
  return metrics.topThirdHitRate - 1.5 * metrics.topThirdFallToBottomRate + 20 * metrics.spearman + 0.1 * (metrics.top3FuturePercentile - 50);
}
function choose(trainingRows) {
  const years = [...new Set(trainingRows.map(row => row.year))];
  return candidates.map(model => {
    const aggregate = summarize(trainingRows, model);
    const annual = years.map(year => objective(summarize(trainingRows.filter(row => row.year === year), model)));
    const stabilityScore = objective(aggregate) - .25 * deviation(annual);
    return { model, stabilityScore: Number(stabilityScore.toFixed(3)), aggregate };
  }).sort((a, b) =>
    (b.stabilityScore - a.stabilityScore) ||
    (a.aggregate.topThirdFallToBottomRate - b.aggregate.topThirdFallToBottomRate) ||
    (b.aggregate.topThirdHitRate - a.aggregate.topThirdHitRate)
  )[0];
}

const folds = [], selectedRows = [];
for (let testYear = TEST_YEARS[0]; testYear <= TEST_YEARS[1]; testYear++) {
  for (const track of TRACKS) {
    const trainingRows = extended.filter(row => row.track === track && row.year >= FIRST_YEAR && row.year < testYear);
    const testRows = extended.filter(row => row.track === track && row.year === testYear);
    const selected = choose(trainingRows);
    const foldRows = testRows.map(row => ({ ...row, scores: { ...row.scores, defensiveSelected: row.scores[selected.model] } }));
    selectedRows.push(...foldRows);
    const modelTest = summarize(foldRows, 'defensiveSelected'), baselineTest = summarize(foldRows, 'baseline');
    folds.push({
      track, testYear, selectedModel: selected.model, trainingStabilityScore: selected.stabilityScore,
      test: { defensive: modelTest, baseline: baselineTest },
      wins: {
        spearman: modelTest.spearman > baselineTest.spearman,
        topThirdHitRate: modelTest.topThirdHitRate > baselineTest.topThirdHitRate,
        topThirdFallToBottomRate: modelTest.topThirdFallToBottomRate < baselineTest.topThirdFallToBottomRate,
        top3FuturePercentile: modelTest.top3FuturePercentile > baselineTest.top3FuturePercentile,
      },
    });
  }
}
function summary(track = null) {
  const rows = track ? selectedRows.filter(row => row.track === track) : selectedRows;
  const relevant = track ? folds.filter(fold => fold.track === track) : folds;
  return {
    observations: rows.length,
    folds: relevant.length,
    defensive: summarize(rows, 'defensiveSelected'),
    baseline: summarize(rows, 'baseline'),
    annualWinCounts: Object.fromEntries(['spearman', 'topThirdHitRate', 'topThirdFallToBottomRate', 'top3FuturePercentile'].map(metric => [metric, relevant.filter(fold => fold.wins[metric]).length])),
  };
}
const result = {
  generatedAt: new Date().toISOString(),
  design: {
    testYears: TEST_YEARS,
    featureWindowMonths: 36,
    features: ['positive-month ratio', 'downside deviation', 'maximum drawdown', 'five-year rank stability'],
    candidateCount: candidates.length,
    protocol: 'Track-specific expanding walk-forward; feature and model selection use prior data only',
  },
  summary: { combined: summary(), ...Object.fromEntries(TRACKS.map(track => [track, summary(track)])) },
  folds,
};
fs.mkdirSync(path.join(ROOT, 'backtest-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'score-backtest-defensive-features.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
