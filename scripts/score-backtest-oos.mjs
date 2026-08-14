import fs from 'node:fs';
import path from 'node:path';
import { MODELS, obs, summarize } from './score-backtest.mjs';

const ROOT = process.cwd();
const TRACKS = ['כללי', 'מניות'];
const TRAIN = [2005, 2014];
const TEST = [2015, 2024];
const inYears = (row, years) => row.year >= years[0] && row.year <= years[1];
const training = obs.filter(row => inYears(row, TRAIN));
const testing = obs.filter(row => inYears(row, TEST));

// Selection is performed using training rows only. The test rows are not used
// anywhere in model ranking or tie-breaking.
const candidates = Object.keys(MODELS).filter(name => name !== 'baseline');
const compare = (a, b) =>
  (b.spearman - a.spearman) ||
  (b.topThirdHitRate - a.topThirdHitRate) ||
  (a.topThirdFallToBottomRate - b.topThirdFallToBottomRate) ||
  (b.top3FuturePercentile - a.top3FuturePercentile);
const trainingRanking = candidates
  .map(model => ({ model, ...summarize(training, model) }))
  .sort(compare);
const selectedModel = trainingRanking[0].model;

// The previously discovered 55/35/10 model is represented with all three
// pre-declared five-year consistency shapes. In every case momentum is split
// 50%/30%/20% across 3/6/12 months (the "short" shape).
const fixedLeaderVariants = ['equal', 'mild', 'strong']
  .map(shape => `c55_m35_s10_${shape}_short`)
  .filter(name => MODELS[name]);
const reportModels = [...new Set(['baseline', selectedModel, ...fixedLeaderVariants])];

function report(rows) {
  const result = { combined: {} };
  for (const model of reportModels) result.combined[model] = summarize(rows, model);
  for (const track of TRACKS) {
    const trackRows = rows.filter(row => row.track === track);
    result[track] = {};
    for (const model of reportModels) result[track][model] = summarize(trackRows, model);
  }
  return result;
}

const testRanking = candidates
  .map(model => ({ model, ...summarize(testing, model) }))
  .sort(compare);
const result = {
  generatedAt: new Date().toISOString(),
  design: {
    trainingYears: TRAIN,
    testingYears: TEST,
    selectionRule: 'Highest combined training Spearman; ties: hit rate, lower fall rate, Top-3 future percentile',
    candidateCount: candidates.length,
    selectedModel,
    fixedLeader: '55% consistency + 35% momentum + 10% Sharpe; momentum 3m/6m/12m = 50%/30%/20%',
    fixedLeaderVariants,
  },
  observations: {
    training: { combined: training.length, ...Object.fromEntries(TRACKS.map(track => [track, training.filter(row => row.track === track).length])) },
    testing: { combined: testing.length, ...Object.fromEntries(TRACKS.map(track => [track, testing.filter(row => row.track === track).length])) },
  },
  training: report(training),
  testing: report(testing),
  trainingTop20: trainingRanking.slice(0, 20),
  testRankOfTrainingWinner: testRanking.findIndex(row => row.model === selectedModel) + 1,
  testingTop20: testRanking.slice(0, 20),
};

fs.mkdirSync(path.join(ROOT, 'backtest-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'backtest-results', 'score-backtest-oos.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
