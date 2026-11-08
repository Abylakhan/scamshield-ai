import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Loader2, Lock, Mic, MicOff, PhoneOff, Plus, RotateCcw, Save, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RiskGauge } from "../components/RiskGauge";
import { SeverityTag } from "../components/ScoreParts";
import { ErrorBox, PageHeader, TestBadge } from "../components/ui";
import { useFeedback } from "../components/Feedback";
import { api } from "../lib/api";
import { cx } from "../lib/format";
import { LANG_LABELS, useI18n } from "../lib/i18n";
import { EASE, Magnetic } from "../lib/motion";
import { speechSupported, useSpeech } from "../lib/useSpeech";
import type { AnalysisResult, CallStage, Indicator, Lang } from "../lib/types";

const SPEECH_LANG: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" };
const STAGES: CallStage[] = ["contact", "pretext", "pressure", "extraction"];
const MAX_CHARS = 5000;
const BARS = 28;

interface Line { id: number; speaker: "caller" | "you"; text: string; newFlags: Indicator[] }

/** Short two-tone alarm and vibration; silently skipped where unsupported. */
function alarm() {
  try {
    // Browsers only allow vibration after the user has interacted with the page.
    if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) {
      navigator.vibrate?.([300, 120, 300, 120, 600]);
    }
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio not available */ }
}

/** Live waveform: real microphone level while listening, a gentle "voice" pattern while the simulation speaks. */
function Waveform({ level, active, tone }: { level: number; active: boolean; tone: "cyan" | "red" }) {
  const shape = useMemo(() => Array.from({ length: BARS }, (_, i) => 0.35 + 0.65 * Math.sin((i / (BARS - 1)) * Math.PI)), []);
  const color = tone === "red" ? "#fb7185" : "#22d3ee";
  return (
    <div className="flex h-12 items-center justify-center gap-[3px]" aria-hidden>
      {shape.map((k, i) => {
        const h = active ? Math.max(0.08, Math.min(1, k * (level > 0 ? level * 1.6 : 0.5) * (0.7 + ((i * 7) % 5) / 10))) : 0.08;
        return (
          <motion.span key={i} className="w-[3px] rounded-full" style={{ background: color, boxShadow: active ? `0 0 8px ${color}88` : "none" }}
            animate={active && level === 0 ? { height: [`${h * 30}%`, `${h * 100}%`, `${h * 45}%`] } : { height: `${h * 100}%` }}
            transition={active && level === 0 ? { duration: 0.55 + (i % 4) * 0.12, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.08 }} />
        );
      })}
    </div>
  );
}

export default function CallGuard() {
  const { t, lang } = useI18n();
  const C = t.call;
  const nav = useNavigate();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState<{ speaker: "caller" | "you"; text: string } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [callLang, setCallLang] = useState<Lang>(lang);

  const seq = useRef(0);
  const lineId = useRef(0);
  const alerted = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());
  const simRun = useRef(0); // incremented to cancel any running simulation
  const transcriptRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Append a line and score the whole transcript so far. Stale responses are ignored. */
  const addLine = useCallback(async (text: string, speaker: "caller" | "you" = "caller") => {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    const id = ++lineId.current;
    setLines((ls) => [...ls, { id, speaker, text: clean, newFlags: [] }]);
    transcriptRef.current = `${transcriptRef.current}\n${clean}`.trim().slice(-MAX_CHARS);
    const mySeq = ++seq.current;
    setAnalyzing(true);
    try {
      const r = await api.analyzeCall(transcriptRef.current, lang);
      if (mySeq !== seq.current) return;
      setError(null);
      const fresh = r.indicators.filter((i) => i.weight > 0 && !knownIds.current.has(i.id));
      fresh.forEach((i) => knownIds.current.add(i.id));
      if (fresh.length) setLines((ls) => ls.map((l) => (l.id === id ? { ...l, newFlags: fresh } : l)));
      setResult(r);
      if (r.call?.alert && !alerted.current) {
        alerted.current = true;
        setAlertOpen(true);
        alarm();
      }
    } catch (e) {
      if (mySeq === seq.current) setError(e);
    } finally {
      if (mySeq === seq.current) setAnalyzing(false);
    }
  }, [lang]);

  const speech = useSpeech((text) => { addLine(text); });
  const listening = speech.status === "listening" || speech.status === "requesting";
  const stopSpeech = speech.stop;

  const reset = useCallback(() => {
    simRun.current++;
    stopSpeech();
    seq.current++;
    setLines([]); setResult(null); setError(null); setAlertOpen(false); setIsDemo(false); setSimulating(false);
    setTyping(null); setAnalyzing(false);
    alerted.current = false;
    knownIds.current = new Set();
    transcriptRef.current = "";
  }, [stopSpeech]);

  const simulate = useCallback(async () => {
    reset();
    const run = simRun.current;
    const alive = () => simRun.current === run;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setIsDemo(true);
    setSimulating(true);
    try {
      const script = await api.callScript(lang);
      for (const line of script.lines) {
        await sleep(650);
        // Speak the line out character by character, then analyse it.
        for (let n = 2; n <= line.text.length + 1 && alive(); n += 2) {
          setTyping({ speaker: line.speaker, text: line.text.slice(0, n) });
          await sleep(22);
        }
        if (!alive()) return;
        setTyping(null);
        await addLine(line.text, line.speaker);
        await sleep(700);
        if (!alive()) return;
      }
    } catch (e) {
      if (alive()) setError(e);
    } finally {
      if (alive()) { setSimulating(false); setTyping(null); }
    }
  }, [lang, addLine, reset]);

  const toggleMic = () => {
    if (listening) speech.stop();
    else { setIsDemo(false); speech.start(SPEECH_LANG[callLang]); }
  };

  const save = async () => {
    if (!transcriptRef.current) return;
    setSaving(true);
    try {
      const r = await api.analyzeCall(transcriptRef.current, lang, true, isDemo);
      if (r.id) { toast(t.ui.saved); nav(`/history/${r.id}`); }
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  // Deep link from Demo Mode / landing: /call-guard?simulate=1
  useEffect(() => {
    if (params.get("simulate") === "1") {
      setParams({}, { replace: true });
      simulate();
    }
  }, [params, setParams, simulate]);

  // Cancel a running simulation when leaving the page.
  useEffect(() => () => { simRun.current++; }, []);

  // Keep the newest line in view (inside the transcript box only — never scroll the page).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length, typing, speech.interim]);

  const stages = useMemo(() => new Set(result?.call?.stages ?? []), [result]);
  const flags = (result?.indicators ?? []).filter((i) => i.weight > 0);
  const busy = listening || simulating;
  const fellBack = speech.activeLang && speech.activeLang !== SPEECH_LANG[callLang];
  const statusText = speech.status === "requesting" ? C.requesting : speech.status === "listening" ? C.listening : simulating ? C.simulating : C.idle;
  const danger = (result?.risk_score ?? 0) >= 50;

  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {/* Controls */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            className={cx("panel panel-pad relative overflow-hidden", busy && "border-glow")}>
            <motion.div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full blur-3xl"
              animate={{ background: danger ? "rgba(251,113,133,.16)" : "rgba(34,211,238,.10)", scale: busy ? [1, 1.2, 1] : 1 }}
              transition={{ scale: { duration: 2.4, repeat: Infinity }, background: { duration: 0.8 } }} />
            <div className="relative flex flex-col items-center gap-5 sm:flex-row">
              <div className="relative grid h-28 w-28 shrink-0 place-items-center">
                {busy && [0, 1, 2].map((i) => (
                  <motion.span key={i} className={cx("absolute inset-0 rounded-full border", danger ? "border-hot-400/50" : "border-cyan-400/40")}
                    animate={{ scale: [1, 1.5 + speech.level], opacity: [0.6, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }} />
                ))}
                <motion.button whileHover={{ scale: speechSupported ? 1.06 : 1 }} whileTap={{ scale: 0.92 }}
                  animate={{ scale: listening ? 1 + speech.level * 0.12 : 1 }} transition={{ duration: 0.08 }}
                  onClick={toggleMic} disabled={!speechSupported || simulating}
                  aria-label={listening ? C.stop : C.start} aria-pressed={listening}
                  className={cx("relative grid h-24 w-24 place-items-center rounded-full border transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40",
                    listening ? "border-hot-400/60 bg-hot-500/20 text-hot-400" : "border-cyan-400/50 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20")}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={speech.status === "requesting" ? "req" : listening ? "stop" : speechSupported ? "mic" : "off"}
                      initial={{ scale: 0.4, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0, rotate: 40 }} transition={{ duration: 0.2 }}>
                      {speech.status === "requesting" ? <Loader2 size={30} className="animate-spin" /> : listening ? <Square size={28} /> : speechSupported ? <Mic size={34} /> : <MicOff size={30} />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>

              <div className="relative w-full flex-1 text-center sm:text-left">
                <AnimatePresence mode="popLayout">
                  <motion.p key={statusText} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="font-display text-lg font-semibold text-white">{statusText}</motion.p>
                </AnimatePresence>
                <Waveform level={speech.level} active={listening || !!typing} tone={danger ? "red" : "cyan"} />
                <p className="flex items-start justify-center gap-1.5 text-xs text-slate-400 sm:justify-start"><Lock size={12} className="mt-0.5 shrink-0" />{C.privacy}</p>
                {speechSupported && !busy && <p className="mt-1 flex items-start justify-center gap-1.5 text-xs text-slate-500 sm:justify-start"><Volume2 size={12} className="mt-0.5 shrink-0" />{C.speakerHint}</p>}
                {fellBack && <p className="mt-2 text-xs text-warn-400">{C.fallback}</p>}
                <AnimatePresence>
                  {(speech.error || !speechSupported) && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert"
                      className={cx("mt-2 text-xs", speech.error === "denied" || speech.error === "no-mic" ? "text-hot-400" : "text-warn-400")}>
                      {C.micErrors[speech.error ?? "unsupported"]}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {speechSupported && (
                    <>
                      <label className="sr-only" htmlFor="call-lang">{C.callLang}</label>
                      <select id="call-lang" value={callLang} onChange={(e) => setCallLang(e.target.value as Lang)} disabled={busy} title={C.callLang}
                        className="rounded-xl border border-line bg-ink-900 px-2.5 py-2 text-sm text-slate-200 focus:border-cyan-400/60 focus:outline-none disabled:opacity-50">
                        {(["kk", "ru", "en"] as Lang[]).map((l) => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
                      </select>
                      <button className={listening ? "btn-danger" : "btn-primary"} onClick={toggleMic} disabled={simulating}>
                        {listening ? <><Square size={15} />{C.stop}</> : <><Mic size={15} />{C.start}</>}
                      </button>
                    </>
                  )}
                  <Magnetic strength={0.12}>
                    <button className="btn-ghost" onClick={simulate} disabled={listening || simulating}><FlaskConical size={15} />{C.simulate}</button>
                  </Magnetic>
                  {(lines.length > 0 || result || simulating) && <button className="btn-ghost" onClick={reset}><RotateCcw size={15} />{C.reset}</button>}
                </div>
                {isDemo && <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 sm:justify-start"><TestBadge />{C.simNote}</p>}
              </div>
            </div>
          </motion.section>

          {error ? <ErrorBox error={error} onRetry={() => setError(null)} /> : null}

          {/* Transcript */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5, ease: EASE }} className="panel panel-pad">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label">{C.transcript}</h2>
              <AnimatePresence>
                {analyzing && (
                  <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-[11px] text-cyan-300">
                    <Loader2 size={12} className="animate-spin" />{t.analyzer.scanning}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div ref={scrollRef} className="max-h-[420px] min-h-[120px] space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
              {lines.length === 0 && !typing && !speech.interim && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center text-sm text-slate-500">{C.emptyTranscript}</motion.p>
              )}
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.div key={l.id} layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}
                    className={cx("flex flex-col", l.speaker === "you" ? "items-end" : "items-start")}>
                    <span className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">{l.speaker === "you" ? C.you : C.caller}</span>
                    <motion.div
                      animate={l.newFlags.length ? { boxShadow: ["0 0 0 0 rgba(251,113,133,0)", "0 0 0 6px rgba(251,113,133,.25)", "0 0 0 0 rgba(251,113,133,0)"] } : {}}
                      transition={{ duration: 0.9 }}
                      className={cx("max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed transition-colors duration-500",
                        l.speaker === "you" ? "rounded-tr-sm border-volt-400/30 bg-volt-400/10 text-slate-200"
                          : l.newFlags.length ? "rounded-tl-sm border-hot-400/40 bg-hot-500/10 text-white" : "rounded-tl-sm border-line bg-ink-900 text-slate-200")}>
                      {l.text}
                    </motion.div>
                    {l.newFlags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {l.newFlags.map((f, i) => (
                          <motion.span key={f.id} initial={{ opacity: 0, scale: 0.6, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 320, damping: 18 }}
                            className="chip border-hot-400/30 bg-ink-900 text-[11px] text-slate-200">
                            <span className="font-mono text-[9px] uppercase text-hot-400">{C.newFlag}</span>{f.name}
                          </motion.span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {(typing || speech.interim) && (
                <div className={cx("flex flex-col", typing?.speaker === "you" ? "items-end" : "items-start")}>
                  <span className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">{typing?.speaker === "you" ? C.you : C.caller}</span>
                  <div className="max-w-[85%] rounded-2xl border border-dashed border-line bg-ink-900/60 px-3.5 py-2.5 text-sm italic text-slate-400">
                    {typing?.text ?? speech.interim}
                    <motion.span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-cyan-400" animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} />
                  </div>
                </div>
              )}
            </div>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); addLine(manual); setManual(""); }}>
              <label htmlFor="manual-line" className="sr-only">{C.manualLabel}</label>
              <input id="manual-line" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={C.manualPlaceholder} maxLength={500} disabled={simulating}
                className="min-w-0 flex-1 rounded-xl border border-line bg-ink-950/70 px-3.5 py-2.5 text-sm text-white transition-colors duration-300 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none" />
              <button className="btn-ghost" type="submit" disabled={!manual.trim() || simulating}><Plus size={15} />{C.add}</button>
            </form>
          </motion.section>
        </div>

        {/* Live risk */}
        <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: EASE }} className="space-y-4">
          <motion.section animate={result?.call?.alert ? { borderColor: ["rgba(251,113,133,.2)", "rgba(251,113,133,.7)", "rgba(251,113,133,.2)"] } : {}}
            transition={{ duration: 1.4, repeat: Infinity }} className="panel panel-pad relative flex flex-col items-center">
            <h2 className="label mb-2 self-start">{C.risk}</h2>
            <RiskGauge score={result?.risk_score ?? 0} level={result?.risk_level ?? "low"} size={200} />
            <AnimatePresence mode="popLayout">
              {result && (
                <motion.p key={result.threat_type} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-2 text-center text-sm text-slate-300">{t.threatTypes[result.threat_type] ?? result.threat_type}</motion.p>
              )}
            </AnimatePresence>
          </motion.section>

          <section className="panel panel-pad">
            <h2 className="label mb-3">{C.stagesTitle}</h2>
            <ol className="relative space-y-3">
              {/* connector that fills as the scam script progresses */}
              <span className="absolute bottom-3.5 left-[13px] top-3.5 w-[2px] rounded-full bg-ink-700" aria-hidden />
              <motion.span className="absolute bottom-3.5 left-[13px] top-3.5 w-[2px] origin-top rounded-full bg-gradient-to-b from-orange-400 to-hot-400" aria-hidden
                initial={{ scaleY: 0 }} animate={{ scaleY: Math.max(0, ...STAGES.map((s, i) => (stages.has(s) ? i : 0))) / (STAGES.length - 1) }}
                transition={{ duration: 0.6, ease: EASE }} />
              {STAGES.map((st, i) => {
                const on = stages.has(st);
                return (
                  <li key={st} className="relative flex items-center gap-3">
                    <motion.span animate={{ backgroundColor: on ? (st === "extraction" ? "#fb7185" : "#fb923c") : "#16213f", scale: on ? [1, 1.3, 1] : 1 }}
                      transition={{ duration: 0.5 }} className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs">
                      {on && st === "extraction" && <span className="absolute inset-0 rounded-full bg-hot-400 animate-pulse-ring" />}
                      <span className={cx("relative", on ? "text-ink-950" : "text-slate-500")}>{i + 1}</span>
                    </motion.span>
                    <motion.span animate={{ x: on ? 2 : 0 }} className={cx("text-sm transition-colors duration-500", on ? "font-semibold text-white" : "text-slate-500")}>{C.stages[st]}</motion.span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel panel-pad">
            <h2 className="label mb-3">{C.flags} · {flags.length}</h2>
            {flags.length === 0 ? <p className="text-sm text-slate-500">{C.noFlags}</p> : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {flags.map((f) => (
                    <motion.li key={f.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                      <SeverityTag severity={f.severity} /><span className="min-w-0 flex-1">{f.name}</span>
                      <span className="font-mono text-xs text-orange-300">+{f.contribution}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
            <AnimatePresence>
              {lines.length > 0 && !simulating && (
                <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="btn-primary mt-4 w-full" onClick={save} disabled={saving || listening}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{C.save}
                </motion.button>
              )}
            </AnimatePresence>
          </section>
        </motion.aside>
      </div>

      {/* Hang-up alert */}
      <AnimatePresence>
        {alertOpen && result?.call?.alert && (
          <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-hot-500/20 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="hangup-title"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="pointer-events-none absolute inset-0 border-[6px] border-hot-500" animate={{ opacity: [0.9, 0.2, 0.9] }} transition={{ duration: 1, repeat: Infinity }} />
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="relative w-full max-w-md rounded-3xl border border-hot-400/50 bg-ink-900 p-7 text-center shadow-[0_0_80px_rgba(244,63,94,.45)]">
              <motion.div animate={{ rotate: [0, -12, 12, -8, 8, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.8 }}
                className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-hot-500 text-white shadow-[0_0_40px_#f43f5e]">
                <PhoneOff size={38} />
              </motion.div>
              <h2 id="hangup-title" className="mt-5 font-display text-3xl font-bold tracking-tight text-white">{C.alertTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{C.alertBody}</p>
              {result.call.reason && (
                <p className="mt-3 rounded-xl border border-hot-400/30 bg-hot-500/10 px-3 py-2 text-sm text-white">
                  <span className="font-semibold">{result.call.reason.name}</span>
                  {result.call.reason.evidence && <span className="mt-0.5 block font-mono text-xs text-hot-400">“{result.call.reason.evidence}”</span>}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400">{C.alertCall}</p>
              <button className="btn-primary mt-6 w-full bg-hot-400 py-3 text-base hover:bg-hot-500" autoFocus
                onClick={() => { setAlertOpen(false); speech.stop(); }}>{C.alertDone}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
