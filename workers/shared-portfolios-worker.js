const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GemelHub-Admin-Token',
    'Vary': 'Origin'
  };
}

function jsonResponse(request, body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function makeId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

async function uniqueId(env) {
  for (let i = 0; i < 8; i++) {
    const id = makeId(6);
    if (!await env.GEMELHUB_SHARED_PORTFOLIOS.get(id)) return id;
  }
  return makeId(9);
}

function idFromRequest(request) {
  const url = new URL(request.url);
  const queryId = url.searchParams.get('id');
  if (queryId) return queryId;
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function isAdminRequest(request, env) {
  const configured = String(env.GEMELHUB_ADMIN_TOKEN || '').trim();
  if (!configured) return { ok: false, status: 503, error: 'Admin token is not configured' };
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const headerToken = request.headers.get('X-GemelHub-Admin-Token') || '';
  const provided = bearer || headerToken;
  return provided && provided === configured
    ? { ok: true }
    : { ok: false, status: 401, error: 'Unauthorized' };
}

function extractPortfolioItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.portfolio)) return payload.portfolio;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.compareItems)) {
    return payload.compareItems.flatMap(item => Array.isArray(item.portfolio) ? item.portfolio : []);
  }
  return [];
}

function buildPayloadSummary(type, payload) {
  const items = extractPortfolioItems(payload).filter(item => item && !item.hidden);
  const categories = new Set(items.map(item => item && item.categoryId).filter(Boolean));
  const managers = new Set(items.map(item => String(item && item.provider || '').trim()).filter(Boolean));
  const totalValue = items.reduce((sum, item) => {
    if (!item || item.investMode === 'percent') return sum;
    const amount = parseFloat(String(item.investAmount || '').replace(/,/g, '')) || 0;
    return sum + amount;
  }, 0);
  return {
    type,
    trackCount: items.length,
    categoryCount: categories.size,
    managerCount: managers.size,
    totalValue: Math.round(totalValue)
  };
}

async function listShareRecords(env, limit) {
  const records = [];
  let cursor;
  let activeCount = 0;
  do {
    const page = await env.GEMELHUB_SHARED_PORTFOLIOS.list({ cursor });
    activeCount += page.keys.length;
    for (const key of page.keys) {
      if (records.length >= limit) continue;
      const raw = await env.GEMELHUB_SHARED_PORTFOLIOS.get(key.name);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw);
        records.push({
          id: key.name,
          type: record.type || 'portfolio',
          createdAt: record.createdAt || '',
          expiresAt: record.expiresAt || '',
          openCount: Number(record.openCount || 0),
          lastOpenedAt: record.lastOpenedAt || '',
          summary: record.summary || buildPayloadSummary(record.type || 'portfolio', record.payload)
        });
      } catch (error) {
        records.push({ id: key.name, type: 'unknown', createdAt: '', expiresAt: '', openCount: 0, summary: null });
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  records.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { activeCount, records };
}

async function adminResponse(request, env) {
  const url = new URL(request.url);
  const auth = isAdminRequest(request, env);
  if (!auth.ok) return jsonResponse(request, { error: auth.error }, auth.status);

  if (url.pathname.endsWith('/admin/health')) {
    return jsonResponse(request, {
      ok: true,
      service: 'gemelhub-share',
      ttlSeconds: Number(env.SHARED_PORTFOLIO_TTL_SECONDS || DEFAULT_TTL_SECONDS),
      now: new Date().toISOString()
    });
  }

  if (url.pathname.endsWith('/admin/summary')) {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 30)));
    const { activeCount, records } = await listShareRecords(env, limit);
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const byType = records.reduce((acc, record) => {
      acc[record.type] = (acc[record.type] || 0) + 1;
      return acc;
    }, {});
    return jsonResponse(request, {
      ok: true,
      activeLinks: activeCount,
      created24h: records.filter(record => Date.parse(record.createdAt || '') >= dayAgo).length,
      created7d: records.filter(record => Date.parse(record.createdAt || '') >= weekAgo).length,
      totalOpens: records.reduce((sum, record) => sum + Number(record.openCount || 0), 0),
      byType,
      recent: records,
      generatedAt: new Date().toISOString()
    });
  }

  if (request.method === 'DELETE' && url.pathname.includes('/admin/share/')) {
    const id = url.pathname.split('/').filter(Boolean).pop() || '';
    if (!/^[A-Za-z0-9]{4,20}$/.test(id)) return jsonResponse(request, { error: 'Invalid id' }, 400);
    await env.GEMELHUB_SHARED_PORTFOLIOS.delete(id);
    return jsonResponse(request, { ok: true, deleted: id });
  }

  return jsonResponse(request, { error: 'Admin route not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (!env.GEMELHUB_SHARED_PORTFOLIOS) {
      return jsonResponse(request, { error: 'KV binding GEMELHUB_SHARED_PORTFOLIOS is missing' }, 500);
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse(request, { error: 'Invalid JSON' }, 400);
      }

      if (!body || !['portfolio', 'compare'].includes(body.type) || !body.payload) {
        return jsonResponse(request, { error: 'Missing type or payload' }, 400);
      }

      const id = await uniqueId(env);
      const ttlSeconds = Number(env.SHARED_PORTFOLIO_TTL_SECONDS || DEFAULT_TTL_SECONDS);
      const createdAtMs = Date.parse(body.createdAt || '');
      const createdAt = Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : new Date().toISOString();
      const record = {
        type: body.type,
        payload: body.payload,
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + ttlSeconds * 1000).toISOString(),
        openCount: 0,
        lastOpenedAt: '',
        summary: buildPayloadSummary(body.type, body.payload)
      };
      await env.GEMELHUB_SHARED_PORTFOLIOS.put(id, JSON.stringify(record), {
        expirationTtl: ttlSeconds
      });

      return jsonResponse(request, { id });
    }

    if (url.pathname.includes('/admin/')) {
      return adminResponse(request, env);
    }

    if (request.method === 'GET') {
      const id = idFromRequest(request);
      if (!/^[A-Za-z0-9]{4,20}$/.test(id)) {
        return jsonResponse(request, { error: 'Invalid id' }, 400);
      }

      const raw = await env.GEMELHUB_SHARED_PORTFOLIOS.get(id);
      if (!raw) return jsonResponse(request, { error: 'Not found' }, 404);
      try {
        const record = JSON.parse(raw);
        record.openCount = Number(record.openCount || 0) + 1;
        record.lastOpenedAt = new Date().toISOString();
        if (!record.summary) record.summary = buildPayloadSummary(record.type || 'portfolio', record.payload);
        const expiresAt = Date.parse(record.expiresAt || '');
        const remainingTtl = Number.isFinite(expiresAt) ? Math.ceil((expiresAt - Date.now()) / 1000) : 0;
        if (remainingTtl > 0) {
          await env.GEMELHUB_SHARED_PORTFOLIOS.put(id, JSON.stringify(record), { expirationTtl: remainingTtl });
        }
        return new Response(JSON.stringify(record), {
          headers: {
            ...corsHeaders(request),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'private, max-age=300'
          }
        });
      } catch (error) {
        // Older records should still be readable even if statistics update fails.
      }
      return new Response(raw, {
        headers: {
          ...corsHeaders(request),
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'private, max-age=300'
        }
      });
    }

    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  }
};
