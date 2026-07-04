// ─────────────────────────────────────────────────────────────────────────
// GemelHub — professional PDF export engine (replaces window.print() as the
// primary export path for the sandbox portfolio / compare reports).
//
// Why this exists: PDFs produced via Chrome's "Print to PDF" on Android
// sometimes hang when opened through Canon PRINT. This module builds a real
// PDF (selectable text, real tables, clickable links) directly with pdf-lib,
// instead of relying on the browser's print pipeline.
//
// Libraries (loaded as plain <script> tags in index.html, no bundler here):
//   - pdf-lib      → low-level PDF document/page/text/link-annotation API
//   - @pdf-lib/fontkit → lets pdf-lib embed a custom TTF (Hebrew) font
//   - bidi-js      → Unicode Bidi Algorithm, needed because pdf-lib (like the
//                    underlying pdfkit) draws glyphs in the order given and
//                    does NOT reorder Hebrew/mixed RTL text on its own.
//
// Font: Heebo (OFL), same family already used on-screen (see index.html),
// static Regular/Bold TTFs (not the variable font — PDF embedding needs a
// static glyf table) fetched from Google Fonts and vendored at fonts/.
//
// Everything here is data-driven: callers (js/app.js) build a plain-object
// "report model" describing header/cards/tables/disclaimer, and this module
// only knows how to lay that out on A4 pages. No portfolio/business logic
// lives in this file on purpose, so it stays reusable for other reports.
// ─────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const MARGIN = 36;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const FONT_REGULAR_URL = 'fonts/Heebo-Regular.ttf';
  const FONT_BOLD_URL = 'fonts/Heebo-Bold.ttf';

  // Matches the site's own @media print palette (css/style.css, ~line 19581+
  // and ~20006+) — navy + gold, not the app's everyday working-UI blue —
  // so the PDF reads as the same "report" the old window.print() produced.
  const DEFAULT_THEME = {
    brand: '#1a3560',      // headings, header rule
    brandDark: '#0c2134',  // section-chip text, card text
    gold: '#d4a017',       // brand accent — total values, best-in-compare marker
    accentBg: '#f0f4ff',   // section-chip / table header background
    gray: '#64748b',
    lightGray: '#94a3b8',
    border: '#dbe3ee',
    tableBorder: '#e8ecf0',
    zebra: '#f8fafc',
    positive: '#16a34a',
    negative: '#dc2626',
    text: '#0c2134',
  };

  // ── small utils ──────────────────────────────────────────────────────────

  function hexToRgb01(hex) {
    hex = String(hex || '#000000').trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16) || 0;
    return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
  }

  async function fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('נכשל בטעינת ' + url);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Rasterize an <img>-loadable source (SVG/PNG/etc.) to PNG bytes via canvas.
  // Used for the header logo — avoids embedding SVG (unsupported well by PDF
  // viewers/printers) while keeping the wordmark visually close to the site.
  function rasterizeImageToPng(url, targetWidthPx) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const scale = 3; // crisp at print DPI
          const w = targetWidthPx * scale;
          const h = (img.naturalHeight / img.naturalWidth) * w;
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('כשל בהמרת הלוגו')); return; }
            const reader = new FileReader();
            reader.onload = () => resolve({ bytes: new Uint8Array(reader.result), width: img.naturalWidth, height: img.naturalHeight });
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
          }, 'image/png');
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('לא ניתן לטעון את הלוגו'));
      img.src = url;
    });
  }

  // ── bidi reordering (logical Hebrew/mixed string → visual draw order) ────
  // Hebrew letters don't need shaping (unlike Arabic), only reordering: runs
  // of RTL characters must be reversed while LTR runs (numbers, "₪12,000")
  // keep their internal order. bidi-js gives us the ranges to reverse.

  function makeReorderer(bidi) {
    return function toVisualOrder(text) {
      text = text == null ? '' : String(text);
      if (!text) return '';
      let embeddingLevels, segments, mirror;
      try {
        // NOTE: getReorderSegments/getMirroredCharactersMap take the whole
        // {levels, paragraphs} object returned by getEmbeddingLevels, not
        // just the raw levels array — passing the array alone throws inside
        // bidi-js and silently defeats the reordering (text renders backwards).
        embeddingLevels = bidi.getEmbeddingLevels(text, 'rtl');
        segments = bidi.getReorderSegments(text, embeddingLevels) || [];
        mirror = bidi.getMirroredCharactersMap(text, embeddingLevels);
      } catch (err) {
        return text; // best-effort: draw as-is rather than fail the whole PDF
      }
      const chars = Array.from(text);
      segments.forEach(([start, end]) => {
        const seg = chars.slice(start, end + 1).reverse();
        for (let i = 0; i < seg.length; i++) chars[start + i] = seg[i];
      });
      if (mirror && typeof mirror.forEach === 'function') {
        mirror.forEach((replacement, idx) => { chars[idx] = replacement; });
      }
      return chars.join('');
    };
  }

  // ── engine bootstrap ─────────────────────────────────────────────────────

  let enginePromise = null;
  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = (async () => {
      if (!global.PDFLib) throw new Error('ספריית pdf-lib לא נטענה');
      if (!global.fontkit) throw new Error('ספריית fontkit לא נטענה');
      if (!global.bidi_js) throw new Error('ספריית bidi-js לא נטענה');
      const { PDFDocument, rgb, PDFName, PDFString } = global.PDFLib;
      const [regularBytes, boldBytes] = await Promise.all([
        fetchBytes(FONT_REGULAR_URL),
        fetchBytes(FONT_BOLD_URL),
      ]);
      const bidi = global.bidi_js();
      return { PDFLib: global.PDFLib, PDFDocument, rgb, PDFName, PDFString, fontkit: global.fontkit, regularBytes, boldBytes, toVisualOrder: makeReorderer(bidi) };
    })();
    return enginePromise;
  }

  // ── link annotations (the part that keeps manager/track links clickable) ─
  // pdf-lib has no high-level "addLink" helper, so we build the Link
  // annotation dict ourselves and attach it to the page's /Annots array.
  function addLinkAnnotation(pdfDoc, page, PDFName, PDFString, rect, url) {
    const context = pdfDoc.context;
    const annot = context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    const ref = context.register(annot);
    const annotsKey = PDFName.of('Annots');
    const existing = page.node.lookup(annotsKey);
    if (existing && typeof existing.push === 'function') existing.push(ref);
    else page.node.set(annotsKey, context.obj([ref]));
  }

  // ── the layout engine ────────────────────────────────────────────────────

  class ReportDoc {
    constructor(ctx, theme) {
      this.ctx = ctx;
      this.theme = Object.assign({}, DEFAULT_THEME, theme || {});
      this.pdfDoc = null;
      this.page = null;
      this.y = PAGE_H - MARGIN;
      this.fontRegular = null;
      this.fontBold = null;
      this.repeatHeader = null; // fn(this) => void, redrawn on continuation pages
    }

    async init() {
      const { PDFDocument, fontkit } = this.ctx;
      this.pdfDoc = await PDFDocument.create();
      this.pdfDoc.registerFontkit(fontkit);
      this.fontRegular = await this.pdfDoc.embedFont(this.ctx.regularBytes, { subset: true });
      this.fontBold = await this.pdfDoc.embedFont(this.ctx.boldBytes, { subset: true });
      this.addPage();
    }

    addPage() {
      this.page = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
      this.y = PAGE_H - MARGIN;
      if (this.repeatHeader) this.repeatHeader(this);
    }

    ensureSpace(height) {
      if (this.y - height < MARGIN) this.addPage();
    }

    color(hex) {
      const { r, g, b } = hexToRgb01(hex);
      return this.ctx.rgb(r, g, b);
    }

    // Rounded rectangle via an SVG path (pdf-lib has no native roundRect).
    // x/yTop are the box's top-left in normal PDF coords (y grows upward);
    // drawSvgPath itself works in a local y-down space anchored at (x, yTop).
    drawRoundedRect(x, yTop, w, h, r, { fill, border, borderWidth = 1 } = {}) {
      r = Math.min(r, w / 2, h / 2);
      const path = `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} `
        + `H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;
      this.page.drawSvgPath(path, {
        x, y: yTop,
        color: fill ? this.color(fill) : undefined,
        borderColor: border ? this.color(border) : undefined,
        borderWidth: border ? borderWidth : undefined,
      });
    }

    // Measures a *logical order* string (order-independent — width is just
    // the sum of glyph advances) then draws it reordered to visual order.
    //
    // IMPORTANT: pdf-lib's drawText()/widthOfTextAtSize(), when used with a
    // custom fontkit-embedded font, runs the string through the font's own
    // layout/shaping pass. That pass does its own partial bidi handling and
    // it's incompatible with ours — verified experimentally that it garbles
    // numbers embedded in an RTL string (e.g. a date turns into digit-reversed
    // gibberish) even though our toVisualOrder() output was already correct.
    // Drawing one character at a time sidesteps that shaping pass entirely
    // (a single character has nothing left to reorder), at the cost of losing
    // kerning — an acceptable trade for correct Hebrew text.
    drawLine(text, { x, width, font, size, color, align = 'right' }) {
      const visual = this.ctx.toVisualOrder(text);
      const chars = Array.from(visual);
      const widths = chars.map(ch => font.widthOfTextAtSize(ch, size));
      const w = widths.reduce((a, b) => a + b, 0);
      let drawX = x;
      if (align === 'right') drawX = x + width - w;
      else if (align === 'center') drawX = x + (width - w) / 2;
      const fillColor = this.color(color);
      let cursor = drawX;
      chars.forEach((ch, i) => {
        if (ch !== ' ') this.page.drawText(ch, { x: cursor, y: this.y, size, font, color: fillColor });
        cursor += widths[i];
      });
      return w;
    }

    // Greedy word-wrap on the *logical* string (splitting/measuring logical
    // substrings is safe — only the final per-line render needs bidi reorder).
    wrapLines(text, font, size, maxWidth) {
      text = String(text == null ? '' : text);
      if (!text) return [];
      const words = text.split(/\s+/).filter(Boolean);
      const lines = [];
      let current = '';
      words.forEach(word => {
        const candidate = current ? current + ' ' + word : word;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      if (current) lines.push(current);
      return lines;
    }

    drawParagraph(text, { x, width, font, size, color, align, lineHeight }) {
      const lines = this.wrapLines(text, font, size, width);
      lines.forEach(line => {
        this.ensureSpace(lineHeight);
        this.drawLine(line, { x, width, font, size, color, align });
        this.y -= lineHeight;
      });
      return lines.length;
    }

    async drawHeader(model) {
      const theme = this.theme;
      const topY = this.y;
      let logoImg = model._logoImage; // pre-embedded once, reused across pages
      if (logoImg) {
        const dispW = 90;
        const dispH = (logoImg.height / logoImg.width) * dispW;
        this.page.drawImage(logoImg, { x: PAGE_W - MARGIN - dispW, y: topY - dispH + 6, width: dispW, height: dispH });
      }
      this.y -= 4;
      this.drawLine(model.title || '', { x: MARGIN, width: CONTENT_W - 100, font: this.fontBold, size: 16, color: theme.brand, align: 'right' });
      this.y -= 20;
      const metaLine = 'הופק: ' + (model.dateStr || '') + (model.meta ? '   |   ' + model.meta : '');
      this.drawLine(metaLine, { x: MARGIN, width: CONTENT_W - 100, font: this.fontRegular, size: 8.5, color: theme.gray, align: 'right' });
      this.y -= 14;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 2,
        color: this.color(theme.brand),
      });
      this.y -= 16;
    }

    // Rendered as a rounded "chip" (bg + bold navy text), matching the site's
    // .sbcmp-section-head / @media print section-head look, instead of plain text.
    drawSectionTitle(text, color) {
      const theme = this.theme;
      const chipH = 22;
      this.ensureSpace(chipH + 10);
      const topY = this.y;
      const font = this.fontBold;
      const size = 10.5;
      const visual = this.ctx.toVisualOrder(text);
      const textW = Array.from(visual).reduce((s, ch) => s + font.widthOfTextAtSize(ch, size), 0);
      const chipW = Math.min(CONTENT_W, textW + 20);
      this.drawRoundedRect(PAGE_W - MARGIN - chipW, topY, chipW, chipH, 5, { fill: theme.accentBg });
      const savedY = this.y;
      this.y = topY - chipH / 2 - 3.5;
      this.drawLine(text, { x: PAGE_W - MARGIN - chipW, width: chipW, font, size, color: color || theme.brandDark, align: 'center' });
      this.y = savedY - chipH - 10;
    }

    // Rounded white card, centered content, gold total value — matches
    // .sb-print-value-summary / .sbcmp-value-card in css/style.css.
    drawValueCards(cards) {
      if (!cards || !cards.length) return;
      const theme = this.theme;
      const cols = Math.min(cards.length, cards.length === 3 ? 3 : 2);
      const gap = 10;
      const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
      let col = 0;
      let rowStartY = this.y;
      let rowMaxHeight = 0;

      cards.forEach((card, idx) => {
        const rowsHeight = (card.rows || []).reduce((s, r) => s + (r.sub ? 21 : 11), 0);
        const rowHeight = 44 + rowsHeight;
        if (col === 0) {
          this.ensureSpace(rowHeight);
          rowStartY = this.y;
          rowMaxHeight = 0;
        }
        const x = MARGIN + col * (cardW + gap);
        const cardTop = rowStartY;
        this.drawRoundedRect(x, cardTop, cardW, rowHeight, 8, { fill: '#ffffff', border: theme.border, borderWidth: 1 });
        const savedY = this.y;
        this.y = cardTop - 15;
        if (card.name) {
          this.drawLine(card.name, { x: x + 10, width: cardW - 20, font: this.fontBold, size: 9.5, color: theme.text, align: 'center' });
          this.y -= 13;
        }
        if (card.totalLabel) {
          this.drawLine(card.totalLabel, { x: x + 10, width: cardW - 20, font: this.fontRegular, size: 8.5, color: theme.gray, align: 'center' });
          this.y -= 12;
        }
        this.drawLine(card.total || '', { x: x + 10, width: cardW - 20, font: this.fontBold, size: 13, color: theme.gold, align: 'center' });
        this.y -= 14;
        this.page.drawLine({ start: { x: x + cardW * 0.15, y: this.y + 4 }, end: { x: x + cardW * 0.85, y: this.y + 4 }, thickness: 0.75, color: this.color(theme.border) });
        this.y -= 8;
        (card.rows || []).forEach(row => {
          const line = (row.label || '') + (row.value ? '   ' + row.value : '');
          this.drawLine(line, { x: x + 10, width: cardW - 20, font: this.fontBold, size: 8.5, color: theme.text, align: 'center' });
          this.y -= 11;
          if (row.sub) {
            this.drawLine(row.sub, { x: x + 10, width: cardW - 20, font: this.fontRegular, size: 7.5, color: theme.gray, align: 'center' });
            this.y -= 10;
          }
        });
        rowMaxHeight = Math.max(rowMaxHeight, rowHeight);
        this.y = savedY;
        col++;
        if (col >= cols || idx === cards.length - 1) {
          this.y = rowStartY - rowMaxHeight - 12;
          col = 0;
        }
      });
    }

    // columns: [{header, weight?, align?}], in the SAME order as our RTL
    // HTML tables (index 0 = rightmost column). rows: [[cell,...], ...] where
    // cell = {text, bold?, color?, sub?, link?, align?}
    drawTable(columns, rows) {
      const theme = this.theme;
      const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0);
      const widths = columns.map(c => (c.weight || 1) / totalWeight * CONTENT_W);
      const xs = [];
      let cursor = PAGE_W - MARGIN;
      columns.forEach((c, i) => { cursor -= widths[i]; xs.push(cursor); });

      const headerH = 22;
      const drawHeaderRow = () => {
        this.ensureSpace(headerH + 4);
        const topY = this.y;
        this.page.drawRectangle({ x: MARGIN, y: topY - headerH, width: CONTENT_W, height: headerH, color: this.color(theme.accentBg) });
        this.page.drawLine({ start: { x: MARGIN, y: topY - headerH }, end: { x: PAGE_W - MARGIN, y: topY - headerH }, thickness: 1.5, color: this.color(theme.brand) });
        columns.forEach((c, i) => {
          const savedY = this.y;
          this.y = topY - headerH / 2 - 3.5;
          this.drawLine(c.header || '', { x: xs[i] + 4, width: widths[i] - 8, font: this.fontBold, size: 8.5, color: theme.brandDark, align: c.align || 'right' });
          this.y = savedY;
        });
        this.y = topY - headerH;
      };

      drawHeaderRow();

      rows.forEach((row, rowIdx) => {
        const lineH = 11.5;
        const cellLines = row.map((cell, i) => this.wrapLines(String(cell.text == null ? '' : cell.text), cell.bold ? this.fontBold : this.fontRegular, 8.5, widths[i] - 8));
        const maxLines = Math.max(1, ...cellLines.map(l => l.length));
        const hasSub = row.some(c => c.sub);
        const rowH = maxLines * lineH + (hasSub ? 10 : 0) + 8;

        if (this.y - rowH < MARGIN) {
          this.addPage();
          drawHeaderRow();
        }
        const topY = this.y;
        if (rowIdx % 2 === 1) {
          this.page.drawRectangle({ x: MARGIN, y: topY - rowH, width: CONTENT_W, height: rowH, color: this.color(theme.zebra) });
        }
        row.forEach((cell, i) => {
          const savedY = this.y;
          this.y = topY - lineH - 2;
          const lines = cellLines[i];
          lines.forEach(line => {
            this.drawLine(line, { x: xs[i] + 4, width: widths[i] - 8, font: cell.bold ? this.fontBold : this.fontRegular, size: 8.5, color: cell.color || theme.text, align: cell.align || 'right' });
            this.y -= lineH;
          });
          if (cell.sub) {
            this.drawLine(cell.sub, { x: xs[i] + 4, width: widths[i] - 8, font: this.fontRegular, size: 7, color: theme.lightGray, align: cell.align || 'right' });
            this.y -= 10;
          }
          if (cell.link) {
            addLinkAnnotation(this.pdfDoc, this.page, this.ctx.PDFName, this.ctx.PDFString, { x: xs[i], y: topY - rowH, w: widths[i], h: rowH }, cell.link);
          }
          this.y = savedY;
        });
        this.y = topY - rowH;
        this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness: 0.5, color: this.color(theme.tableBorder) });
      });
      this.y -= 14;
    }

    drawDisclaimer(text) {
      if (!text) return;
      this.ensureSpace(30);
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness: 0.5, color: this.color(this.theme.border) });
      this.y -= 12;
      this.drawParagraph(text, { x: MARGIN, width: CONTENT_W, font: this.fontRegular, size: 7, color: this.theme.lightGray, align: 'center', lineHeight: 9.5 });
    }

    async save() {
      return this.pdfDoc.save();
    }
  }

  // ── public: build a PDF from a generic report model ─────────────────────
  // model = {
  //   title, dateStr, meta, logoUrl?, theme?,
  //   blocks: [
  //     { type:'valueCards', cards:[{name,totalLabel,total,rows:[{label,value,sub}]}] },
  //     { type:'sectionTitle', text, color? },
  //     { type:'table', columns:[{header,weight,align}], rows:[[{text,bold,color,sub,link,align}]] },
  //     { type:'text', text },
  //   ],
  //   disclaimer,
  // }
  async function buildReportPdf(model) {
    const ctx = await loadEngine();
    const doc = new ReportDoc(ctx, model.theme);
    await doc.init();

    if (model.logoUrl) {
      try {
        const raster = await rasterizeImageToPng(model.logoUrl, 200);
        model._logoImage = await doc.pdfDoc.embedPng(raster.bytes);
      } catch (err) {
        console.warn('GemelHub PDF: logo rasterization failed, continuing without it', err);
      }
    }
    doc.repeatHeader = (d) => { d.drawHeader(model); };
    await doc.drawHeader(model);

    (model.blocks || []).forEach(block => {
      if (block.type === 'valueCards') doc.drawValueCards(block.cards);
      else if (block.type === 'sectionTitle') doc.drawSectionTitle(block.text, block.color);
      else if (block.type === 'table') doc.drawTable(block.columns, block.rows);
      else if (block.type === 'text') doc.drawParagraph(block.text, { x: MARGIN, width: CONTENT_W, font: doc.fontRegular, size: 9, color: doc.theme.text, align: 'right', lineHeight: 12 });
    });

    doc.drawDisclaimer(model.disclaimer);
    return doc.save();
  }

  // ── public: deliver the generated PDF to the user ───────────────────────
  // Prefers the native share sheet on mobile (lets the user pick Canon PRINT /
  // Adobe Acrobat / Files directly — this is the whole point of the feature);
  // falls back to a plain download link on desktop or if sharing is refused.
  async function deliverPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (global.navigator && global.navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (global.navigator.canShare({ files: [file] })) {
          await global.navigator.share({ files: [file], title: filename });
          return 'shared';
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  }

  global.GemelHubPdfExport = { buildReportPdf, deliverPdf };
})(window);
