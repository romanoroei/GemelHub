#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, '..');
const dataDir = path.join(repoRoot, 'data', 'ckan');
const outputFile = path.join(dataDir, 'trailing-7y.json');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function shiftPeriod(period, deltaMonths) {
  const year = Math.floor(period / 100);
  const month = period % 100;
  const date = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

function periodsInRange(startPeriod, endPeriod) {
  const periods = [];
  let current = startPeriod;
  while (current <= endPeriod) {
    periods.push(current);
    current = shiftPeriod(current, 1);
  }
  return periods;
}

async function loadFamilyRecords(family) {
  const current = (await readJson(path.join(dataDir, `${family}-current.json`))).records || [];
  const year2023 = (await readJson(path.join(dataDir, `${family}-2023.json`))).records || [];
  let archive = [];
  if (family === 'gemel') {
    const archiveDir = path.join(dataDir, 'gemel-1999-2022');
    const files = (await fs.readdir(archiveDir)).filter(name => name.endsWith('.json') && name !== '_index.json');
    const chunks = await Promise.all(files.map(name => readJson(path.join(archiveDir, name))));
    archive = chunks.flat();
  } else {
    archive = (await readJson(path.join(dataDir, `${family}-1999-2022.json`))).records || [];
  }
  return [...archive, ...year2023, ...current];
}

function calculateFamily(records) {
  const reportPeriod = records.reduce((latest, record) => Math.max(latest, Number(record.REPORT_PERIOD) || 0), 0);
  const expectedPeriods = reportPeriod ? periodsInRange(shiftPeriod(reportPeriod, -83), reportPeriod) : [];
  const expectedSet = new Set(expectedPeriods);
  const byFund = new Map();

  for (const record of records) {
    const fundId = String(record.FUND_ID || '').trim();
    const period = Number(record.REPORT_PERIOD) || 0;
    if (!fundId || !expectedSet.has(period)) continue;
    if (!byFund.has(fundId)) byFund.set(fundId, new Map());
    byFund.get(fundId).set(period, Number(record.MONTHLY_YIELD));
  }

  const values = {};
  for (const [fundId, monthlyByPeriod] of byFund) {
    if (monthlyByPeriod.size !== expectedPeriods.length) continue;
    let compound = 1;
    let valid = true;
    for (const period of expectedPeriods) {
      const monthlyYield = monthlyByPeriod.get(period);
      if (!Number.isFinite(monthlyYield)) { valid = false; break; }
      compound *= 1 + monthlyYield / 100;
    }
    if (valid) values[fundId] = (compound - 1) * 100;
  }

  return { reportPeriod, values };
}

export async function buildTrailing7YFile() {
  const families = {};
  for (const family of ['gemel', 'pension', 'polisa']) {
    const records = await loadFamilyRecords(family);
    families[family] = calculateFamily(records);
  }
  const output = { schemaVersion: 1, generatedAt: new Date().toISOString(), families };
  await fs.writeFile(outputFile, JSON.stringify(output));
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = await buildTrailing7YFile();
  const fundCount = Object.values(output.families).reduce((sum, family) => sum + Object.keys(family.values).length, 0);
  console.log(`Wrote ${path.relative(repoRoot, outputFile)} (${fundCount} funds).`);
}
