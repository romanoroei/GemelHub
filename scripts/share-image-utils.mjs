import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const SHARE_IMAGE_ROOT = path.join(process.cwd(), 'assets', 'share-images');
export const LATEST_PERIOD_FILE = path.join(SHARE_IMAGE_ROOT, 'latest-period.json');

export function slug(value) {
  const out = Array.from(String(value || '').trim()).map((ch) => {
    if (/^[a-z0-9_-]$/i.test(ch)) return ch.toLowerCase();
    return `-${ch.codePointAt(0).toString(16)}-`;
  }).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return out || 'item';
}

export function loadConfig() {
  const configPath = path.join(process.cwd(), 'js', 'config.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const context = { console };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.CONFIG = CONFIG;`, context, { filename: configPath });
  return context.CONFIG;
}

export function getImagePath({ period, categoryId, trackId, mode }) {
  return path.join(SHARE_IMAGE_ROOT, String(period), `${slug(categoryId)}__${slug(trackId)}__${slug(mode)}.png`);
}

export function getExistingPeriod() {
  try {
    const data = JSON.parse(fs.readFileSync(LATEST_PERIOD_FILE, 'utf8'));
    return data?.period ? String(data.period) : '';
  } catch {
    return '';
  }
}

export function writeLatestPeriod(period, extra = {}) {
  fs.mkdirSync(SHARE_IMAGE_ROOT, { recursive: true });
  fs.writeFileSync(
    LATEST_PERIOD_FILE,
    `${JSON.stringify({ period: String(period), generatedAt: new Date().toISOString(), ...extra }, null, 2)}\n`
  );
}

export async function fetchLatestReportPeriod(config = loadConfig()) {
  const resources = [
    config.API.GEMEL_RESOURCE_ID,
    config.API.PENSION_RESOURCE_ID,
    config.API.POLISA_RESOURCE_ID
  ].filter(Boolean);

  const periods = await Promise.all(resources.map(async (resourceId) => {
    const url = new URL(config.API.BASE_URL);
    url.searchParams.set('resource_id', resourceId);
    url.searchParams.set('limit', '1');
    url.searchParams.set('sort', 'REPORT_PERIOD desc');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch latest period for ${resourceId}: ${res.status}`);
    const data = await res.json();
    const record = data?.result?.records?.[0];
    return Number(record?.REPORT_PERIOD) || 0;
  }));

  const latest = Math.max(...periods);
  if (!latest) throw new Error('Could not detect latest REPORT_PERIOD');
  return String(latest);
}

export function formatPeriodFolder(period) {
  const value = String(period || '');
  return value.length === 6 ? `${value.slice(0, 4)}-${value.slice(4)}` : value;
}

export function buildTargets(config = loadConfig()) {
  const categories = config.PRODUCT_CATEGORIES
    .filter((category) => category?.id && category.id !== 'removed_legacy_category')
    .filter((category) => Array.isArray(category.trackList) && category.trackList.length);
  const trackById = new Map((config.INVESTMENT_TRACKS || []).map((track) => [track.id, track]));
  const modes = ['returns', 'allocation'];
  const targets = [];

  for (const category of categories) {
    for (const trackId of category.trackList) {
      const track = trackById.get(trackId);
      if (!track) continue;
      for (const mode of modes) {
        targets.push({
          categoryId: category.id,
          categoryLabel: category.label || category.id,
          trackId,
          trackLabel: track.label || trackId,
          mode
        });
      }
    }
  }

  const envLimit = Number(process.env.SHARE_IMAGE_TARGET_LIMIT || 0);
  return envLimit > 0 ? targets.slice(0, envLimit) : targets;
}
