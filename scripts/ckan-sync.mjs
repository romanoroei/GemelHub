#!/usr/bin/env node
// Twice-daily data cache sync for GemelHub.
//
// The Ministry of Finance's "current" CKAN resources (gemel/pension/polisa) republish their file
// automatically every day even when no new monthly figures were added — so last_modified/metadata
// timestamps are NOT a reliable "was there an update" signal (verified against the live API). This
// script instead checks the actual max REPORT_PERIOD via a cheap single-row sorted query, and only
// pulls the full dataset (tens of thousands of rows) when that period has actually advanced.
//
// The six archival resources (2023-only, 1999-2022) are closed historical datasets — verified via
// their own metadata (last_modified frozen since 2024-07-10, two of them marked how_update:Manual).
// They're fetched exactly once and never touched again.
//
// Only gemel's 1999-2022 archive is sharded — one small file per FUND_ID instead of one monolithic
// file. As a single file it was 161MB, which exceeds GitHub's 100MB per-file push limit outright and
// would be a terrible payload to ever ship to a browser. Sharded, it's ~1,673 files averaging ~96KB
// each. A companion _index.json maps fund ID -> {classification, subSpecialization} so
// classification-level queries (used by some history features) can resolve which shards to merge
// without needing every row loaded anywhere.
//
// pension/polisa's 1999-2022 archives are NOT sharded, deliberately: at ~19.7MB/~26.7MB as single
// files they're already well under the size limit, AND several pension/polisa code paths
// (fetchPensionHistoricalRangeData / fetchPolisaHistoricalRangeData, hit on ordinary category
// browsing, not just a rare feature) pull them fully unfiltered — a shape sharding can't serve
// without reassembling every shard, which would defeat the point.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const BASE_URL = 'https://data.gov.il/api/3/action/datastore_search';
const PAGE_LIMIT = 32000;
const DATA_DIR = path.join(REPO_ROOT, 'data', 'ckan');
const STATE_FILE = path.join(DATA_DIR, 'sync-state.json');
const FAILURE_ALERT_THRESHOLD = 3; // ~1.5 days at twice-daily cadence
const MIN_RECORD_RATIO = 0.5; // refuse to overwrite good data with a suspiciously small fetch

const FAMILIES = {
  gemel: {
    current: 'a30dcbea-a1d2-482c-ae29-8f781f5025fb',
    archives: {
      '2023': { resourceId: '2016d770-f094-4a2e-983e-797c26479720' },
      '1999-2022': { resourceId: '91c849ed-ddc4-472b-bd09-0f5486cea35c', shardByFundId: true }
    }
  },
  pension: {
    current: '6d47d6b5-cb08-488b-b333-f1e717b1e1bd',
    archives: {
      '2023': { resourceId: '4694d5a7-5284-4f3d-a2cb-5887f43fb55e' },
      '1999-2022': { resourceId: 'a66926f3-e396-4984-a4db-75486751c2f7' }
    }
  },
  polisa: {
    current: 'c6c62cc7-fe02-4b18-8f3e-813abfbb4647',
    archives: {
      '2023': { resourceId: '672090ba-7893-4496-a07c-dc7e822cbf18' },
      '1999-2022': { resourceId: '584e6b69-174f-46c9-b8db-03925b4c68c6' }
    }
  }
};

async function ckanGet(params) {
  const url = `${BASE_URL}?${new URLSearchParams(params).toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const json = await resp.json();
  if (!json.success) throw new Error(`CKAN success=false for ${url}`);
  return json.result;
}

async function fetchAllRecords(resourceId) {
  let offset = 0;
  let total = Infinity;
  const all = [];
  while (offset < total) {
    const result = await ckanGet({ resource_id: resourceId, limit: String(PAGE_LIMIT), offset: String(offset) });
    const records = result.records || [];
    total = Number(result.total ?? records.length);
    all.push(...records);
    if (!records.length || records.length < PAGE_LIMIT) break;
    offset += records.length;
  }
  return { records: all, total };
}

async function latestReportPeriod(resourceId) {
  const result = await ckanGet({ resource_id: resourceId, limit: '1', sort: 'REPORT_PERIOD desc' });
  const rec = result.records?.[0];
  return rec ? Number(rec.REPORT_PERIOD) : null;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data));
}

async function fileExists(file) {
  try { await fs.access(file); return true; }
  catch { return false; }
}

function defaultState() {
  return {
    gemel: { lastPeriod: null },
    pension: { lastPeriod: null },
    polisa: { lastPeriod: null },
    consecutiveFailures: 0,
    alertIssueOpen: false,
    lastFailureAt: null,
    lastSuccessAt: null
  };
}

// Splits one archive's records into a shard file per FUND_ID, plus a small fund->classification
// index used to resolve classification-level queries against the shards later.
async function writeShardedArchive(dirName, records) {
  const dir = path.join(DATA_DIR, dirName);
  await fs.mkdir(dir, { recursive: true });

  const byFund = new Map();
  const index = {};
  for (const record of records) {
    const fundId = String(record.FUND_ID || '').trim();
    if (!fundId) continue;
    if (!byFund.has(fundId)) byFund.set(fundId, []);
    byFund.get(fundId).push(record);
    // Later records overwrite earlier ones in the index — fine, classification rarely changes,
    // and this is only used to route which shard(s) to check, not for historical precision.
    index[fundId] = {
      cls: (record.FUND_CLASSIFICATION || '').trim(),
      sub: (record.SUB_SPECIALIZATION || '').trim()
    };
  }

  await Promise.all(Array.from(byFund.entries()).map(([fundId, fundRecords]) =>
    writeJson(path.join(dir, `${fundId}.json`), fundRecords)
  ));
  await writeJson(path.join(dir, '_index.json'), index);

  return { fundCount: byFund.size };
}

async function main() {
  const state = { ...defaultState(), ...(await readJson(STATE_FILE, {})) };

  let anyChange = false;
  let checkFailed = false;

  // 1) Seed the six archival resources once — they never change again once present.
  for (const [familyName, family] of Object.entries(FAMILIES)) {
    for (const [archiveKey, archive] of Object.entries(family.archives)) {
      const marker = archive.shardByFundId
        ? path.join(DATA_DIR, `${familyName}-${archiveKey}`, '_index.json')
        : path.join(DATA_DIR, `${familyName}-${archiveKey}.json`);
      if (await fileExists(marker)) continue;
      try {
        console.log(`Seeding archive ${familyName}-${archiveKey} (one-time)...`);
        const { records, total } = await fetchAllRecords(archive.resourceId);
        if (archive.shardByFundId) {
          const { fundCount } = await writeShardedArchive(`${familyName}-${archiveKey}`, records);
          console.log(`  -> ${total} records across ${fundCount} fund shards.`);
        } else {
          await writeJson(path.join(DATA_DIR, `${familyName}-${archiveKey}.json`), {
            resource_id: archive.resourceId,
            fetched_at: new Date().toISOString(),
            total,
            records
          });
          console.log(`  -> ${total} records saved.`);
        }
        anyChange = true;
      } catch (err) {
        console.error(`  FAILED seeding ${familyName}-${archiveKey}:`, err.message);
        checkFailed = true;
      }
    }
  }

  // 2) Cheap check + conditional full refresh of the three "current" resources.
  for (const [familyName, family] of Object.entries(FAMILIES)) {
    const resourceId = family.current;
    const file = path.join(DATA_DIR, `${familyName}-current.json`);
    try {
      const latestPeriod = await latestReportPeriod(resourceId);
      const known = state[familyName]?.lastPeriod ?? null;
      const needsRefresh = latestPeriod !== known || !(await fileExists(file));
      if (needsRefresh) {
        console.log(`${familyName}: report period ${latestPeriod} (was ${known}) — refreshing full dataset...`);
        const { records, total } = await fetchAllRecords(resourceId);

        const previous = await readJson(file, null);
        if (previous?.total && total < previous.total * MIN_RECORD_RATIO) {
          throw new Error(`refusing to overwrite: new total ${total} is suspiciously low vs previous ${previous.total}`);
        }

        await writeJson(file, {
          resource_id: resourceId,
          fetched_at: new Date().toISOString(),
          report_period: latestPeriod,
          total,
          records
        });
        state[familyName] = { lastPeriod: latestPeriod };
        anyChange = true;
      } else {
        console.log(`${familyName}: no change (period ${latestPeriod}) — skipping refresh.`);
      }
    } catch (err) {
      console.error(`${familyName}: check/refresh FAILED:`, err.message);
      checkFailed = true;
    }
  }

  // 3) Failure-streak tracking, for alerting when the source is down for an extended stretch.
  const wasAboveThreshold = (state.consecutiveFailures || 0) >= FAILURE_ALERT_THRESHOLD;
  if (checkFailed) {
    state.consecutiveFailures = (state.consecutiveFailures || 0) + 1;
    state.lastFailureAt = new Date().toISOString();
  } else {
    state.consecutiveFailures = 0;
    state.lastSuccessAt = new Date().toISOString();
  }
  const nowAboveThreshold = state.consecutiveFailures >= FAILURE_ALERT_THRESHOLD;

  const openAlert = nowAboveThreshold && !state.alertIssueOpen;
  const closeAlert = !checkFailed && state.alertIssueOpen && wasAboveThreshold;
  if (openAlert) state.alertIssueOpen = true;
  if (closeAlert) state.alertIssueOpen = false;

  await writeJson(STATE_FILE, state);

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, [
      `changed=${anyChange}`,
      `open_alert=${openAlert}`,
      `close_alert=${closeAlert}`,
      `consecutive_failures=${state.consecutiveFailures}`,
      ''
    ].join('\n'));
  }

  console.log(`Done. changed=${anyChange} consecutiveFailures=${state.consecutiveFailures} openAlert=${openAlert} closeAlert=${closeAlert}`);
}

main().catch(err => {
  console.error('Fatal error in ckan-sync:', err);
  process.exitCode = 1;
});
