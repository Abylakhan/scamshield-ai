/**
 * Gemini for the browser build. By default the site's own proxy (proxy/, a Cloudflare Worker that holds the API key
 * as a secret) is used, so AI works for every visitor without setup. A visitor may instead add a personal key: it is
 * kept only in this browser's localStorage and sent only to Google's Generative Language API.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** URL of the site's Gemini proxy, set at build time (VITE_AI_PROXY); empty = no built-in AI. */
export const AI_PROXY = ((import.meta.env.VITE_AI_PROXY as string | undefined) ?? "").trim().replace(/\/+$/, "");
const KEY = "scamshield.gemini.v1";
const API = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiSettings { apiKey: string; model: string; proxy?: string }

/** The visitor's own key, if they added one. */
export function loadPersonalGemini(): GeminiSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as GeminiSettings) : null;
    return s?.apiKey ? { apiKey: s.apiKey, model: s.model || DEFAULT_GEMINI_MODEL } : null;
  } catch { return null; }
}

/** Settings to use: the personal key when present, otherwise the built-in proxy (model is chosen by the proxy). */
export function loadGemini(): GeminiSettings | null {
  return loadPersonalGemini() ?? (AI_PROXY ? { apiKey: "", model: DEFAULT_GEMINI_MODEL, proxy: AI_PROXY } : null);
}

export function saveGemini(s: GeminiSettings | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify({ apiKey: s.apiKey.trim(), model: s.model.trim() || DEFAULT_GEMINI_MODEL }));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("scamshield:gemini"));
}

export class GeminiError extends Error {
  constructor(public kind: "key" | "model" | "quota" | "network" | "other", message: string) { super(message); }
}

/** POST a generateContent body; returns the raw response JSON. */
export async function callGemini(s: GeminiSettings, body: object, timeoutMs = 45_000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = s.proxy
      ? await fetch(`${s.proxy}/generate`, {
        method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      : await fetch(`${API}/${encodeURIComponent(s.model)}:generateContent`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": s.apiKey },
        body: JSON.stringify(body),
      });
  } catch {
    throw new GeminiError("network", ctrl.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    const kind = res.status === 429 ? "quota" : s.proxy ? "other"
      : res.status === 400 && /api key/i.test(msg) ? "key" : res.status === 401 || res.status === 403 ? "key"
      : res.status === 404 ? "model" : res.status === 429 ? "quota" : "other";
    throw new GeminiError(kind, msg);
  }
  return data;
}

/** Minimal request used by the "Test connection" button. */
export async function testGemini(s: GeminiSettings) {
  await callGemini(s, { contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
    generationConfig: { maxOutputTokens: 16 } }, 20_000);
}
