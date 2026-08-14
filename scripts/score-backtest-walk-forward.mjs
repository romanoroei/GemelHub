import fs from 'node:fs';
import path from 'node:path';
import { MODELS, obs, summarize } from './score-backtest.mjs';

const ROOT = process.cwd();
const TRACKS = ['כללי', 'מניות'];
const FIRST_TRAIN_YEAR = 2005;
const FIRST_TEST_YEAR = 2011;
const LAST_TEST_YEAR = 2024;
const candidates = Object.keys(MODELS).filter(name => name !== 'baseline');

// Predeclared selection objective. A bottom-third failure costs 1.5 times a
// top-third hit, while rank correlation and Top-3 quality provide secondary
// information. All inputs are calculated only on years before the test year.
function objective(metrics) {
  return metrics.topThirdHitRate
    - 1.5 * metrics.topThirdFallToBottomRate
    + 20 * metrics.spearman
    + 0.1 * (metrics.top3FuturePercentile - 50);
}

function chooseModel(trainingRows) {
  return candidates
    .map(model => {
      const metrics = summarize(trainingRows, model);
      return { model, objective: Number(objective(metrics).toFixed(3)), ...metrics };
    })
    .sort((a, b) =>
      (b.objective - a.objective) ||
      (a.topThirdFallToBottomRate - b.topThirdFallToBottomRate) ||
      (b.topThirdHitRate - a.topThirdHitRate) ||
      (b.spearman - a.spearman)
    )[0];
}

const folds = [];
const walkForwardRows = [];
for (let testYear = FIRST_TEST_YEAR; testYear <= LAST_TEST_YEAR; testYear++) {
  for (const track of TRACKS) {
    const trainingRows = obs.filter(row => row.track === track && row.year >= FIRST_TRAIN_YEAR && row.year < testYear);
    const testRows = obs.filter(row => row.track === track && row.year === testYear);
    if (!trainingRows.length || !testRows.length) continue;
    const selected = chooseModel(trainingRows);
    const selectedTest = summarize(testRows, selected.model);
    const baselineTest = summarize(testRows, 'baseline');
    folds.push({
      track,
      testYear,
      trainingYears: [FIRST_TRAIN_YEAR, testYear - 1],
      trainingN: trainingRows.length,
      testN: testRows.length,
      selectedModel: selected.model,
      trainingObjective: selected.objective,
      trainingMetrics: {
        spearman: selected.spearman,
        topThirdHitRate: selected.topThirdHitRate,
        topThirdFallToBottomRate: selected.topThirdFallToBottomRate,
        top3FuturePercentile: selected.top3FuturePercentile,
      },
      test: { selected: selectedTest, baseline: baselineTest },
      wins: {
        spearman: selectedTest.spearman > baselineTest.spearman,
        topThirdHitRate: selectedTest.topThirdHitRate > baselineTest.topThirdHitRate,
        topThirdFallToBottomRate: selectedTest.topThirdFallToBottomRate < baselineTest.topThirdFallToBottomRate,
        top3FuturePercentile: selectedTest.top3FuturePercentile > baselineTest.top3FuturePercentile,
      },
    });
    for (const row of testRows) {
      walkForwardRows.push({ ...row, scores: { ...row.scores, walkForward: row.scores[selected.model] } });
    }
  }
}

function aggregate(rows, model) {
  return summarize(rows, model);
}

function trackSummary(track) {
  const rows = walkForwardRows.filter(row => row.track === track);
  const trackFolds = folds.filter(fold => fold.track === track);
  const winCounts = Object.fromEntries(
    ['spearman', 'topThirdHitRate', 'topThirdFallToBottomRate', 'top3FuturePercentile']
      .map(metric => [metric, trackFolds.filter(fold => fold.wins[metric]).length])
  );
  const selections = {};
  for (const fold of trackFolds) selections[fold.selectedModel] = (selections[fold.selectedModel] || 0) + 1;
  return {
    folds: trackFolds.length,
    observations: rows.length,
    walkForward: aggregate(rows, 'walkForward'),
    baseline: aggregate(rows, 'baseline'),
    annualWinCounts: winCounts,
    modelSelectionFrequency: Object.fromEntries(Object.entries(selections).sort((a, b) => b[1] - a[1])),
  };
}

const combined = {
  folds: folds.length,
  observations: walkForwardRows.length,
  walkForward: aggregate(walkForwardRows, 'walkForward'),
  baseline: aggregate(walkForwardRows, 'baseline'),
};
const result = {
  generatedAt: new Date().toISOString(),
  design: {
    firstTrainingYear: FIRST_TRAIN_YEAR,
    testYears: [FIRST_TEST_YEAR, LAST_TEST_YEAR],
    protocol: 'Expanding-window, track-specific selection; each test year is unseen when its model is selected',
    selectionObjective: 'hitRate - 1.5*fallRate + 20*Spearman + 0.1*(Top3Percentile-50)',
    candidateCount: candidates.length,
  },
  summary: { combined, ...Object.fromEntries(TRACKS.map(track => [track, trackSummary(track)])) },
  folds,
};

fs.mkdirSync(path.join(ROOT, 'backtest-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'score-backtest-walk-forward.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
