import fs from 'node:fs';
import path from 'node:path';
import { MODELS, obs, summarize } from './score-backtest.mjs';

const ROOT = process.cwd();
const TRACKS = ['כללי', 'מניות'];
const FIRST_YEAR = 2005;
const TEST_YEARS = [2011, 2024];
const ENSEMBLE_SIZE = 5;
const candidates = Object.keys(MODELS).filter(name => name !== 'baseline');

function objective(metrics) {
  return metrics.topThirdHitRate
    - 1.5 * metrics.topThirdFallToBottomRate
    + 20 * metrics.spearman
    + 0.1 * (metrics.top3FuturePercentile - 50);
}
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
}
function family(model) {
  const match = model.match(/^(c\d+_m\d+_s\d+)_/);
  return match ? match[1] : model;
}

function stableRanking(trainingRows) {
  const years = [...new Set(trainingRows.map(row => row.year))].sort((a, b) => a - b);
  return candidates.map(model => {
    const aggregate = summarize(trainingRows, model);
    const annualObjectives = years.map(year => objective(summarize(trainingRows.filter(row => row.year === year), model)));
    const averageAnnual = mean(annualObjectives);
    const volatility = standardDeviation(annualObjectives);
    // Reward aggregate and year-by-year quality equally; penalize instability.
    const stabilityScore = 0.5 * objective(aggregate) + 0.5 * averageAnnual - 0.25 * volatility;
    return {
      model,
      family: family(model),
      stabilityScore: Number(stabilityScore.toFixed(3)),
      averageAnnualObjective: Number(averageAnnual.toFixed(3)),
      annualObjectiveVolatility: Number(volatility.toFixed(3)),
      aggregate,
    };
  }).sort((a, b) =>
    (b.stabilityScore - a.stabilityScore) ||
    (a.aggregate.topThirdFallToBottomRate - b.aggregate.topThirdFallToBottomRate) ||
    (b.aggregate.topThirdHitRate - a.aggregate.topThirdHitRate)
  );
}

function chooseDiverseEnsemble(trainingRows) {
  const selected = [];
  const usedFamilies = new Set();
  for (const candidate of stableRanking(trainingRows)) {
    if (usedFamilies.has(candidate.family)) continue;
    selected.push(candidate);
    usedFamilies.add(candidate.family);
    if (selected.length === ENSEMBLE_SIZE) break;
  }
  return selected;
}

const folds = [];
const ensembleRows = [];
for (let testYear = TEST_YEARS[0]; testYear <= TEST_YEARS[1]; testYear++) {
  for (const track of TRACKS) {
    const trainingRows = obs.filter(row => row.track === track && row.year >= FIRST_YEAR && row.year < testYear);
    const testRows = obs.filter(row => row.track === track && row.year === testYear);
    if (!trainingRows.length || !testRows.length) continue;
    const selected = chooseDiverseEnsemble(trainingRows);
    const foldRows = testRows.map(row => ({
      ...row,
      scores: {
        ...row.scores,
        ensemble: mean(selected.map(item => row.scores[item.model])),
      },
    }));
    ensembleRows.push(...foldRows);
    const ensembleTest = summarize(foldRows, 'ensemble');
    const baselineTest = summarize(foldRows, 'baseline');
    folds.push({
      track,
      testYear,
      trainingYears: [FIRST_YEAR, testYear - 1],
      selectedModels: selected.map(item => ({
        model: item.model,
        family: item.family,
        stabilityScore: item.stabilityScore,
      })),
      test: { ensemble: ensembleTest, baseline: baselineTest },
      wins: {
        spearman: ensembleTest.spearman > baselineTest.spearman,
        topThirdHitRate: ensembleTest.topThirdHitRate > baselineTest.topThirdHitRate,
        topThirdFallToBottomRate: ensembleTest.topThirdFallToBottomRate < baselineTest.topThirdFallToBottomRate,
        top3FuturePercentile: ensembleTest.top3FuturePercentile > baselineTest.top3FuturePercentile,
      },
    });
  }
}

function summary(track = null) {
  const rows = track ? ensembleRows.filter(row => row.track === track) : ensembleRows;
  const relevantFolds = track ? folds.filter(fold => fold.track === track) : folds;
  const annualWinCounts = Object.fromEntries(
    ['spearman', 'topThirdHitRate', 'topThirdFallToBottomRate', 'top3FuturePercentile']
      .map(metric => [metric, relevantFolds.filter(fold => fold.wins[metric]).length])
  );
  const familyFrequency = {};
  for (const fold of relevantFolds) for (const item of fold.selectedModels) {
    familyFrequency[item.family] = (familyFrequency[item.family] || 0) + 1;
  }
  return {
    folds: relevantFolds.length,
    observations: rows.length,
    ensemble: summarize(rows, 'ensemble'),
    baseline: summarize(rows, 'baseline'),
    annualWinCounts,
    familySelectionFrequency: Object.fromEntries(Object.entries(familyFrequency).sort((a, b) => b[1] - a[1])),
  };
}

const result = {
  generatedAt: new Date().toISOString(),
  design: {
    trainingStartYear: FIRST_YEAR,
    testYears: TEST_YEARS,
    ensembleSize: ENSEMBLE_SIZE,
    candidateCount: candidates.length,
    protocol: 'Track-specific expanding-window outer test; five stable, distinct weight families selected from prior years only',
    stabilityRule: '0.5*aggregateObjective + 0.5*meanAnnualObjective - 0.25*annualObjectiveStdDev',
    objective: 'hitRate - 1.5*fallRate + 20*Spearman + 0.1*(Top3Percentile-50)',
  },
  summary: { combined: summary(), ...Object.fromEntries(TRACKS.map(track => [track, summary(track)])) },
  folds,
};

fs.mkdirSync(path.join(ROOT, 'backtest-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'score-backtest-ensemble.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
