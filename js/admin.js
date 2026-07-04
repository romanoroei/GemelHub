(function () {
  'use strict';

  const TOKEN_KEY = 'gemelhub_admin_token_v1';
  const appConfig = typeof CONFIG !== 'undefined' ? CONFIG : window.CONFIG;
  const endpoint = ((appConfig && appConfig.API && appConfig.API.SHARED_PORTFOLIO_ENDPOINT) || '').replace(/\/$/, '');

  const els = {
    form: document.getElementById('admin-token-form'),
    tokenInput: document.getElementById('admin-token-input'),
    refresh: document.getElementById('admin-refresh-btn'),
    clearToken: document.getElementById('admin-clear-token-btn'),
    workerStatus: document.getElementById('worker-status'),
    workerStatusText: document.getElementById('worker-status-text'),
    kvStatus: document.getElementById('kv-status'),
    kvStatusText: document.getElementById('kv-status-text'),
    activeLinks: document.getElementById('kpi-active-links'),
    created24h: document.getElementById('kpi-created-24h'),
    created7d: document.getElementById('kpi-created-7d'),
    totalOpens: document.getElementById('kpi-total-opens'),
    tableBody: document.getElementById('shares-table-body'),
    alerts: document.getElementById('admin-alerts')
  };

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setStatus(node, textNode, status, text) {
    if (node) node.dataset.status = status;
    if (textNode) textNode.textContent = text;
  }

  function setAlerts(items) {
    els.alerts.innerHTML = items.length
      ? items.map(item => `<li>${escapeHtml(item)}</li>`).join('')
      : '<li>אין התראות פעילות.</li>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString('he-IL') : '--';
  }

  function formatDate(value) {
    if (!value) return 'לא זמין';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'לא זמין';
    return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  }

  function authHeaders() {
    return {
      'Authorization': 'Bearer ' + token(),
      'Content-Type': 'application/json'
    };
  }

  async function api(path, options) {
    if (!endpoint) throw new Error('Shared portfolio endpoint is not configured');
    const res = await fetch(endpoint + path, {
      ...(options || {}),
      headers: {
        ...authHeaders(),
        ...((options && options.headers) || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function resetData(message) {
    els.activeLinks.textContent = '--';
    els.created24h.textContent = '--';
    els.created7d.textContent = '--';
    els.totalOpens.textContent = '--';
    els.tableBody.innerHTML = `<tr><td colspan="7" class="admin-empty">${escapeHtml(message || 'אין נתונים להצגה')}</td></tr>`;
  }

  function summaryText(summary) {
    if (!summary) return 'אין סיכום';
    const parts = [];
    if (summary.totalValue) parts.push(`שווי ${formatNumber(summary.totalValue)} ש"ח`);
    if (summary.categoryCount) parts.push(`${formatNumber(summary.categoryCount)} קטגוריות`);
    if (summary.trackCount) parts.push(`${formatNumber(summary.trackCount)} מסלולים`);
    if (summary.managerCount) parts.push(`${formatNumber(summary.managerCount)} מנהלים`);
    return parts.length ? parts.join(' · ') : 'ללא פירוט';
  }

  function renderTable(records) {
    if (!records || !records.length) {
      resetData('אין שיתופים פעילים כרגע');
      return;
    }
    els.tableBody.innerHTML = records.map(record => `
      <tr>
        <td><span class="share-id">${escapeHtml(record.id)}</span></td>
        <td><span class="share-type">${record.type === 'compare' ? 'השוואה' : 'תיק'}</span></td>
        <td>${escapeHtml(formatDate(record.createdAt))}</td>
        <td>${escapeHtml(formatDate(record.expiresAt))}</td>
        <td>${formatNumber(record.openCount)}</td>
        <td><div class="share-summary">${escapeHtml(summaryText(record.summary))}</div></td>
        <td>
          <button type="button" class="admin-btn danger ghost" data-delete-share="${escapeHtml(record.id)}">
            <i class="fas fa-trash" aria-hidden="true"></i>
            מחק
          </button>
        </td>
      </tr>
    `).join('');
  }

  async function loadAdmin() {
    if (!endpoint) {
      setStatus(els.workerStatus, els.workerStatusText, 'bad', 'לא הוגדר endpoint');
      resetData('חסר endpoint בקובץ config.js');
      setAlerts(['יש להגדיר CONFIG.API.SHARED_PORTFOLIO_ENDPOINT.']);
      return;
    }
    if (!token()) {
      setStatus(els.workerStatus, els.workerStatusText, 'warn', 'נדרש token');
      setStatus(els.kvStatus, els.kvStatusText, 'unknown', 'לא נבדק');
      resetData('הכנס token ניהולי כדי לטעון נתונים');
      setAlerts(['הכנס token ניהולי כדי לצפות בנתונים.']);
      return;
    }

    try {
      setStatus(els.workerStatus, els.workerStatusText, 'unknown', 'בודק...');
      const health = await api('/admin/health');
      setStatus(els.workerStatus, els.workerStatusText, 'ok', `פעיל · TTL ${Math.round((health.ttlSeconds || 0) / 86400)} ימים`);
      const summary = await api('/admin/summary?limit=40');
      setStatus(els.kvStatus, els.kvStatusText, 'ok', `עודכן ${formatDate(summary.generatedAt)}`);
      els.activeLinks.textContent = formatNumber(summary.activeLinks);
      els.created24h.textContent = formatNumber(summary.created24h);
      els.created7d.textContent = formatNumber(summary.created7d);
      els.totalOpens.textContent = formatNumber(summary.totalOpens);
      renderTable(summary.recent || []);
      const alerts = [];
      if (!summary.activeLinks) alerts.push('אין כרגע קישורי שיתוף פעילים.');
      if ((summary.activeLinks || 0) > 800) alerts.push('כמות הקישורים הפעילים גבוהה. כדאי לבדוק מגבלות KV.');
      setAlerts(alerts);
    } catch (error) {
      const msg = error && error.message || 'טעינה נכשלה';
      const unauthorized = /Unauthorized|token/i.test(msg);
      setStatus(els.workerStatus, els.workerStatusText, unauthorized ? 'bad' : 'warn', msg);
      setStatus(els.kvStatus, els.kvStatusText, 'unknown', 'לא נטען');
      resetData('לא ניתן לטעון נתוני ניהול');
      setAlerts([msg === 'Admin token is not configured'
        ? 'יש להגדיר secret בשם GEMELHUB_ADMIN_TOKEN ב-Cloudflare Worker.'
        : msg]);
    }
  }

  async function deleteShare(id) {
    if (!id) return;
    if (!window.confirm('למחוק את קישור השיתוף ' + id + '?')) return;
    try {
      await api('/admin/share/' + encodeURIComponent(id), { method: 'DELETE' });
      await loadAdmin();
    } catch (error) {
      setAlerts([error && error.message || 'מחיקה נכשלה']);
    }
  }

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    const value = els.tokenInput.value.trim();
    if (!value) return;
    localStorage.setItem(TOKEN_KEY, value);
    els.tokenInput.value = '';
    loadAdmin();
  });

  els.refresh.addEventListener('click', loadAdmin);
  els.clearToken.addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY);
    loadAdmin();
  });
  els.tableBody.addEventListener('click', function (event) {
    const btn = event.target.closest('[data-delete-share]');
    if (btn) deleteShare(btn.dataset.deleteShare);
  });

  loadAdmin();
})();
