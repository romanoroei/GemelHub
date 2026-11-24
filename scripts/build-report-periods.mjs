#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFamilyRecords } from './build-trailing-7y.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildReportPeriodsFile() {
  // Evaluate the same category/provider rules used by the browser, with no network access.
  const context = vm.createContext({});
  for (const file of ['js/config.js', 'js/api.js']) {
    vm.runInContext(await fs.readFile(path.join(repoRoot, file), 'utf8'), context);
  }
  const categories = vm.runInContext('CONFIG.PRODUCT_CATEGORIES', context);
  const filter = vm.runInContext('APIModule.filterRangeEligibleRecords', context);
  const output = { schemaVersion: 1, categories: {} };
  for (const family of ['gemel', 'pension', 'polisa']) {
    const records = await loadFamilyRecords(family);
    const populations = [...new Set(['', 'כלל האוכלוסיה', ...records.map(r => r.TARGET_POPULATION || '')])];
    for (const category of categories) {
      const categoryFamily = category.pensionAPI ? 'pension' : category.polisaAPI ? 'polisa' : 'gemel';
      if (categoryFamily !== family) continue;
      const byPopulation = {};
      for (const population of populations) {
        byPopulation[population] = [...new Set(filter(records, category.id, population)
          .map(r => Number(r.REPORT_PERIOD)).filter(Boolean))].sort((a, b) => b - a);
      }
      output.categories[category.id] = byPopulation;
    }
  }
  await fs.writeFile(path.join(repoRoot, 'data/ckan/report-periods.json'), JSON.stringify(output));
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = await buildReportPeriodsFile();
  console.log('Wrote report-periods.json (' + Object.keys(output.categories).length + ' categories).');
}
