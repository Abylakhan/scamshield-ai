import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, LayoutDashboard, Loader2, PhoneCall, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ReportView } from "../components/ReportView";
import { ScanSequence } from "../components/ScanSequence";
import { ErrorBox, RiskBadge, TestBadge } from "../components/ui";
import { LogoMark } from "../components/Logo";
import { api } from "../lib/api";
import { RISK_COLOR, cx } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { AnalysisResult, DashboardStats, Scenario } from "../lib/types";
import { CountUp, Magnetic, SpotlightCard, WordReveal, softBlur, unBlur } from "../lib/motion";

export default function Demo() {
  const { t, lang } = useI18n();
  const D = t.demo;
  const [step, setStep] = useState(0);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [chosen, setChosen] = useState<Scenario | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bulk, setBulk] = useState<"idle" | "running" | "done">("idle");
  const [bulkResults, setBulkResults] = useState<Record<string, AnalysisResult>>({});

  useEffect(() => { api.scenarios(lang).then(setScenarios).catch(setError); }, [lang]);
  useEffect(() => { if (step === 4) api.stats(lang).then(setStats).catch(setError); }, [step, lang]);

  const analyze = useCallback(async (s: Scenario) => {
    setChosen(s); setResult(null); setDone(false); setError(null); setStep(2);
    const started = Date.now();
    try {
      const r = await api.analyze(s.input_type, s.content, lang, true);
      setDone(true);
      const wait = 2600 - (Date.now() - started);
      if (wait > 0) await new Promise((res) => setTimeout(res, Math.min(wait, 800)));
      setResult(r);
      setStep(3);
    } catch (e) { setError(e); }
  }, [lang]);

  const runAll = async () => {
    setBulk("running"); setError(null);
    try {
      const out: Record<string, AnalysisResult> = {};
      for (const s of scenarios) {
        out[s.id] = await api.analyze(s.input_type, s.content, lang, true);
        setBulkResults({ ...out });
      }
      setBulk("done");
    } catch (e) { setError(e); setBulk("idle"); }
  };

  const canNext = step === 0 || step === 3 || step === 4 || (step === 1 && !!result);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" && canNext && step < 5) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canNext, step]);

  const recs = result?.recommendations.slice(0, 4) ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">{D.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{D.subtitle}</p>
        </div>
        <span className="chip self-start border-volt-400/40 bg-volt-400/10 text-blue-300">{D.badge}</span>
      </div>

      {/* Stepper */}
      <ol className="mb-6 grid grid-cols-6 gap-1.5" aria-label="Progress">
        {D.steps.map((s, i) => (
          <li key={s}>
            <button onClick={() => (i <= 1 || (i <= 3 && result) || i >= 4) && setStep(i)} className="group w-full text-left" aria-current={step === i}>
              <div className="relative h-1 overflow-hidden rounded-full bg-ink-700">
                <motion.div className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-cyan-400 to-volt-400" initial={false}
                  animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i <= step ? 0.05 * (i - Math.max(0, step - 1)) : 0 }} />
                {i === step && <motion.div className="absolute inset-y-0 w-8 bg-white/60 blur-sm" animate={{ x: ["-2rem", "8rem"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />}
              </div>
              <p className={cx("mt-2 hidden truncate text-[11px] font-medium sm:block", i === step ? "text-cyan-300" : "text-slate-500")}>{i + 1}. {s}</p>
            </button>
          </li>
        ))}
      </ol>

      {error ? <div className="mb-4"><ErrorBox error={error} onRetry={() => (chosen ? analyze(chosen) : setError(null))} /></div> : null}

      <div className="relative">
      <AnimatePresence mode="popLayout">
        <motion.div key={step} initial={{ opacity: 0, x: 40, ...softBlur(8) }} animate={{ opacity: 1, x: 0, ...unBlur }} exit={{ opacity: 0, x: -40, ...softBlur(8) }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
          {step === 0 && (
            <section className="panel relative overflow-hidden p-8 sm:p-12">
              <div className="pointer-events-none absolute inset-0 grid-bg opacity-70 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
              <div className="relative max-w-2xl">
                <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="inline-block">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}><LogoMark size={64} /></motion.div>
                </motion.div>
                <h2 className="mt-6 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl"><WordReveal key={lang} text={D.introTitle} delay={0.2} stagger={0.04} /></h2>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6 }} className="mt-4 text-[15px] leading-relaxed text-slate-300">{D.introBody}</motion.p>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
                  <Magnetic><button className="btn-primary mt-8 px-5 py-3" onClick={() => setStep(1)}><Play size={16} />{D.start}</button></Magnetic>
                </motion.div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-300">{D.pick}</p>
                <button className="btn-ghost" onClick={runAll} disabled={bulk === "running" || !scenarios.length}>
                  {bulk === "running" ? <Loader2 size={15} className="animate-spin" /> : bulk === "done" ? <CheckCircle2 size={15} className="text-safe-400" /> : <Play size={15} />}
                  {bulk === "done" ? D.runAllDone : D.runAll}
                </button>
              </div>
              <Link to="/call-guard?simulate=1" className="panel border-glow group mb-3 flex flex-col gap-3 border-cyan-400/30 p-4 transition-colors hover:border-cyan-400/60 sm:flex-row sm:items-center">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300"><PhoneCall size={20} /></span>
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-white">{t.call.title}<TestBadge /></span>
                  <span className="mt-0.5 block text-xs text-slate-400">{t.call.simNote}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-300">{t.call.simulate}<ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
              </Link>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {scenarios.map((s, i) => {
                  const br = bulkResults[s.id];
                  return (
                    <motion.div key={s.id} initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <SpotlightCard onClick={() => analyze(s)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && analyze(s)}
                      className="panel group h-full cursor-pointer p-4 text-left transition-colors hover:border-cyan-400/40">
                      <div className="relative">
                      <div className="mb-2 flex items-center gap-2">
                        <TestBadge /><span className="text-[11px] text-slate-500">{t.types[s.input_type]}</span>
                        <span className="ml-auto text-[11px] text-slate-500">{D.expected}: <span style={{ color: RISK_COLOR[s.expected_level] }}>{t.levels[s.expected_level]}</span></span>
                      </div>
                      <p className="font-semibold text-white">{s.title}</p>
                      <p className="mt-1.5 line-clamp-3 font-mono text-xs leading-relaxed text-slate-400">{s.content}</p>
                      <div className="mt-3 flex items-center justify-between">
                        {br ? <RiskBadge level={br.risk_level} score={br.risk_score} /> : <span />}
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 opacity-80 group-hover:opacity-100">{t.common.analyze}<ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" /></span>
                      </div>
                      </div>
                    </SpotlightCard>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}

          {step === 2 && chosen && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="panel panel-pad">
                <div className="mb-2 flex items-center gap-2"><TestBadge /><span className="text-sm font-semibold text-white">{chosen.title}</span></div>
                <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-300">{chosen.content}</p>
              </div>
              <ScanSequence done={done} hasUrl={chosen.input_type === "url" || /\.[a-z]{2,}\//i.test(chosen.content)} />
            </section>
          )}

          {step === 3 && result && <ReportView r={result} />}

          {step === 4 && (
            <section className="panel panel-pad">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-white">{t.dashboard.title}</h2>
                <Link to="/dashboard" className="btn-ghost"><LayoutDashboard size={15} />{D.openDashboard}</Link>
              </div>
              {stats ? (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[[t.dashboard.total, stats.total_scans, "#22d3ee"], [t.dashboard.threats, stats.threats_detected, "#fb923c"],
                      [t.dashboard.critical, stats.critical_threats, "#fb7185"], [t.dashboard.avg, stats.average_risk, "#3b82f6"]].map(([l, v, c]) => (
                      <div key={String(l)} className="rounded-xl border border-line bg-ink-900/60 p-4">
                        <p className="label">{l}</p>
                        <span className="mt-2 block font-display text-3xl font-semibold" style={{ color: String(c) }}><CountUp value={v as number} /></span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-ink-700">
                    {(["low", "moderate", "high", "critical"] as const).map((l) => (
                      <motion.div key={l} initial={{ width: 0 }} animate={{ width: `${stats.total_scans ? (stats.by_level[l] / stats.total_scans) * 100 : 0}%` }}
                        transition={{ duration: 0.8 }} style={{ background: RISK_COLOR[l] }} title={`${t.levels[l]}: ${stats.by_level[l]}`} />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                    {(["low", "moderate", "high", "critical"] as const).map((l) => <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: RISK_COLOR[l] }} />{t.levels[l]} {stats.by_level[l]}</span>)}
                  </div>
                </>
              ) : <Loader2 className="animate-spin text-slate-500" />}
            </section>
          )}

          {step === 5 && (
            <section className="panel relative overflow-hidden p-8 sm:p-10">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-safe-400/10 blur-3xl" />
              <div className="relative">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12 }} className="relative inline-block">
                  <span className="absolute inset-0 rounded-full bg-safe-400/30 animate-pulse-ring" />
                  <ShieldCheck size={40} className="relative text-safe-400" />
                </motion.div>
                <h2 className="mt-4 font-display text-2xl font-semibold text-white sm:text-3xl">{D.protectTitle}</h2>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-300">{D.protectBody}</p>
                {recs.length > 0 && (
                  <ol className="mt-6 grid gap-2 sm:grid-cols-2">
                    {recs.map((r, i) => <motion.li key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }} whileHover={{ y: -3, borderColor: "rgba(52,211,153,.4)" }} className="flex gap-3 rounded-xl border border-line bg-ink-900/60 p-3 text-sm text-slate-200"><span className="font-mono text-cyan-300">{i + 1}</span>{r}</motion.li>)}
                  </ol>
                )}
                <div className="mt-8 flex flex-wrap gap-2">
                  <button className="btn-ghost" onClick={() => { setStep(0); setResult(null); setChosen(null); }}><RotateCcw size={15} />{D.restart}</button>
                  <Link to="/analyze" className="btn-primary">{t.landing.cta}<ArrowRight size={15} /></Link>
                </div>
              </div>
            </section>
          )}
        </motion.div>
      </AnimatePresence>
      </div>

      {step > 0 && step !== 2 && (
        <div className="mt-6 flex justify-between">
          <button className="btn-ghost" onClick={() => setStep((s) => (s === 3 ? 1 : s - 1))}><ArrowLeft size={15} />{D.prev}</button>
          {step < 5 && <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{D.next}<ArrowRight size={15} /></button>}
        </div>
      )}
    </div>
  );
}
