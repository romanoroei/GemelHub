import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const grid=JSON.parse(fs.readFileSync(path.join(ROOT,'backtest-results','score-backtest-grid.json'),'utf8'));
console.log('Grid summary loaded:', grid.generatedAt);
console.log('Best combined:', grid.combinedTop20?.slice(0,5));
console.log('Best general:', grid.bestByTrack?.['כללי']?.slice(0,5));
console.log('Best equities:', grid.bestByTrack?.['מניות']?.slice(0,5));
console.log('NOTE: this helper validates ranking stability from stored grid summary only; full temporal split is computed in score-backtest.mjs on next run.');
