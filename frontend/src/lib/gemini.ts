/**
 * Gemini settings for the browser build. The visitor's own API key is kept only in this browser's localStorage
 * and is sent only to Google's Generative Language API — never to the site or the repository.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const KEY = "scamshield.gemini.v1";
const API = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiSettings { apiKey: string; model: string }

export function loadGemini(): GeminiSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as GeminiSettings) : null;
    return s?.apiKey ? { apiKey: s.apiKey, model: s.model || DEFAULT_GEMINI_MODEL } : null;
  } catch { return null; }
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
    res = await fetch(`${API}/${encodeURIComponent(s.model)}:generateContent`, {
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
    const kind = res.status === 400 && /api key/i.test(msg) ? "key" : res.status === 401 || res.status === 403 ? "key"
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
