import { AnimatePresence, motion, type MotionValue, useTransform } from "framer-motion";
import { ArrowLeftRight, Bot, FlaskConical, Loader2, Lock, Mic, MicOff, PhoneOff, Plus, RotateCcw, Save, Sparkles, Square, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { openAiSettings } from "../components/AiSettings";
import { RiskGauge } from "../components/RiskGauge";
import { SeverityTag } from "../components/ScoreParts";
import { ErrorBox, PageHeader, TestBadge } from "../components/ui";
import { useFeedback } from "../components/Feedback";
import { api } from "../lib/api";
import { cx } from "../lib/format";
import { LANG_LABELS, useI18n } from "../lib/i18n";
import { EASE, LITE, Magnetic } from "../lib/motion";
import { speechSupported, useSpeech, type PhraseMeta } from "../lib/useSpeech";
import type { AnalysisResult, CallLineIn, CallStage, Indicator, Lang, Speaker, SpeakerSource } from "../lib/types";

const SPEECH_LANG: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" };
const STAGES: CallStage[] = ["contact", "pretext", "pressure", "extraction"];
const MAX_LINES = 120; // most recent lines sent for scoring
const BARS = 28;
const AI_DELAY = 1200; // ms of quiet before the AI re-checks who said what

interface Line {
  id: number; text: string; speaker: Speaker; source: SpeakerSource; confidence: number;
  voice: number | null; gap: number | null; newFlags: Indicator[];
}

/** Labels the engine must keep: set by the user, or by the AI pass. */
const fixed = (l: Line) => l.source === "manual" || l.source === "ai";
const toPayload = (ls: Line[], forAi = false): CallLineIn[] => ls.map((l) => ({
  text: l.text, voice: l.voice, gap: l.gap,
  // The AI pass re-reads its own earlier labels with more context; only the user's labels are binding for it.
  speaker: (forAi ? l.source === "manual" : fixed(l)) ? l.speaker : "auto",
}));

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

/**
 * Live waveform. With a real meter (desktop) bar heights follow the microphone level through direct style writes —
 * no React re-render per frame. Otherwise (phones, simulation) a CSS-only "voice" animation runs on the compositor.
 */
const Waveform = memo(function Waveform({ level, metered, active, tone }: { level: MotionValue<number>; metered: boolean; active: boolean; tone: "cyan" | "red" }) {
  const shape = useMemo(() => Array.from({ length: BARS }, (_, i) => 0.35 + 0.65 * Math.sin((i / (BARS - 1)) * Math.PI)), []);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!active || !metered) return;
    return level.on("change", (v) => {
      bars.current.forEach((b, i) => {
        if (b) b.style.transform = `scaleY(${Math.max(0.08, Math.min(1, shape[i] * v * 1.6 * (0.7 + ((i * 7) % 5) / 10)))})`;
      });
    });
  }, [active, metered, level, shape]);
  const color = tone === "red" ? "#fb7185" : "#22d3ee";
  const synthetic = active && !metered;
  return (
    <div className="flex h-12 items-center justify-center gap-[3px]" aria-hidden>
      {shape.map((k, i) => (
        <span key={i} ref={(el) => { bars.current[i] = el; }}
          className={cx("h-full w-[3px] rounded-full transition-colors duration-500", synthetic && "animate-wave")}
          style={{
            background: color, transform: active ? undefined : "scaleY(0.08)",
            ...(synthetic ? { "--lo": (k * 0.25).toFixed(2), "--hi": Math.min(1, k * (0.75 + ((i * 7) % 5) / 12)).toFixed(2), animationDuration: `${0.5 + (i % 4) * 0.12}s`, animationDelay: `${-(i % 5) * 0.1}s` } as React.CSSProperties : {}),
          }} />
      ))}
    </div>
  );
});

/** One transcript line. Memoised: a new phrase re-renders only the rows that actually changed. */
const LineRow = memo(function LineRow({ line, onSwap, labels }: {
  line: Line; onSwap: (id: number) => void;
  labels: { caller: string; you: string; swap: string; newFlag: string; badge: Record<SpeakerSource, string> };
}) {
  const mine = line.speaker === "you";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
      className={cx("flex flex-col", mine ? "items-end" : "items-start")}>
      <button type="button" onClick={() => onSwap(line.id)} title={labels.swap} aria-label={`${mine ? labels.you : labels.caller} — ${labels.swap}`}
        className={cx("group mb-1 inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors active:scale-95",
          mine ? "border-volt-400/30 bg-volt-400/10 text-volt-300 hover:border-volt-400/60" : "border-orange-400/30 bg-orange-400/10 text-orange-300 hover:border-orange-400/60")}>
        {mine ? labels.you : labels.caller}
        <span className={cx("rounded px-1 py-px text-[9px] font-medium normal-case tracking-normal",
          line.source === "ai" ? "bg-cyan-400/20 text-cyan-200" : line.source === "manual" ? "bg-white/10 text-slate-200" : "bg-white/5 text-slate-400")}>
          {line.source === "ai" && <Sparkles size={9} className="mr-0.5 inline -translate-y-px" />}{labels.badge[line.source]}
        </span>
        <ArrowLeftRight size={11} className="opacity-50 transition-opacity group-hover:opacity-100" />
      </button>
      <motion.div key={line.speaker} initial={{ opacity: 0.4, x: mine ? 18 : -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE }}
        className={cx("max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-[15px] leading-relaxed transition-colors duration-500 sm:text-sm",
          mine ? "rounded-tr-sm border-volt-400/30 bg-volt-400/10 text-slate-200"
            : line.newFlags.length ? "flag-pulse rounded-tl-sm border-hot-400/40 bg-hot-500/10 text-white" : "rounded-tl-sm border-line bg-ink-900 text-slate-200")}>
        {line.text}
      </motion.div>
      {line.newFlags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {line.newFlags.map((f, i) => (
            <motion.span key={f.id} initial={{ opacity: 0, scale: 0.6, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 320, damping: 18 }}
              className="chip border-hot-400/30 bg-ink-900 text-[11px] text-slate-200">
              <span className="font-mono text-[9px] uppercase text-hot-400">{labels.newFlag}</span>{f.name}
            </motion.span>
          ))}
        </div>
      )}
    </motion.div>
  );
});

export default function CallGuard() {
  const { t, lang } = useI18n();
  const C = t.call;
  const nav = useNavigate();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState<{ speaker: Speaker; text: string } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [manual, setManual] = useState("");
  const [manualSpeaker, setManualSpeaker] = useState<Speaker | "auto">("auto");
  const [error, setError] = useState<unknown>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [callLang, setCallLang] = useState<Lang>(lang);
  const [aiReady, setAiReady] = useState(false);
  const [relabeling, setRelabeling] = useState(false);

  const linesRef = useRef<Line[]>([]); // source of truth for async work; `lines` mirrors it for rendering
  const seq = useRef(0);
  const aiSeq = useRef(0);
  const aiTimer = useRef(0);
  const lineId = useRef(0);
  const alerted = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());
  const simRun = useRef(0); // incremented to cancel any running simulation
  const scrollRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((ls: Line[]) => { linesRef.current = ls; setLines(ls); }, []);

  // Is an AI provider available for speaker separation? (server provider, or the visitor's Gemini key)
  useEffect(() => {
    let live = true;
    const check = () => api.health().then((h) => { if (live) setAiReady(!!h.ai_provider?.enabled); }).catch(() => undefined);
    check();
    window.addEventListener("scamshield:gemini", check);
    return () => { live = false; window.removeEventListener("scamshield:gemini", check); };
  }, []);

  /** Score the call: the engine separates the speakers and scores only the caller's lines. Stale answers are ignored. */
  const rescore = useCallback(async (flagLineId?: number) => {
    const all = linesRef.current;
    if (!all.length) return;
    const win = all.slice(-MAX_LINES);
    const off = all.length - win.length;
    const mySeq = ++seq.current;
    setAnalyzing(true);
    try {
      const r = await api.analyzeCall(toPayload(win), lang);
      if (mySeq !== seq.current) return;
      setError(null);
      const sp = r.call?.speakers;
      const present = new Set(r.indicators.filter((i) => i.weight > 0).map((i) => i.id));
      knownIds.current.forEach((id) => { if (!present.has(id)) knownIds.current.delete(id); });
      const fresh = r.indicators.filter((i) => i.weight > 0 && !knownIds.current.has(i.id));
      fresh.forEach((i) => knownIds.current.add(i.id));
      let next = linesRef.current.map((l, i) => {
        const s = i >= off ? sp?.[i - off] : undefined;
        const relabel = s && !fixed(l) && (s.speaker !== l.speaker || s.source !== l.source);
        const stale = l.newFlags.some((f) => !present.has(f.id));
        if (!relabel && !stale) return l; // keep identity → memoised row does not re-render
        return { ...l, ...(relabel ? { speaker: s.speaker, source: s.source, confidence: s.confidence } : {}),
          newFlags: stale ? l.newFlags.filter((f) => present.has(f.id)) : l.newFlags };
      });
      if (fresh.length) {
        // Attach new red flags to the caller's line that triggered them.
        const target = next.find((l) => l.id === flagLineId && l.speaker === "caller")
          ?? [...next].reverse().find((l) => l.speaker === "caller");
        if (target) next = next.map((l) => (l.id === target.id ? { ...l, newFlags: [...l.newFlags, ...fresh] } : l));
      }
      commit(next);
      setResult(r);
      if (r.call?.alert && !alerted.current) {
        alerted.current = true;
        setAlertOpen(true);
        alarm();
      } else if (!r.call?.alert) {
        alerted.current = false; // e.g. the user re-labelled the line as their own
      }
    } catch (e) {
      if (mySeq === seq.current) setError(e);
    } finally {
      if (mySeq === seq.current) setAnalyzing(false);
    }
  }, [lang, commit]);

  /** AI pass: re-read the whole conversation and relabel who said what (never overrides the user's own labels). */
  const runAi = useCallback(async () => {
    const all = linesRef.current;
    if (all.length < 2) return;
    const win = all.slice(-MAX_LINES);
    const off = all.length - win.length;
    const ver = ++aiSeq.current;
    setRelabeling(true);
    try {
      const r = await api.callSpeakers(toPayload(win, true), lang);
      if (ver !== aiSeq.current || !r.ai_used) return;
      let changed = false;
      const next = linesRef.current.map((l, i) => {
        const s = i >= off && i < off + win.length ? r.speakers[i - off] : undefined;
        if (!s || l.source === "manual" || l.text !== win[i - off].text) return l;
        if (s.speaker !== l.speaker) changed = true;
        return s.speaker === l.speaker && l.source === "ai" ? l : { ...l, speaker: s.speaker, source: "ai" as const, confidence: s.confidence };
      });
      commit(next);
      if (changed) rescore();
    } catch { /* AI is optional — the engine's labels stay */ }
    finally { if (ver === aiSeq.current) setRelabeling(false); }
  }, [lang, commit, rescore]);

  const scheduleAi = useCallback(() => {
    if (!aiReady) return;
    clearTimeout(aiTimer.current);
    aiTimer.current = window.setTimeout(runAi, AI_DELAY);
  }, [aiReady, runAi]);

  /** Add a recognised / typed phrase. */
  const addLine = useCallback(async (text: string, meta: Partial<PhraseMeta> & { speaker?: Speaker | "auto" } = {}) => {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    const ls = linesRef.current;
    let id: number;
    if (meta.replace && ls.length) {
      id = ls[ls.length - 1].id;
      commit(ls.map((l) => (l.id === id ? { ...l, text: clean } : l)));
    } else {
      id = ++lineId.current;
      const manualLabel = meta.speaker === "caller" || meta.speaker === "you";
      const guess: Speaker = manualLabel ? (meta.speaker as Speaker) : "caller";
      commit([...ls, { id, text: clean, speaker: guess, source: manualLabel ? "manual" : "default", confidence: 0.5,
        voice: meta.voice ?? null, gap: meta.gap ?? null, newFlags: [] }]);
    }
    await rescore(id);
    scheduleAi();
  }, [commit, rescore, scheduleAi]);

  const swap = useCallback((id: number) => {
    commit(linesRef.current.map((l) => (l.id === id ? { ...l, speaker: l.speaker === "caller" ? "you" : "caller", source: "manual", confidence: 1 } : l)));
    rescore();
  }, [commit, rescore]);

  const speech = useSpeech((text, meta) => { addLine(text, meta); });
  const listening = speech.status === "listening" || speech.status === "requesting";
  const stopSpeech = speech.stop;

  const reset = useCallback(() => {
    simRun.current++;
    stopSpeech();
    seq.current++;
    aiSeq.current++;
    clearTimeout(aiTimer.current);
    commit([]);
    setResult(null); setError(null); setAlertOpen(false); setIsDemo(false); setSimulating(false);
    setTyping(null); setAnalyzing(false); setRelabeling(false);
    alerted.current = false;
    knownIds.current = new Set();
  }, [stopSpeech, commit]);

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
        // Speak the line out character by character, then analyse it (speaker detected automatically, like a real call).
        for (let n = 3; n <= line.text.length + 2 && alive(); n += 3) {
          setTyping({ speaker: line.speaker, text: line.text.slice(0, n) });
          await sleep(28);
        }
        if (!alive()) return;
        setTyping(null);
        await addLine(line.text, { gap: 0.9 });
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
    if (!linesRef.current.length) return;
    setSaving(true);
    try {
      const r = await api.analyzeCall(toPayload(linesRef.current.slice(-MAX_LINES)), lang, true, isDemo);
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

  // Cancel a running simulation / pending AI pass when leaving the page.
  useEffect(() => () => { simRun.current++; aiSeq.current++; clearTimeout(aiTimer.current); }, []);

  // Keep the newest line in view (inside the transcript box only — never scroll the page).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: LITE ? "auto" : "smooth" });
  }, [lines.length, typing, speech.interim]);

  const micScale = useTransform(speech.level, (v) => 1 + v * 0.12);
  const stages = useMemo(() => new Set(result?.call?.stages ?? []), [result]);
  const flags = (result?.indicators ?? []).filter((i) => i.weight > 0);
  const busy = listening || simulating;
  const fellBack = speech.activeLang && speech.activeLang !== SPEECH_LANG[callLang];
  const statusText = speech.status === "requesting" ? C.requesting : speech.status === "listening" ? C.listening : simulating ? C.simulating : C.idle;
  const danger = (result?.risk_score ?? 0) >= 50;
  const counts = useMemo(() => lines.reduce((a, l) => { a[l.speaker]++; return a; }, { caller: 0, you: 0 }), [lines]);
  const rowLabels = useMemo(() => ({ caller: C.sideCaller, you: C.sideYou, swap: C.swap, newFlag: C.newFlag, badge: C.badge }), [C]);

  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {/* Controls */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            className={cx("panel panel-pad relative overflow-hidden", busy && "border-glow")}>
            <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full transition-opacity duration-700"
              style={{ background: "radial-gradient(circle, rgba(34,211,238,.14), transparent 65%)", opacity: danger ? 0 : 1 }} />
            <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full transition-opacity duration-700"
              style={{ background: "radial-gradient(circle, rgba(251,113,133,.2), transparent 65%)", opacity: danger ? 1 : 0 }} />
            <div className="relative flex flex-col items-center gap-5 sm:flex-row">
              <div className="relative grid h-28 w-28 shrink-0 place-items-center">
                {busy && [0, 1, 2].map((i) => (
                  <span key={i} className={cx("absolute inset-0 rounded-full border animate-pulse-ring", danger ? "border-hot-400/50" : "border-cyan-400/40")}
                    style={{ animationDelay: `${i * 0.6}s` }} />
                ))}
                <motion.div style={{ scale: micScale }}>
                  <motion.button whileHover={LITE ? undefined : { scale: speechSupported ? 1.06 : 1 }} whileTap={{ scale: 0.92 }}
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
                </motion.div>
              </div>

              <div className="relative w-full min-w-0 flex-1 text-center sm:text-left">
                <AnimatePresence mode="popLayout">
                  <motion.p key={statusText} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="font-display text-lg font-semibold text-white">{statusText}</motion.p>
                </AnimatePresence>
                <Waveform level={speech.level} metered={speech.hasMeter} active={listening || !!typing} tone={danger ? "red" : "cyan"} />
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

                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  {speechSupported && (
                    <>
                      <label className="sr-only" htmlFor="call-lang">{C.callLang}</label>
                      <select id="call-lang" value={callLang} onChange={(e) => setCallLang(e.target.value as Lang)} disabled={busy} title={C.callLang}
                        className="min-h-[44px] rounded-xl border border-line bg-ink-900 px-2.5 py-2 text-sm text-slate-200 focus:border-cyan-400/60 focus:outline-none disabled:opacity-50">
                        {(["kk", "ru", "en"] as Lang[]).map((l) => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
                      </select>
                      <button className={cx(listening ? "btn-danger" : "btn-primary", "min-h-[44px]")} onClick={toggleMic} disabled={simulating}>
                        {listening ? <><Square size={15} />{C.stop}</> : <><Mic size={15} />{C.start}</>}
                      </button>
                    </>
                  )}
                  <Magnetic strength={0.12} className="col-span-2 sm:col-span-1">
                    <button className="btn-ghost min-h-[44px] w-full" onClick={simulate} disabled={listening || simulating}><FlaskConical size={15} />{C.simulate}</button>
                  </Magnetic>
                  {(lines.length > 0 || result || simulating) && <button className="btn-ghost col-span-2 min-h-[44px] sm:col-span-1" onClick={reset}><RotateCcw size={15} />{C.reset}</button>}
                </div>
                {isDemo && <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 sm:justify-start"><TestBadge />{C.simNote}</p>}
              </div>
            </div>
          </motion.section>

          {error ? <ErrorBox error={error} onRetry={() => setError(null)} /> : null}

          {/* Transcript */}
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5, ease: EASE }} className="panel panel-pad">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="label">{C.transcript}</h2>
              <div className="flex items-center gap-2 text-[11px]">
                {lines.length > 0 && (
                  <span className="font-mono text-slate-400">
                    <span className="text-orange-300">{C.sideCaller} {counts.caller}</span> · <span className="text-volt-300">{C.sideYou} {counts.you}</span>
                  </span>
                )}
                <AnimatePresence>
                  {(analyzing || relabeling) && (
                    <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-cyan-300">
                      <Loader2 size={12} className="animate-spin" />{relabeling ? C.relabeling : t.analyzer.scanning}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Speaker separation status */}
            <div className={cx("mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-xs",
              aiReady ? "border-cyan-400/25 bg-cyan-400/[0.06] text-cyan-100" : "border-line bg-ink-900/60 text-slate-400")}>
              <span className="flex min-w-0 flex-1 items-start gap-1.5">
                {aiReady ? <Sparkles size={13} className="mt-0.5 shrink-0 text-cyan-300" /> : <Bot size={13} className="mt-0.5 shrink-0" />}
                <span>{aiReady ? C.aiOn : C.aiOff}</span>
              </span>
              {!aiReady && <button type="button" className="font-semibold text-cyan-300 underline-offset-2 hover:underline" onClick={openAiSettings}>{C.connectAi}</button>}
              <span className="basis-full text-[11px] text-slate-500">{C.onlyCaller} {lines.length > 0 && C.speakerTap}</span>
            </div>

            <div ref={scrollRef} className="max-h-[52vh] min-h-[140px] space-y-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[440px]" aria-live="polite">
              {lines.length === 0 && !typing && !speech.interim && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center text-sm text-slate-500">{C.emptyTranscript}</motion.p>
              )}
              {lines.map((l) => <LineRow key={l.id} line={l} onSwap={swap} labels={rowLabels} />)}
              {(typing || speech.interim) && (
                <div className={cx("flex flex-col", typing?.speaker === "you" ? "items-end" : "items-start")}>
                  <span className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{typing ? (typing.speaker === "you" ? C.sideYou : C.sideCaller) : "…"}</span>
                  <div className="max-w-[88%] rounded-2xl border border-dashed border-line bg-ink-900/60 px-3.5 py-2.5 text-sm italic text-slate-400">
                    {typing?.text ?? speech.interim}
                    <span className="caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-cyan-400" />
                  </div>
                </div>
              )}
            </div>

            <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); addLine(manual, { speaker: manualSpeaker }); setManual(""); }}>
              <div className="flex items-center gap-1 rounded-xl border border-line bg-ink-950/60 p-1 text-xs" role="radiogroup" aria-label={C.manualLabel}>
                {(["auto", "caller", "you"] as const).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={manualSpeaker === s} onClick={() => setManualSpeaker(s)}
                    className={cx("relative min-h-[36px] flex-1 rounded-lg px-2 font-semibold transition-colors", manualSpeaker === s ? "text-ink-950" : "text-slate-400 hover:text-slate-200")}>
                    {manualSpeaker === s && <motion.span layoutId="speaker-pick" className="absolute inset-0 rounded-lg bg-cyan-400" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                    <span className="relative">{s === "auto" ? C.speakerAuto : s === "caller" ? C.sideCaller : C.sideYou}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label htmlFor="manual-line" className="sr-only">{C.manualLabel}</label>
                <input id="manual-line" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={C.manualPlaceholder} maxLength={500} disabled={simulating}
                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-ink-950/70 px-3.5 py-2.5 text-base text-white transition-colors duration-300 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none sm:text-sm" />
                <button className="btn-ghost min-h-[44px]" type="submit" disabled={!manual.trim() || simulating}><Plus size={15} /><span className="hidden sm:inline">{C.add}</span></button>
              </div>
            </form>
          </motion.section>
        </div>

        {/* Live risk */}
        <motion.aside initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: EASE }} className="space-y-4">
          <section className={cx("panel panel-pad relative flex flex-col items-center", result?.call?.alert && "alert-border")}>
            <h2 className="label mb-2 self-start">{C.risk}</h2>
            <RiskGauge score={result?.risk_score ?? 0} level={result?.risk_level ?? "low"} size={200} />
            <AnimatePresence mode="popLayout">
              {result && (
                <motion.p key={result.threat_type} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-2 text-center text-sm text-slate-300">{t.threatTypes[result.threat_type] ?? result.threat_type}</motion.p>
              )}
            </AnimatePresence>
          </section>

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
                    <motion.li key={f.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
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
                  className="btn-primary mt-4 min-h-[44px] w-full" onClick={save} disabled={saving || listening}>
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
          <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/85 p-4" role="alertdialog" aria-modal="true" aria-labelledby="hangup-title"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="alert-frame pointer-events-none absolute inset-0 border-[6px] border-hot-500" />
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-hot-400/50 bg-ink-900 p-6 text-center shadow-[0_0_80px_rgba(244,63,94,.45)] sm:p-7">
              <div className="phone-shake mx-auto grid h-20 w-20 place-items-center rounded-full bg-hot-500 text-white shadow-[0_0_40px_#f43f5e]">
                <PhoneOff size={38} />
              </div>
              <h2 id="hangup-title" className="mt-5 font-display text-3xl font-bold tracking-tight text-white">{C.alertTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{C.alertBody}</p>
              {result.call.reason && (
                <p className="mt-3 rounded-xl border border-hot-400/30 bg-hot-500/10 px-3 py-2 text-sm text-white">
                  <span className="font-semibold">{result.call.reason.name}</span>
                  {result.call.reason.evidence && <span className="mt-0.5 block font-mono text-xs text-hot-400">“{result.call.reason.evidence}”</span>}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400">{C.alertCall}</p>
              <button className="btn-primary mt-6 min-h-[48px] w-full bg-hot-400 py-3 text-base hover:bg-hot-500" autoFocus
                onClick={() => { setAlertOpen(false); speech.stop(); }}>{C.alertDone}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
