import type { AnalysisResult, CallLineIn, CallScript, DashboardStats, Health, InputType, Lang, Scenario, ScanSummary, SpeakerResult, ThreatIntel } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

import { ApiError } from "./apiError";
import { browserApi } from "./browserApi";

export { ApiError, errorKind, type ErrorKind } from "./apiError";

/** Static (GitHub Pages) builds run the analysis engine in the browser instead of calling a server. */
export const STATIC_MODE = import.meta.env.VITE_STATIC_DEMO === "1";

const ANALYZE_TIMEOUT_MS = 60_000; // URL checks + optional AI can take a while
const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(ctrl.signal.aborted ? 408 : 0, ctrl.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { detail?: string; errors?: { message?: string }[] };
  if (!res.ok) throw new ApiError(res.status, body.detail ?? `HTTP ${res.status}`, body.errors?.[0]?.message);
  return body as T;
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }, ANALYZE_TIMEOUT_MS);

const serverApi = {
  health: () => request<Health>("/api/health"),
  analyze: (type: InputType, content: string, lang: Lang, isDemo = false) => {
    if (type === "url") return post<AnalysisResult>("/api/analyze/url", { url: content, lang, is_demo: isDemo });
    if (type === "investment") return post<AnalysisResult>("/api/analyze/investment", { content, lang, is_demo: isDemo });
    return post<AnalysisResult>("/api/analyze/text", { content, input_type: type, lang, is_demo: isDemo });
  },
  analyzeCall: (lines: CallLineIn[], lang: Lang, save = false, isDemo = false) =>
    request<AnalysisResult>("/api/analyze/call", { method: "POST", body: JSON.stringify({ lines, lang, save, is_demo: isDemo }) }, save ? 60_000 : 15_000),
  callSpeakers: (lines: CallLineIn[], lang: Lang) =>
    request<SpeakerResult>("/api/analyze/call/speakers", { method: "POST", body: JSON.stringify({ lines, lang }) }, 30_000),
  callScript: (lang: Lang) => request<CallScript>(`/api/demo/call-script?lang=${lang}`),
  history: (params: { risk_level?: string; input_type?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    return request<{ items: ScanSummary[]; total: number }>(`/api/history?${q}`);
  },
  scan: (id: number | string) => request<AnalysisResult>(`/api/history/${id}`),
  deleteScan: (id: number) => request<void>(`/api/history/${id}`, { method: "DELETE" }),
  clearHistory: () => request<void>("/api/history", { method: "DELETE" }),
  stats: (lang: Lang) => request<DashboardStats>(`/api/dashboard/stats?lang=${lang}`),
  threats: (lang: Lang) => request<ThreatIntel>(`/api/threats?lang=${lang}`),
  scenarios: (lang: Lang) => request<Scenario[]>(`/api/demo/scenarios?lang=${lang}`),
};

export const api: typeof serverApi = STATIC_MODE ? browserApi : serverApi;
