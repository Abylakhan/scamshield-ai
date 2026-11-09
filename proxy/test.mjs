// Offline tests for the proxy handler (node test.mjs). Google is mocked.
import assert from "node:assert/strict";
import worker from "./src/index.js";

const env = { GEMINI_API_KEY: "TEST-KEY", ALLOWED_ORIGINS: "https://abylakhan.github.io", GEMINI_MODEL: "gemini-3.8-flash" };
const SITE = "https://abylakhan.github.io";
let seen;
globalThis.fetch = async (url, init) => {
  seen = { url, init };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
};
const req = (path, { method = "POST", origin = SITE, body } = {}) =>
  new Request(`https://proxy.example${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body });

// forwards with the secret key, fixed model, capped output
let r = await worker.fetch(req("/generate", { body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 99999 }, tools: [{ x: 1 }] }) }), env);
assert.equal(r.status, 200);
assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE);
assert.match(seen.url, /models\/gemini-3\.8-flash:generateContent$/);
assert.equal(seen.init.headers["x-goog-api-key"], "TEST-KEY");
const fwd = JSON.parse(seen.init.body);
assert.equal(fwd.generationConfig.maxOutputTokens, 4096);
assert.equal(fwd.tools, undefined); // unknown fields dropped
assert.ok(!(await r.text()).includes("TEST-KEY"));

// other sites are refused, before any upstream call
seen = null;
r = await worker.fetch(req("/generate", { origin: "https://evil.example", body: "{}" }), env);
assert.equal(r.status, 403); assert.equal(seen, null);
r = await worker.fetch(req("/generate", { origin: "", body: "{}" }), env);
assert.equal(r.status, 403);

// local development is allowed; preflight works
r = await worker.fetch(req("/generate", { method: "OPTIONS", origin: "http://localhost:5173" }), env);
assert.equal(r.status, 204);

// size, JSON and shape checks
r = await worker.fetch(req("/generate", { body: "x".repeat(70000) }), env); assert.equal(r.status, 413);
r = await worker.fetch(req("/generate", { body: "not json" }), env); assert.equal(r.status, 400);
r = await worker.fetch(req("/generate", { body: "{}" }), env); assert.equal(r.status, 400);

// rate limit
r = await worker.fetch(req("/generate", { body: JSON.stringify({ contents: [] }) }), { ...env, LIMITER: { limit: async () => ({ success: false }) } });
assert.equal(r.status, 429);

// health + missing key
r = await worker.fetch(req("/health", { method: "GET" }), env);
assert.deepEqual(await r.json(), { ok: true, model: "gemini-3.8-flash" });
r = await worker.fetch(req("/generate", { body: JSON.stringify({ contents: [] }) }), { ...env, GEMINI_API_KEY: "" });
assert.equal(r.status, 503);
console.log("proxy: all checks passed");
