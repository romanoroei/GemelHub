import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  buildTargets,
  fetchLatestReportPeriod,
  formatPeriodFolder,
  getImagePath,
  loadConfig,
  writeLatestPeriod
} from './share-image-utils.mjs';

const config = loadConfig();
const latestRawPeriod = process.env.SHARE_IMAGE_PERIOD_RAW || await fetchLatestReportPeriod(config);
const period = process.env.SHARE_IMAGE_PERIOD || formatPeriodFolder(latestRawPeriod);
const allTargets = buildTargets(config);
const targetCategory = process.env.SHARE_IMAGE_CATEGORY || '';
const targetTrack = process.env.SHARE_IMAGE_TRACK || '';
const targetMode = process.env.SHARE_IMAGE_MODE || '';
const targetLimit = Number.parseInt(process.env.SHARE_IMAGE_LIMIT || '', 10);
const targets = allTargets
  .filter((target) => !targetCategory || target.categoryId === targetCategory)
  .filter((target) => !targetTrack || target.trackId === targetTrack)
  .filter((target) => !targetMode || target.mode === targetMode)
  .slice(0, Number.isFinite(targetLimit) && targetLimit > 0 ? targetLimit : undefined);
const siteUrl = process.env.SHARE_IMAGE_SITE_URL || 'https://romanoroei.github.io/GemelHub/';
const outDir = path.join(process.cwd(), 'assets', 'share-images', period);

fs.mkdirSync(outDir, { recursive: true });

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function startServer() {
  const root = process.cwd();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const decoded = decodeURIComponent(url.pathname);
    const safePath = path.normalize(decoded === '/' ? '/index.html' : decoded).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(root, safePath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function waitForTrackBlock(page, trackId, timeout = 90000) {
  await page.waitForFunction((id) => {
    const block = Array.from(document.querySelectorAll('.track-block'))
      .find((item) => item.dataset.trackId === id);
    return !!block?.querySelector('table.track-table tbody tr:not(.average-row)');
  }, trackId, { timeout });
}

async function enableAllocationMode(page, trackId) {
  await page.evaluate((id) => {
    const block = Array.from(document.querySelectorAll('.track-block'))
      .find((item) => item.dataset.trackId === id);
    block?.querySelector('.exp-toggle-btn')?.click();
  }, trackId);

  await page.waitForFunction((id) => {
    const block = Array.from(document.querySelectorAll('.track-block'))
      .find((item) => item.dataset.trackId === id);
    return !!block?.querySelector('table.track-table td.exp-col');
  }, trackId, { timeout: 30000 });
}

async function waitForReturnsColumns(page, trackId) {
  await page.waitForFunction((id) => {
    const block = Array.from(document.querySelectorAll('.track-block'))
      .find((item) => item.dataset.trackId === id);
    const table = block?.querySelector('table.track-table');
    return !!table?.querySelector('th[data-sortfield="7yr"]') && !table.querySelector('.cell-loader');
  }, trackId, { timeout: 60000 }).catch(() => {});
}

async function preparePage(page, target, baseUrl) {
  const url = new URL('/index.html', baseUrl);
  url.searchParams.set('cat', target.categoryId);
  url.searchParams.set('focusTrack', target.trackId);
  url.searchParams.set('ghShareCapture', '1');

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForTrackBlock(page, target.trackId);

  if (target.mode === 'allocation') {
    await enableAllocationMode(page, target.trackId);
  } else {
    await waitForReturnsColumns(page, target.trackId);
  }

  await page.addStyleTag({
    content: `
      html, body {
        width: 1180px !important;
        min-width: 1180px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #f3f6fb !important;
      }
      body.gemelhub-share-capture > :not(.gemelhub-share-stage) {
        display: none !important;
      }
      body.gemelhub-share-capture .sticky-header,
      body.gemelhub-share-capture .mobile-app-nav,
      body.gemelhub-share-capture .mobile-recent-funds-drawer,
      body.gemelhub-share-capture .whatsapp-float,
      body.gemelhub-share-capture .floating-chat,
      body.gemelhub-share-capture .consult-modal,
      body.gemelhub-share-capture .cookie-banner,
      body.gemelhub-share-capture .track-header-controls,
      body.gemelhub-share-capture .track-share-image-btn,
      body.gemelhub-share-capture .share-track-image-btn,
      body.gemelhub-share-capture .mobile-table-logo-bar,
      body.gemelhub-share-capture .track-thead-clone {
        display: none !important;
      }
      .gemelhub-share-stage {
        direction: rtl;
        width: 1140px;
        margin: 22px auto;
        background: #fff;
        border: 1px solid #d8c589;
        box-shadow: 0 18px 42px rgba(15, 23, 42, .16);
        overflow: hidden;
      }
      body.gemelhub-share-capture .track-block {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: #fff !important;
        overflow: hidden !important;
      }
      body.gemelhub-share-capture .track-header {
        position: static !important;
        top: auto !important;
        border-radius: 0 !important;
        justify-content: center !important;
        padding: 16px 18px !important;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%) !important;
        border: 0 !important;
        border-bottom: 2px solid #d8c589 !important;
        cursor: default !important;
      }
      body.gemelhub-share-capture .track-title-group {
        justify-content: center !important;
      }
      body.gemelhub-share-capture .track-label {
        justify-content: center !important;
        text-align: center !important;
        font-size: 34px !important;
        gap: 14px !important;
        line-height: 1.15 !important;
      }
      body.gemelhub-share-capture .track-name {
        color: #fff !important;
      }
      body.gemelhub-share-capture .track-table-wrapper {
        overflow: hidden !important;
        width: 100% !important;
      }
      body.gemelhub-share-capture table.track-table {
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        font-size: 18px !important;
      }
      body.gemelhub-share-capture table.track-table th,
      body.gemelhub-share-capture table.track-table td {
        padding: 10px 12px !important;
        white-space: normal !important;
      }
      body.gemelhub-share-capture table.track-table th:nth-child(1),
      body.gemelhub-share-capture table.track-table td:nth-child(1) {
        width: 54px !important;
        min-width: 54px !important;
        max-width: 54px !important;
      }
      body.gemelhub-share-capture table.track-table th:nth-child(2),
      body.gemelhub-share-capture table.track-table td:nth-child(2) {
        width: 230px !important;
        min-width: 230px !important;
        max-width: 230px !important;
      }
      body.gemelhub-share-capture table.track-table th:nth-child(n+3),
      body.gemelhub-share-capture table.track-table td:nth-child(n+3) {
        width: 142px !important;
        min-width: 142px !important;
        max-width: 142px !important;
      }
      body.gemelhub-share-capture table.track-table thead,
      body.gemelhub-share-capture table.track-table thead tr,
      body.gemelhub-share-capture table.track-table thead th {
        position: static !important;
        top: auto !important;
      }
      body.gemelhub-share-capture table.track-table .sandbox-check,
      body.gemelhub-share-capture table.track-table .fund-link-icon {
        display: none !important;
      }
      body.gemelhub-share-capture table.track-table .provider-cell,
      body.gemelhub-share-capture table.track-table .provider-cell > div {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
      }
      body.gemelhub-share-capture table.track-table .prov-name,
      body.gemelhub-share-capture table.track-table .prov-name-text {
        display: block !important;
        width: 100% !important;
        max-width: none !important;
        overflow: visible !important;
        text-overflow: clip !important;
        white-space: normal !important;
        line-height: 1.08 !important;
        font-size: 18px !important;
        font-weight: 900 !important;
      }
      body.gemelhub-share-capture table.track-table .prov-id {
        justify-content: flex-start !important;
        gap: 6px !important;
        font-size: 14px !important;
      }
      body.gemelhub-share-capture table.track-table .yield-value-wrap,
      body.gemelhub-share-capture table.track-table .yield-number-shell {
        overflow: visible !important;
      }
      body.gemelhub-share-capture table.track-table .yield-top-rank {
        display: inline-flex !important;
        position: static !important;
        transform: none !important;
        align-items: center !important;
        justify-content: center !important;
        width: 18px !important;
        height: 18px !important;
        min-width: 18px !important;
        margin-inline-start: 4px !important;
        font-size: 11px !important;
        line-height: 18px !important;
      }
      body.gemelhub-share-capture.capture-mode-returns table.track-table th.exp-col,
      body.gemelhub-share-capture.capture-mode-returns table.track-table td.exp-col {
        display: none !important;
      }
      body.gemelhub-share-capture.capture-mode-allocation table.track-table th.yield-col,
      body.gemelhub-share-capture.capture-mode-allocation table.track-table td.yield-cell,
      body.gemelhub-share-capture.capture-mode-allocation table.track-table .custom-range-col {
        display: none !important;
      }
      body.gemelhub-share-capture .track-block-note {
        text-align: center !important;
        font-size: 12px !important;
        padding: 10px 18px !important;
      }
      .gemelhub-share-brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 14px 16px 10px;
        background: #fff;
        border-bottom: 1px solid #d8c589;
      }
      .gemelhub-share-brand img {
        height: 76px;
        width: auto;
        display: block;
      }
      .gemelhub-share-link {
        font: 700 12px/1.2 Arial, sans-serif;
        color: #d19b13;
      }
      .gemelhub-share-mode {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 6px;
        padding: 8px 24px;
        border-radius: 999px;
        border: 1px solid #d8c589;
        background: #fff9df;
        color: #1f3b68;
        font: 900 24px/1 Arial, sans-serif;
      }
      .gemelhub-share-footer {
        padding: 12px 16px;
        text-align: center;
        direction: rtl;
        font: 700 18px/1.4 Arial, sans-serif;
        color: #1f3b68;
        background: #fff;
        border-top: 1px solid #e7dcb8;
      }
    `
  });

  await page.evaluate(({ trackId, siteUrl, period, mode }) => {
    document.body.classList.add('gemelhub-share-capture');
    document.body.classList.toggle('capture-mode-allocation', mode === 'allocation');
    document.body.classList.toggle('capture-mode-returns', mode !== 'allocation');
    document.documentElement.style.scrollBehavior = 'auto';

    const block = Array.from(document.querySelectorAll('.track-block'))
      .find((item) => item.dataset.trackId === trackId);
    if (!block) return;

    const stage = document.createElement('main');
    stage.className = 'gemelhub-share-stage';
    document.body.replaceChildren(stage);
    stage.appendChild(block);

    block.querySelector('.track-header-controls')?.remove();
    block.querySelector('.track-share-image-btn')?.remove();
    block.querySelector('.share-track-image-btn')?.remove();
    block.querySelector('.track-thead-clone')?.remove();
    block.querySelector('.track-table-wrapper')?.scrollTo?.({ left: 0, top: 0 });

    if (!block.querySelector('.gemelhub-share-brand')) {
      const brand = document.createElement('div');
      brand.className = 'gemelhub-share-brand';
      brand.innerHTML = `<img src="assets/gemelhub-logo-print.svg" alt="GemelHub"><div class="gemelhub-share-link">${siteUrl}</div><div class="gemelhub-share-mode">${mode === 'allocation' ? 'אלוקציית השקעות' : 'תשואה מצטברת'}</div>`;
      block.insertBefore(brand, block.firstElementChild);
    }

    if (!block.querySelector('.gemelhub-share-footer')) {
      const footer = document.createElement('div');
      footer.className = 'gemelhub-share-footer';
      footer.textContent = `נוצר ב-GemelHub · נתוני חודש ${period} · ${siteUrl}`;
      block.appendChild(footer);
    }
  }, { trackId: target.trackId, siteUrl, period, mode: target.mode });

  await page.waitForTimeout(350);
  return page.locator('.gemelhub-share-stage');
}

const { server, baseUrl } = await startServer();
const browser = await chromium.launch({ headless: true });
const skipped = [];
let written = 0;

try {
  for (const target of targets) {
    const imagePath = getImagePath({ period, categoryId: target.categoryId, trackId: target.trackId, mode: target.mode });
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    const context = await browser.newContext({
      baseURL: baseUrl,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      viewport: { width: 1180, height: 1600 },
      deviceScaleFactor: 2
    });
    await context.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
      window.__GEMELHUB_FORCE_TABLE_TOP__ = true;
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    try {
      const locator = await preparePage(page, target, baseUrl);
      await locator.screenshot({ path: imagePath, animations: 'disabled' });
      written += 1;
      console.log(`Wrote ${path.relative(process.cwd(), imagePath)}`);
    } catch (error) {
      skipped.push({ ...target, error: error.message });
      console.warn(`Skipped ${target.categoryId}/${target.trackId}/${target.mode}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

writeLatestPeriod(period, {
  rawPeriod: latestRawPeriod,
  targetCount: targets.length,
  written,
  skippedCount: skipped.length
});

if (skipped.length) {
  fs.writeFileSync(path.join(outDir, '_skipped.json'), `${JSON.stringify(skipped, null, 2)}\n`);
}

console.log(`Generated ${written}/${targets.length} share images for ${period}`);
