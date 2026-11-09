import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Globe, Lock, Megaphone, MessageSquareText, RotateCcw, ScanSearch, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ReportView } from "../components/ReportView";
import { ScanSequence } from "../components/ScanSequence";
import { EmptyState, ErrorBox, PageHeader, RiskBadge } from "../components/ui";
import { api } from "../lib/api";
import { cx } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { AnalysisResult, InputType, Scenario } from "../lib/types";
import { Magnetic, Stagger, StaggerItem, softBlur } from "../lib/motion";

type AnalyzerType = Exclude<InputType, "call">;
const TYPES: { id: AnalyzerType; icon: typeof Globe }[] = [
  { id: "message", icon: MessageSquareText },
  { id: "url", icon: Globe },
  { id: "investment", icon: TrendingUp },
  { id: "advertisement", icon: Megaphone },
];
const LONE_URL = /^\s*(?:https?:\/\/|www\.)\S+\s*$|^\s*[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?\s*$/i;
const MIN_SCAN_MS = 2600;
const MAX = 5000;

export default function Analyzer() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const initialType = params.get("type");
  const [type, setType] = useState<AnalyzerType>(TYPES.some((x) => x.id === initialType) ? (initialType as AnalyzerType) : "message");
  const [autoSwitched, setAutoSwitched] = useState(false);
  const [content, setContent] = useState(params.get("q") ?? "");
  const [isDemo, setIsDemo] = useState(params.get("demo") === "1");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [focused, setFocused] = useState(false);
  const autoRan = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.scenarios(lang).then(setScenarios).catch(() => setScenarios([])); }, [lang]);

  const run = useCallback(async (c = content, ty = type, demo = isDemo) => {
    if (!c.trim() || loading) return;
    setLoading(true); setDone(false); setError(null); setResult(null);
    const started = Date.now();
    try {
      const r = await api.analyze(ty, c.trim(), lang, demo);
      const wait = MIN_SCAN_MS - (Date.now() - started);
      setDone(true);
      if (wait > 0) await new Promise((res) => setTimeout(res, Math.min(wait, 700)));
      setResult(r);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [content, type, isDemo, lang, loading]);

  useEffect(() => {
    if (!autoRan.current && params.get("run") === "1" && content) {
      autoRan.current = true;
      setParams({}, { replace: true });
      run();
    }
  }, [params, content, run, setParams]);

  const pick = (s: Scenario) => {
    setType(s.input_type === "call" ? "message" : s.input_type); setContent(s.content); setAutoSwitched(false); setIsDemo(true); setResult(null); setError(null);
  };

  const hasUrl = type === "url" || /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(content);

  return (
    <>
      <PageHeader title={t.analyzer.title} subtitle={t.analyzer.subtitle} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={cx("panel panel-pad relative transition-shadow duration-500", focused && "shadow-[0_0_0_1px_rgba(34,211,238,.25),0_20px_60px_-20px_rgba(34,211,238,.35)]", loading && "border-glow")}>
          <div role="tablist" aria-label="Input type" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map(({ id, icon: Icon }) => (
              <motion.button key={id} role="tab" aria-selected={type === id} onClick={() => { setType(id); setIsDemo(false); setAutoSwitched(false); }} whileTap={{ scale: 0.96 }}
                className={cx("relative flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors duration-300",
                  type === id ? "border-cyan-400/50 text-cyan-200" : "border-line bg-ink-900/50 text-slate-400 hover:border-cyan-400/20 hover:text-white")}>
                {type === id && <motion.span layoutId="input-type-pill" className="absolute inset-0 rounded-xl bg-cyan-400/10 shadow-[inset_0_0_20px_rgba(34,211,238,.12)]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <motion.span className="relative" animate={type === id ? { rotate: [0, -12, 12, 0], scale: 1.1 } : { scale: 1 }} transition={{ duration: 0.45 }}><Icon size={16} /></motion.span>
                <span className="relative truncate">{t.types[id]}</span>
              </motion.button>
            ))}
          </div>

          <AnimatePresence>
            {autoSwitched && type === "url" && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mb-2 text-xs text-cyan-300" role="status">{t.analyzer2.detectedUrl}</motion.p>
            )}
          </AnimatePresence>
          <label htmlFor="content" className="sr-only">{t.types[type]}</label>
          <div className="relative">
          {loading && (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl" aria-hidden>
              <div className="absolute inset-0 bg-cyan-400/[0.03]" />
              <div className="animate-laser absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_18px_4px_rgba(34,211,238,.45)]" />
            </div>
          )}
          <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={type === "url" ? "url" : "text"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
          {type === "url" ? (
            <input id="content" value={content} onChange={(e) => { setContent(e.target.value); setIsDemo(false); }}
              onKeyDown={(e) => e.key === "Enter" && run()} placeholder={t.analyzer.placeholder.url} maxLength={2048}
              spellCheck={false} autoComplete="off"
              className="w-full rounded-xl border border-line bg-ink-950/70 px-4 py-4 font-mono text-sm text-white transition-colors duration-300 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none" />
          ) : (
            <textarea id="content" value={content} onChange={(e) => {
                const v = e.target.value;
                setContent(v); setIsDemo(false);
                // A lone link pasted into the message box is analysed as a URL (deeper checks).
                if (type !== "investment" && LONE_URL.test(v)) { setType("url"); setContent(v.trim()); setAutoSwitched(true); }
              }}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && run()}
              placeholder={t.analyzer.placeholder[type]} maxLength={MAX} rows={8}
              className="w-full resize-y rounded-xl border border-line bg-ink-950/70 px-4 py-3.5 text-[15px] leading-relaxed text-white transition-colors duration-300 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none" />
          )}
          </motion.div>
          </AnimatePresence>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock size={12} />{t.analyzer.privacy}
              <motion.span key={content.length > 0 ? "has" : "none"} initial={{ scale: 1.2, color: "#7ee8fa" }} animate={{ scale: 1, color: "#64748b" }} className="ml-2 font-mono">{content.length}/{type === "url" ? 2048 : MAX}</motion.span>
              {isDemo && <span className="ml-2 chip border-volt-400/40 bg-volt-400/10 text-[10px] uppercase text-blue-300">{t.common.testExample}</span>}
            </p>
            <div className="flex gap-2">
              {(content || result) && (
                <button className="btn-ghost" onClick={() => { setContent(""); setResult(null); setError(null); setIsDemo(false); }} aria-label="Reset"><RotateCcw size={15} /></button>
              )}
              <Magnetic strength={0.15}>
                <button className="btn-primary min-w-[150px]" disabled={!content.trim() || loading} onClick={() => run()}>
                  <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { duration: 1.2, repeat: Infinity, ease: "linear" } : {}}><ScanSearch size={16} /></motion.span>
                  {loading ? t.analyzer.scanning + "…" : t.common.analyze}
                </button>
              </Magnetic>
            </div>
          </div>
        </motion.section>

        <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} className="panel panel-pad">
          <p className="label mb-3 flex items-center gap-2"><FlaskConical size={13} />{t.analyzer.examples}</p>
          {scenarios.length > 0 ? (
            <Stagger as="ul" className="space-y-1.5" stagger={0.05} delay={0.2} key={lang}>
              {scenarios.map((s) => (
                <StaggerItem as="li" key={s.id}>
                  <button onClick={() => pick(s)} className={cx("group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-all duration-300 hover:translate-x-1",
                    content === s.content ? "border-cyan-400/30 bg-cyan-400/5 text-white" : "border-transparent text-slate-300 hover:border-line hover:bg-ink-900")}>
                    <span className="truncate">{s.title}</span><RiskBadge level={s.expected_level} />
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          ) : <p className="text-xs text-slate-500">—</p>}
        </motion.aside>
      </div>

      <div ref={resultRef} className="relative mt-6 scroll-mt-20">
        <AnimatePresence mode="popLayout">
          {loading && !result ? (
            <motion.div key="scan" initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, ...softBlur(6) }} className="max-w-xl">
              <ScanSequence done={done} hasUrl={hasUrl} />
            </motion.div>
          ) : error ? (
            <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><ErrorBox error={error} onRetry={() => run()} /></motion.div>
          ) : result ? (
            <motion.div key={`r${result.id}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}><ReportView r={result} /></motion.div>
          ) : (
            <motion.div key="empty" className="panel"><EmptyState title={t.analyzer.emptyTitle} body={t.analyzer.emptyBody} /></motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
