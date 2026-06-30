// ==========================================
// LEADS MODULE - GemulHub
// 1. שמירה ב-endpoint תחילה
// 2. פתיחת WhatsApp עם הודעה מוכנה
// ==========================================

(function () {

  var WA_NUMBER = '972528089808';

  // ─── זיהוי הקשר הנוכחי מה-DOM ────────────────────────────────
  function getLeadContext() {
    var pageUrl = window.location.href;

    // דף קופה בודדת (fund.html)
    var fundCatEl  = document.getElementById('fh-cat');
    var fundNameEl = document.getElementById('fh-name');
    if (fundCatEl) {
      var cat      = fundCatEl.textContent.trim();
      var fundName = fundNameEl ? fundNameEl.textContent.trim() : '';
      return {
        category: cat,
        pageName: fundName ? fundName + ' — ' + cat : cat,
        pageUrl:  pageUrl
      };
    }

    // דף ראשי — כרטיסייה פעילה
    var activeTab = document.querySelector('.cat-tab.active');
    if (activeTab && activeTab.dataset.cat && activeTab.dataset.cat !== 'home') {
      var tabLabel = (activeTab.querySelector('span:last-child') || activeTab).textContent.trim();
      return { category: tabLabel, pageName: tabLabel, pageUrl: pageUrl };
    }

    // פרמטר cat ב-URL
    var urlCat = new URLSearchParams(window.location.search).get('cat');
    if (urlCat) {
      var CAT_NAMES = {
        hashtalamot:      'קרנות השתלמות',
        gemel_tagmulim:   'קופות גמל',
        gemel_hashkaa:    'גמל להשקעה',
        hisachon_yeled:   'חיסכון לכל ילד',
        polisa_chisachon: 'פוליסות חיסכון',
        pension_mekafit:  'פנסיה מקיפה',
        pension_mashlima: 'פנסיה כללית'
      };
      var n = CAT_NAMES[urlCat] || urlCat;
      return { category: n, pageName: n, pageUrl: pageUrl };
    }

    return { category: 'כללי', pageName: 'דף הבית', pageUrl: pageUrl };
  }

  // ─── שמירה ב-endpoint (Formspree / Webhook) ───────────────────
  // מחכים לתשובה לפני פתיחת WhatsApp — כך הליד נשמר תמיד
  async function saveToEndpoint(payload) {
    var endpoint = (typeof CONFIG !== 'undefined') ? CONFIG.API.LEADS_ENDPOINT : '';
    if (!endpoint) return; // לא מוגדר — דלג

    var resp = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (!resp.ok) {
      var err = await resp.json().catch(function() { return {}; });
      throw new Error(err.error || 'שגיאת שרת (' + resp.status + ')');
    }
  }

  // ─── בניית הודעת WhatsApp ─────────────────────────────────────
  function buildWhatsappMessage(name, phone, email, ctx) {
    var lines = [
      'היי רועי, השארתי פרטים ב-GemelHub ואשמח לבדיקה אישית כדי להבין אם אפשר לשפר את התנאים שלי.',
      '',
      'שם מלא: '     + name,
      'טלפון: '      + phone
    ];
    if (email) lines.push('מייל: ' + email);
    lines.push(
      'תחום עניין: ' + ctx.category,
      'עמוד באתר: '  + ctx.pageName,
      'קישור: '      + ctx.pageUrl,
      '',
      'אשמח לחזרה כשתתאפשר.'
    );
    return lines.join('\n');
  }

  // ─── Toast עצמאי (גם ללא app.js) ─────────────────────────────
  function leadsToast(msg) {
    if (typeof showToast === 'function') { showToast(msg); return; }
    var t = document.createElement('div');
    t.className   = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.classList.add('fade-out');
      setTimeout(function() { t.remove(); }, 400);
    }, 2800);
  }

  // ─── פתיחת המודל ─────────────────────────────────────────────
  function openLeadsModal(source) {
    var overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    var form = document.getElementById('consult-form');
    if (form) {
      form.dataset.source = source || 'כללי';
      form.reset();
    }
    overlay.style.display = 'flex';
    history.pushState({ sbDialog: 'leads' }, '');
    setTimeout(function() {
      var f = document.getElementById('consult-name');
      if (f) f.focus();
    }, 80);
  }

  // ─── סגירת המודל ─────────────────────────────────────────────
  function closeLeadsModal() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ─── Setup: bind form + close + data-open-leads triggers ─────
  function setupLeadsModal() {
    var overlay  = document.getElementById('modal-overlay');
    var closeBtn = document.getElementById('modal-close');
    var form     = document.getElementById('consult-form');
    if (!overlay || !form) return;

    if (closeBtn) closeBtn.addEventListener('click', closeLeadsModal);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeLeadsModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.style.display !== 'none') closeLeadsModal();
    });

    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var name  = (document.getElementById('consult-name')?.value  || '').trim();
      var phone = (document.getElementById('consult-phone')?.value || '').trim();
      var email = (document.getElementById('consult-email')?.value || '').trim();
      var ctx   = getLeadContext();
      var btn   = form.querySelector('.btn-submit');
      var orig  = btn.innerHTML;

      btn.disabled  = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> שולח...';

      // ── שלב 1: שמור ב-Formspree (תמיד לפני WhatsApp) ──
      // Formspree: `email` → reply-to אוטומטי, `_subject` → נושא המייל
      try {
        await saveToEndpoint({
          name:     name,
          phone:    phone,
          email:    email || '',
          category: ctx.category,
          page:     ctx.pageName,
          url:      ctx.pageUrl,
          source:   form.dataset.source || 'כללי',
          _subject: 'ליד חדש מ-GemelHub — ' + name
        });
      } catch (err) {
        // Endpoint נכשל — ממשיכים בכל מקרה (WhatsApp כגיבוי)
        console.warn('[Leads] endpoint error (continuing to WhatsApp):', err);
      }

      // ── שלב 2: פתח WhatsApp עם הודעה מוכנה ──
      var msg   = buildWhatsappMessage(name, phone, email, ctx);
      var waUrl = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      closeLeadsModal();
      form.reset();
      leadsToast('הפרטים נשמרו ✓ מעביר אותך לוואטסאפ 📲');

      btn.disabled  = false;
      btn.innerHTML = orig;
    });

    // כפתורים / קישורים עם data-open-leads — קישור אוטומטי
    document.querySelectorAll('[data-open-leads]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        openLeadsModal(el.dataset.openLeads || 'כללי');
      });
    });
  }

  // ─── חשיפה גלובלית ───────────────────────────────────────────
  window.openLeadsModal  = openLeadsModal;
  window.closeLeadsModal = closeLeadsModal;
  window.setupLeadsModal = setupLeadsModal;

})();
