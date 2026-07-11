import fs from 'node:fs';
import { fetchLatestReportPeriod, formatPeriodFolder, getExistingPeriod, loadConfig } from './share-image-utils.mjs';

const config = loadConfig();
const latestPeriod = await fetchLatestReportPeriod(config);
const latestFolder = formatPeriodFolder(latestPeriod);
const existingPeriod = getExistingPeriod();
const changed = latestFolder !== existingPeriod;

const result = {
  latestRawPeriod: latestPeriod,
  latestPeriod: latestFolder,
  existingPeriod,
  changed
};

console.log(JSON.stringify(result, null, 2));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `latest_raw_period=${latestPeriod}`,
    `latest_period=${latestFolder}`,
    `existing_period=${existingPeriod}`,
    `changed=${changed ? 'true' : 'false'}`
  ].join('\n') + '\n');
}
