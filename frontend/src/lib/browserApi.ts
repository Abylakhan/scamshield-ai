/**
 * Browser-only API used by the GitHub Pages build: same interface as the server client, but analysis runs in a
 * Web Worker (the real Python engine via Pyodide) and history is kept in this browser's localStorage.
 * Aggregations mirror backend/app/routers/dashboard.py.
 */
import { ApiError } from "./apiError";
import type { AnalysisResult, CallScript, DashboardStats, Health, InputType, Lang, RiskLevel, Scenario, ScanSummary, ThreatIntel } from "./types";

// ---------- worker ----------

type EngineStage = "idle" | "runtime" | "packages" | "engine" | "ready" | "failed";
let worker: Worker | null = null;
let stage: EngineStage = "idle";
let readyPromise: Promise<void> | null = null;
let nextCall = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
const stageListeners = new Set<(s: EngineStage) => void>();

export function onEngineStage(fn: (s: EngineStage) => void) {
  stageListeners.add(fn);
  fn(stage);
  return () => { stageListeners.delete(fn); };
}
const setStage = (s: EngineStage) => { stage = s; stageListeners.forEach((f) => f(s)); };

function ensureWorker(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<void>((resolve, reject) => {
    worker = new Worker(new URL("../engine/engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "status") setStage(m.stage);
      else if (m.type === "ready") { setStage("ready"); resolve(); }
      else if (m.type === "failed") { setStage("failed"); reject(new ApiError(0, m.error)); }
      else if (m.type === "result") {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.ok) p.resolve(m.data);
        else p.reject(new ApiError(m.status, m.detail, m.errors?.[0]?.message));
      }
    };
    worker.onerror = () => { setStage("failed"); reject(new ApiError(0, "engine failed to start")); };
    worker.postMessage({ type: "init", engineUrl: `${import.meta.env.BASE_URL}engine/engine.json` });
  });
  readyPromise.catch(() => { readyPromise = null; worker?.terminate(); worker = null; });
  return readyPromise;
}

async function call<T>(op: string, args: object): Promise<T> {
  await ensureWorker();
  const id = ++nextCall;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ type: "call", id, op, args });
  });
}

// ---------- local history store ----------

interface StoredScan extends AnalysisResult { id: number; created_at: string }
const KEY = "scamshield.scans.v1";
let memory: StoredScan[] = []; // fallback when storage is unavailable (private mode)

function load(): StoredScan[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredScan[]) : memory;
  } catch { return memory; }
}
function store(scans: StoredScan[]) {
  memory = scans;
  try { localStorage.setItem(KEY, JSON.stringify(scans.slice(0, 500))); } catch { /* quota or private mode */ }
}
const newest = (a: StoredScan, b: StoredScan) => b.created_at.localeCompare(a.created_at) || b.id - a.id;
const historyRefs = () => load().sort(newest).slice(0, 2000)
  .map((s) => ({ id: s.id, submitted_content: s.submitted_content ?? "", threat_type: s.threat_type, risk_score: s.risk_score }));

function persist(result: AnalysisResult): AnalysisResult {
  const scans = load();
  const id = scans.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  const rec: StoredScan = { ...result, id, created_at: new Date().toISOString(), status: "completed" };
  store([rec, ...scans]);
  return rec;
}

const truncate = (t: string, n = 140) => (t.length <= n ? t : `${t.slice(0, n - 1)}…`);
const LEVELS: RiskLevel[] = ["low", "moderate", "high", "critical"];
const CATS = ["phishing", "social_engineering", "financial_fraud", "technical", "contextual"] as const;

let catalogCache: { lang: Lang; data: Promise<{ categories: { id: string; label: string; description: string }[]; labels: Record<string, string>; reference_patterns: ThreatIntel["reference_patterns"]; disclaimer: string }> } | null = null;
function catalog(lang: Lang) {
  if (catalogCache?.lang !== lang) catalogCache = { lang, data: call("catalog", { lang }) };
  return catalogCache.data;
}

// ---------- API (same shape as the server client) ----------

export const browserApi = {
  health: async (): Promise<Health> => {
    await ensureWorker();
    return { status: "ok", mode: "browser", ai_provider: { enabled: false, model: null },
      checks: { url_fetch: false, domain_age_rdap: false, google_safe_browsing: false, virustotal: false } };
  },

  analyze: async (type: InputType, content: string, lang: Lang, isDemo = false) => {
    const kind = type === "url" ? "url" : type === "investment" ? "investment" : "text";
    const body = type === "url" ? { url: content, lang, is_demo: isDemo }
      : type === "investment" ? { content, lang, is_demo: isDemo } : { content, input_type: type, lang, is_demo: isDemo };
    const r = await call<AnalysisResult>("analyze", { kind, body, history: historyRefs() });
    return persist(r);
  },

  analyzeCall: async (transcript: string, lang: Lang, save = false, isDemo = false) => {
    const r = await call<AnalysisResult & { save?: boolean }>("analyze_call", {
      body: { transcript, lang, save, is_demo: isDemo }, history: save ? historyRefs() : [],
    });
    delete r.save;
    return save ? persist(r) : r;
  },

  callScript: (lang: Lang) => call<CallScript>("call_script", { lang }),
  scenarios: (lang: Lang) => call<Scenario[]>("scenarios", { lang }),

  history: async (params: { risk_level?: string; input_type?: string; limit?: number; offset?: number } = {}) => {
    let scans = load().sort(newest);
    if (params.risk_level) scans = scans.filter((s) => s.risk_level === params.risk_level);
    if (params.input_type) scans = scans.filter((s) => s.input_type === params.input_type);
    const offset = params.offset ?? 0;
    const items: ScanSummary[] = scans.slice(offset, offset + (params.limit ?? 50)).map((s) => ({
      id: s.id, submitted_content: truncate(s.submitted_content ?? ""), input_type: s.input_type, risk_score: s.risk_score,
      risk_level: s.risk_level, threat_type: s.threat_type, confidence: s.confidence, status: s.status, is_demo: s.is_demo,
      ai_used: s.ai_used, created_at: s.created_at,
    }));
    return { items, total: scans.length };
  },

  scan: async (id: number | string) => {
    const s = load().find((x) => x.id === Number(id));
    if (!s) throw new ApiError(404, "Scan not found");
    const similar = await call<AnalysisResult["similar"]>("similar", { content: s.submitted_content ?? "", exclude_id: s.id, history: historyRefs() });
    return { ...s, similar };
  },

  deleteScan: async (id: number) => {
    const scans = load();
    if (!scans.some((s) => s.id === id)) throw new ApiError(404, "Scan not found");
    store(scans.filter((s) => s.id !== id));
  },

  clearHistory: async () => { store([]); },

  stats: async (lang: Lang): Promise<DashboardStats> => {
    const scans = load().sort(newest);
    const { labels } = await catalog(lang);
    const by_level = Object.fromEntries(LEVELS.map((l) => [l, scans.filter((s) => s.risk_level === l).length])) as Record<RiskLevel, number>;
    const typeCounts = new Map<string, number>();
    scans.filter((s) => s.risk_score >= 25).forEach((s) => typeCounts.set(s.threat_type, (typeCounts.get(s.threat_type) ?? 0) + 1));
    const by_input_type: Record<string, number> = {};
    scans.forEach((s) => { by_input_type[s.input_type] = (by_input_type[s.input_type] ?? 0) + 1; });
    const category_points = Object.fromEntries(CATS.map((c) => [c, 0])) as DashboardStats["category_points"];
    scans.forEach((s) => CATS.forEach((c) => { category_points[c] += s.score_breakdown?.[c] ?? 0; }));
    // 14 daily buckets in UTC, like the server
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const activity = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today.getTime() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
      const day = scans.filter((s) => s.created_at.slice(0, 10) === d);
      return { date: d, scans: day.length, threats: day.filter((s) => s.risk_score >= 50).length };
    });
    const seen = new Set<string>();
    const suspicious_domains: DashboardStats["suspicious_domains"] = [];
    for (const s of scans.filter((x) => x.risk_score >= 50).slice(0, 50)) {
      for (const d of s.domains ?? []) {
        if (!seen.has(d)) { seen.add(d); suspicious_domains.push({ domain: d, risk_score: s.risk_score, scan_id: s.id, created_at: s.created_at }); }
      }
    }
    const avg = scans.length ? scans.reduce((a, s) => a + s.risk_score, 0) / scans.length : 0;
    return {
      total_scans: scans.length,
      threats_detected: scans.filter((s) => s.risk_score >= 50).length,
      critical_threats: scans.filter((s) => s.risk_score >= 75).length,
      average_risk: Math.round(avg * 10) / 10,
      ai_scans: 0,
      demo_scans: scans.filter((s) => s.is_demo).length,
      by_level,
      by_threat_type: [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, label: labels[type] ?? type, count })),
      by_input_type,
      category_points,
      activity,
      recent: scans.slice(0, 6).map((s) => ({ id: s.id, input_type: s.input_type, risk_score: s.risk_score, risk_level: s.risk_level,
        threat_type: s.threat_type, content: (s.submitted_content ?? "").slice(0, 90), created_at: s.created_at, is_demo: s.is_demo })),
      suspicious_domains: suspicious_domains.slice(0, 8),
    };
  },

  threats: async (lang: Lang): Promise<ThreatIntel> => {
    const scans = load().sort(newest);
    const cat = await catalog(lang);
    const counts = new Map<string, number>();
    scans.forEach((s) => counts.set(s.threat_type, (counts.get(s.threat_type) ?? 0) + 1));
    const indCount = new Map<string, number>();
    const indName = new Map<string, string>();
    const sev = { low: 0, medium: 0, high: 0, critical: 0 };
    const domains = new Map<string, { domain: string; max_risk: number; seen: number; last_seen: string; indicators: Set<string> }>();
    for (const s of scans.filter((x) => x.risk_score >= 25).slice(0, 300)) {
      for (const i of s.indicators ?? []) {
        if (i.weight > 0) {
          indCount.set(i.id, (indCount.get(i.id) ?? 0) + 1);
          if (!indName.has(i.id)) indName.set(i.id, i.name);
          if (i.severity in sev) sev[i.severity as keyof typeof sev]++;
        }
      }
      for (const d of s.domains ?? []) {
        const e = domains.get(d) ?? { domain: d, max_risk: 0, seen: 0, last_seen: s.created_at, indicators: new Set<string>() };
        e.max_risk = Math.max(e.max_risk, s.risk_score);
        e.seen++;
        (s.indicators ?? []).filter((i) => (i.source === "url" || i.source === "intel") && i.weight > 0).forEach((i) => e.indicators.add(i.name));
        domains.set(d, e);
      }
    }
    return {
      categories: cat.categories.map((c) => ({ ...c, observed: counts.get(c.id) ?? 0 })),
      reference_patterns: cat.reference_patterns,
      top_indicators: [...indCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ id, name: indName.get(id)!, count })),
      severity_distribution: sev,
      domain_indicators: [...domains.values()].sort((a, b) => b.max_risk - a.max_risk || b.seen - a.seen).slice(0, 20)
        .map((e) => ({ ...e, indicators: [...e.indicators].sort().slice(0, 4) })),
      recent_findings: scans.filter((s) => s.risk_score >= 50).slice(0, 8).map((s) => ({ id: s.id, threat_type: s.threat_type,
        label: cat.labels[s.threat_type] ?? s.threat_type, risk_score: s.risk_score, summary: s.summary, created_at: s.created_at, is_demo: s.is_demo })),
      disclaimer: cat.disclaimer,
    };
  },
};
