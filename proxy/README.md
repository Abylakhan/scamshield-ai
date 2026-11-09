# ScamShield AI — Gemini proxy

A tiny Cloudflare Worker that lets the public GitHub Pages site use Gemini **without exposing the API key**.
The site sends a ready request body; the Worker adds the key (stored as a Cloudflare secret) and forwards it to Google.

Guards: only `ALLOWED_ORIGINS` (plus localhost) may call it, the model is fixed (`GEMINI_MODEL`), requests are
capped at 64 KB, answers at 4096 tokens, and each IP gets 20 requests per minute. Nothing is logged or stored.

## Deploy (free Cloudflare account, ~3 minutes)

```bash
cd proxy
npx wrangler login                      # opens the browser once
npx wrangler secret put GEMINI_API_KEY  # paste the key from aistudio.google.com/apikey
npx wrangler deploy                     # prints https://scamshield-ai-proxy.<you>.workers.dev
```

Then put that URL into `frontend/.env.pages` (`VITE_AI_PROXY=https://…workers.dev`) and rebuild the site with
`npm run build:pages`. Check it: `curl -H "Origin: https://abylakhan.github.io" https://…workers.dev/health`
→ `{"ok":true,…}`.

Tests (offline, Google mocked): `node test.mjs`.
