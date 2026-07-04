# GemelHub Shared Portfolio Worker

This Worker stores shared lab portfolios in Cloudflare KV and returns short IDs
that the frontend can share through WhatsApp.

## Deploy

1. Log in to Cloudflare:

   ```bash
   npx wrangler login
   ```

2. Create the production KV namespace:

   ```bash
   npx wrangler kv namespace create GEMELHUB_SHARED_PORTFOLIOS
   ```

3. Create the preview KV namespace:

   ```bash
   npx wrangler kv namespace create GEMELHUB_SHARED_PORTFOLIOS --preview
   ```

4. Copy the returned `id` and `preview_id` into `wrangler.toml`.

5. Deploy:

   ```bash
   npx wrangler deploy
   ```

6. Copy the deployed Worker URL into `CONFIG.API.SHARED_PORTFOLIO_ENDPOINT`
   in `js/config.js`.

## API Contract

Create a shared payload:

```http
POST /
Content-Type: application/json

{ "type": "portfolio", "payload": { "v": 2, "p": [], "n": "" } }
```

Response:

```json
{ "id": "Ab7k2Q" }
```

Load a shared payload:

```http
GET /Ab7k2Q
```
## Admin dashboard

The admin dashboard at `admin.html` uses protected Worker endpoints:

- `GET /admin/health`
- `GET /admin/summary?limit=40`
- `DELETE /admin/share/:id`

Before using it in production, configure an admin secret in Cloudflare:

```bash
npx wrangler secret put GEMELHUB_ADMIN_TOKEN
```

Use the same token in the `admin.html` login field. The token is stored only in
the browser local storage on the admin machine.

The dashboard shows anonymous operational summaries by default. It does not show
full portfolio payloads in the table.
