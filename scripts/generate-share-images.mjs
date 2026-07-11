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
const targets = buildTargets(config);
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

async function preparePage(page, target, baseUrl) {
  const url = new URL('/index.html', baseUrl);
  url.searchParams.set('cat', target.categoryId);
  url.searchParams.set('focusTrack', target.trackId);
  url.searchParams.set('ghShareCapture', '1');

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  const blockSelector = `.track-block[data-track-id="${target.trackId.replaceAll('"', '\\"')}"]`;
  await page.waitForSelector(`${blockSelector} table.track-table tbody tr:not(.average-row)`, { timeout: 90000 });

  if (target.mode === 'allocation') {
    await page.locator(blockSelector).locator('.exp-toggle-btn').click({ timeout: 10000 });
    await page.waitForSelector(`${blockSelector} table.track-table.exposure-only, ${blockSelector} table.track-table td.exp-col`, { timeout: 30000 });
  }

  await page.addStyleTag({
    content: `
      html, body { background: #f8fafc !important; }
      body.gemelhub-share-capture .sticky-header,
      body.gemelhub-share-capture .mobile-bottom-nav,
      body.gemelhub-share-capture .mobile-recent-funds-drawer,
      body.gemelhub-share-capture .whatsapp-float,
      body.gemelhub-share-capture .floating-chat,
      body.gemelhub-share-capture .cookie-banner,
      body.gemelhub-share-capture .track-header-controls,
      body.gemelhub-share-capture .track-thead-clone {
        display: none !important;
      }
      body.gemelhub-share-capture #tracks-container {
        display: block !important;
        opacity: 1 !important;
      }
      body.gemelhub-share-capture .track-block {
        width: 440px !important;
        max-width: 440px !important;
        margin: 0 auto !important;
        border: 1px solid #d8c589 !important;
        border-radius: 0 !important;
        box-shadow: 0 10px 28px rgba(15, 23, 42, .14) !important;
        background: #fff !important;
        overflow: visible !important;
      }
      body.gemelhub-share-capture .track-header {
        position: static !important;
        top: auto !important;
        border-radius: 0 !important;
        justify-content: center !important;
        padding: 9px 10px !important;
        background: #fff !important;
      }
      body.gemelhub-share-capture .track-label {
        justify-content: center !important;
        text-align: center !important;
      }
      body.gemelhub-share-capture .track-table-wrapper {
        overflow: visible !important;
        width: 100% !important;
      }
      body.gemelhub-share-capture table.track-table {
        width: 100% !important;
        min-width: 100% !important;
      }
      body.gemelhub-share-capture table.track-table thead,
      body.gemelhub-share-capture table.track-table thead tr,
      body.gemelhub-share-capture table.track-table thead th {
        position: static !important;
        top: auto !important;
      }
      .gemelhub-share-brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 10px 10px 8px;
        background: #fff;
        border-bottom: 1px solid #d8c589;
      }
      .gemelhub-share-brand img {
        height: 34px;
        width: auto;
        display: block;
      }
      .gemelhub-share-link {
        font: 700 10px/1.2 Arial, sans-serif;
        color: #d19b13;
      }
      .gemelhub-share-footer {
        padding: 9px 12px;
        text-align: center;
        direction: rtl;
        font: 700 11px/1.35 Arial, sans-serif;
        color: #1f3b68;
        background: #fff;
        border-top: 1px solid #e7dcb8;
      }
    `
  });

  await page.evaluate(({ trackId, siteUrl, period }) => {
    document.body.classList.add('gemelhub-share-capture');
    document.documentElement.style.scrollBehavior = 'auto';
    const block = document.querySelector(`.track-block[data-track-id="${CSS.escape(trackId)}"]`);
    if (!block) return;
    block.scrollIntoView({ block: 'start', inline: 'nearest' });
    block.querySelector('.track-table-wrapper')?.scrollTo?.({ left: 0, top: 0 });
    if (!block.querySelector('.gemelhub-share-brand')) {
      const brand = document.createElement('div');
      brand.className = 'gemelhub-share-brand';
      brand.innerHTML = `<img src="assets/gemelhub-logo.svg" alt="GemelHub"><div class="gemelhub-share-link">${siteUrl}</div>`;
      block.insertBefore(brand, block.firstElementChild);
    }
    if (!block.querySelector('.gemelhub-share-footer')) {
      const footer = document.createElement('div');
      footer.className = 'gemelhub-share-footer';
      footer.textContent = `נוצר ב-GemelHub · נתוני חודש ${period} · ${siteUrl}`;
      block.appendChild(footer);
    }
  }, { trackId: target.trackId, siteUrl, period });

  await page.waitForTimeout(350);
  return page.locator(blockSelector);
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
      viewport: { width: 440, height: 900 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
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
