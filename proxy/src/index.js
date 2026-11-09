/**
 * Gemini proxy for the ScamShield AI browser build (GitHub Pages).
 *
 * The site sends a ready generateContent body; the Worker adds the secret API key and forwards it to Google.
 * Guards: allowed origins only, fixed model, request size cap, output-token cap, per-IP rate limit.
 * Nothing is logged or stored.
 */
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_BODY = 64 * 1024; // bytes
const MAX_OUTPUT_TOKENS = 4096;
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ATTEMPT_MS = 18_000; // per model; the site waits up to 45 s in total

/** Primary model first, then FALLBACK_MODELS (comma-separated) — used when a model is overloaded or slow. */
function models(env) {
  const list = [env.GEMINI_MODEL || "gemini-3.8-flash", ...(env.FALLBACK_MODELS || "").split(",")];
  return [...new Set(list.map((m) => m.trim()).filter(Boolean))];
}

async function callModel(model, env, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_MS);
  try {
    return await fetch(`${GOOGLE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: payload,
    });
  } catch {
    return null; // timeout / network — try the next model
  } finally {
    clearTimeout(timer);
  }
}

function allowed(origin, env) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) || LOCAL.test(origin);
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (!allowed(origin, env)) return json({ error: { message: "origin not allowed" } }, 403, {});
    const h = cors(origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);
    const model = models(env)[0];
    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: Boolean(env.GEMINI_API_KEY), model, fallbacks: models(env).slice(1) }, 200, h);
    }
    if (req.method === "GET" && url.pathname === "/models" && env.GEMINI_API_KEY) {
      // Names only (no key, no quotas): which Gemini models this key can use — for choosing fallbacks.
      const r = await fetch(`${GOOGLE}?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
      const d = await r.json().catch(() => ({}));
      const names = (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => String(m.name).replace(/^models\//, ""));
      return json({ models: names }, r.ok ? 200 : r.status, h);
    }
    if (req.method !== "POST" || url.pathname !== "/generate") return json({ error: { message: "not found" } }, 404, h);
    if (!env.GEMINI_API_KEY) return json({ error: { message: "proxy has no API key configured" } }, 503, h);

    if (env.LIMITER) {
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return json({ error: { message: "rate limit — try again in a minute" } }, 429, h);
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: { message: "request too large" } }, 413, h);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: { message: "invalid JSON" } }, 400, h); }
    if (!body || !Array.isArray(body.contents)) return json({ error: { message: "invalid request" } }, 400, h);
    // Only the fields the site uses are forwarded; output length is capped.
    const gen = { ...(body.generationConfig || {}) };
    gen.maxOutputTokens = Math.min(Number(gen.maxOutputTokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);
    const forward = { contents: body.contents, generationConfig: gen };
    if (body.systemInstruction) forward.systemInstruction = body.systemInstruction;

    const payload = JSON.stringify(forward);
    let last = null;
    for (const m of models(env)) {
      const upstream = await callModel(m, env, payload);
      if (upstream && upstream.status !== 503 && upstream.status !== 429 && upstream.status < 500) {
        // Pass Google's answer through unchanged (error messages never contain the key).
        const text = await upstream.text();
        return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json", "X-Model": m, ...h } });
      }
      last = upstream ? { status: upstream.status, text: await upstream.text() } : null;
    }
    if (last) return new Response(last.text, { status: last.status, headers: { "Content-Type": "application/json", ...h } });
    return json({ error: { message: "Gemini did not answer in time — try again" } }, 504, h);
  },
};
