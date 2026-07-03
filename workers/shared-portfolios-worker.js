const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

export default {
  async fetch(request, env) {
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
      const record = {
        type: body.type,
        payload: body.payload,
        createdAt: body.createdAt || new Date().toISOString()
      };
      await env.GEMELHUB_SHARED_PORTFOLIOS.put(id, JSON.stringify(record), {
        expirationTtl: Number(env.SHARED_PORTFOLIO_TTL_SECONDS || DEFAULT_TTL_SECONDS)
      });

      return jsonResponse(request, { id });
    }

    if (request.method === 'GET') {
      const id = idFromRequest(request);
      if (!/^[A-Za-z0-9]{4,20}$/.test(id)) {
        return jsonResponse(request, { error: 'Invalid id' }, 400);
      }

      const raw = await env.GEMELHUB_SHARED_PORTFOLIOS.get(id);
      if (!raw) return jsonResponse(request, { error: 'Not found' }, 404);
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
