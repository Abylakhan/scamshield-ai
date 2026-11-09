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
    const model = env.GEMINI_MODEL || "gemini-3.8-flash";
    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: Boolean(env.GEMINI_API_KEY), model }, 200, h);
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

    const upstream = await fetch(`${GOOGLE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(forward),
    });
    // Pass Google's answer through unchanged (error messages never contain the key).
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json", ...h } });
  },
};
