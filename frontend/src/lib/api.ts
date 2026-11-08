import type { AnalysisResult, CallScript, DashboardStats, Health, InputType, Lang, Scenario, ScanSummary, ThreatIntel } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public fieldMessage?: string) {
    super(message);
  }
}

/** Status 0 = network failure, 408 = client-side timeout. */
export type ErrorKind = "network" | "timeout" | "invalid" | "rateLimit" | "notFound" | "unavailable" | "server";

export function errorKind(err: unknown): ErrorKind {
  if (!(err instanceof ApiError)) return "server";
  if (err.status === 0) return "network";
  if (err.status === 408) return "timeout";
  if (err.status === 422 || err.status === 400) return "invalid";
  if (err.status === 429) return "rateLimit";
  if (err.status === 404) return "notFound";
  if (err.status === 503) return "unavailable";
  return "server";
}

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

export const api = {
  health: () => request<Health>("/api/health"),
  analyze: (type: InputType, content: string, lang: Lang, isDemo = false) => {
    if (type === "url") return post<AnalysisResult>("/api/analyze/url", { url: content, lang, is_demo: isDemo });
    if (type === "investment") return post<AnalysisResult>("/api/analyze/investment", { content, lang, is_demo: isDemo });
    return post<AnalysisResult>("/api/analyze/text", { content, input_type: type, lang, is_demo: isDemo });
  },
  analyzeCall: (transcript: string, lang: Lang, save = false, isDemo = false) =>
    request<AnalysisResult>("/api/analyze/call", { method: "POST", body: JSON.stringify({ transcript, lang, save, is_demo: isDemo }) }, save ? 60_000 : 15_000),
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
