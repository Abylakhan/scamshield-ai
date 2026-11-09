import { useMotionValue } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not part of TypeScript's DOM lib).
interface SpeechAlternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlternative }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null; onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => Recognizer;

const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
export const SpeechRecognitionCtor: RecognizerCtor | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
export const speechSupported = Boolean(SpeechRecognitionCtor);

/** Phones: the recogniser owns the microphone — a second capture stream makes Android/iOS recognition go silent. */
export const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export type MicError = "insecure" | "unsupported" | "denied" | "no-mic" | "network" | "busy" | "failed";
export type MicStatus = "idle" | "requesting" | "listening" | "error";

/** Extra facts about a recognised phrase, used to tell the two speakers apart. */
export interface PhraseMeta {
  gap: number | null; // seconds of silence before the phrase
  voice: number | null; // median pitch (Hz) — desktop only
  replace: boolean; // Android re-sent the previous phrase with more words: replace it instead of adding a line
}

/** Recognition language fallbacks: Kazakh models are not available on every browser/OS. */
const FALLBACK: Record<string, string> = { "kk-KZ": "ru-RU" };

/** Pitch of one audio frame by autocorrelation (70–400 Hz, human voice); null when unvoiced. */
function framePitch(buf: Float32Array, rate: number): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.015) return null;
  const minLag = Math.floor(rate / 400), maxLag = Math.min(n - 1, Math.floor(rate / 70));
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let sum = 0;
    for (let i = 0; i < n - lag; i += 2) sum += buf[i] * buf[i + lag];
    if (sum > best) { best = sum; bestLag = lag; }
  }
  return bestLag ? rate / bestLag : null;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const norm = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Live speech-to-text from the microphone.
 * - asks for microphone permission explicitly (clear errors instead of silent failure);
 * - restarts recognition automatically when the browser stops after silence;
 * - falls back from kk-KZ to ru-RU when the Kazakh model is unavailable;
 * - reports pause length and voice pitch per phrase (speaker separation);
 * - removes the duplicated / cumulative results some Android builds produce.
 * `level` is a motion value (0–1) so the meter animates without re-rendering the page.
 */
export function useSpeech(onFinal: (text: string, meta: PhraseMeta) => void) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [error, setError] = useState<MicError | null>(null);
  const [interim, setInterim] = useState("");
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const level = useMotionValue(0);
  const [hasMeter, setHasMeter] = useState(false);

  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const active = useRef(false);
  const rec = useRef<Recognizer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const restartTimer = useRef(0);
  // Per-phrase bookkeeping.
  const pitches = useRef<number[]>([]);
  const phraseStart = useRef<number | null>(null);
  const lastFinalAt = useRef<number | null>(null);
  const lastFinal = useRef<{ text: string; at: number } | null>(null);
  const emitted = useRef<Set<number>>(new Set());

  const teardownAudio = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audio.current?.close().catch(() => undefined);
    audio.current = null;
    level.set(0);
    setHasMeter(false);
  }, [level]);

  const stop = useCallback(() => {
    active.current = false;
    clearTimeout(restartTimer.current);
    try { rec.current?.abort(); } catch { /* not running */ }
    rec.current = null;
    teardownAudio();
    setInterim("");
    setStatus((s) => (s === "error" ? s : "idle"));
  }, [teardownAudio]);

  const fail = useCallback((e: MicError) => {
    active.current = false;
    setError(e);
    setStatus("error");
    try { rec.current?.abort(); } catch { /* ignore */ }
    teardownAudio();
  }, [teardownAudio]);

  const emit = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const now = performance.now();
    const prev = lastFinal.current;
    let replace = false;
    if (prev && now - prev.at < 8000) {
      const a = norm(prev.text), b = norm(text);
      if (a === b) return; // exact repeat
      // Cumulative re-send (an Android bug): "назовите" → "назовите код". Desktop never does this, and there a
      // short "да" followed by "да, назовите код" is two different people.
      if (isMobileDevice && b.startsWith(a)) replace = true;
      else if (isMobileDevice && a.startsWith(b)) return; // shorter echo of what we already have
    }
    const start = phraseStart.current ?? now;
    const gap = replace || lastFinalAt.current === null ? null : Math.max(0, (start - lastFinalAt.current) / 1000);
    const voice = median(pitches.current);
    pitches.current = [];
    phraseStart.current = null;
    lastFinalAt.current = now;
    lastFinal.current = { text, at: now };
    onFinalRef.current(text, { gap: gap === null ? null : Math.round(gap * 10) / 10, voice: voice && Math.round(voice), replace });
  }, []);

  const startRecognizer = useCallback((lang: string) => {
    if (!SpeechRecognitionCtor) return;
    const r = new SpeechRecognitionCtor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { emitted.current = new Set(); setActiveLang(lang); setStatus("listening"); };
    r.onresult = (e) => {
      let partial = "";
      // Walk every result (not only from resultIndex — wrong on some Android builds) and emit each final once.
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          if (!emitted.current.has(i)) { emitted.current.add(i); emit(text); }
        } else partial += text;
      }
      if (partial && phraseStart.current === null) phraseStart.current = performance.now();
      setInterim(partial);
    };
    r.onerror = (e) => {
      switch (e.error) {
        case "no-speech": case "aborted": return; // silence or our own stop — onend restarts
        case "not-allowed": case "service-not-allowed": return fail("denied");
        case "audio-capture": return fail("no-mic");
        case "network": return fail("network");
        case "language-not-supported":
          if (FALLBACK[lang]) { rec.current = null; startRecognizer(FALLBACK[lang]); return; }
          return fail("unsupported");
        default: return fail("failed");
      }
    };
    r.onend = () => {
      if (!active.current || rec.current !== r) return;
      setInterim("");
      // Browsers end continuous recognition after silence; resume shortly while the user keeps listening.
      restartTimer.current = window.setTimeout(() => {
        if (!active.current || rec.current !== r) return;
        try { r.start(); } catch { /* already running */ }
      }, 200);
    };
    rec.current = r;
    try { r.start(); } catch { fail("busy"); }
  }, [fail, emit]);

  const start = useCallback(async (lang: string) => {
    setError(null);
    if (!window.isSecureContext) return fail("insecure");
    if (!SpeechRecognitionCtor) return fail("unsupported");
    if (!navigator.mediaDevices?.getUserMedia) return fail("unsupported");
    setStatus("requesting");
    active.current = true;
    pitches.current = []; phraseStart.current = null; lastFinalAt.current = null; lastFinal.current = null;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = (err as DOMException)?.name;
      return fail(name === "NotAllowedError" || name === "SecurityError" ? "denied"
        : name === "NotFoundError" || name === "OverconstrainedError" ? "no-mic"
          : name === "NotReadableError" ? "busy" : "failed");
    }
    if (!active.current) { teardownAudio(); return; } // stopped while the permission prompt was open
    if (isMobileDevice) {
      // Permission granted — hand the microphone to the recogniser.
      stream.current.getTracks().forEach((t) => t.stop());
      stream.current = null;
    } else {
      // Desktop: audio level for the waveform + voice pitch for speaker separation.
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream.current).connect(analyser);
        audio.current = ctx;
        const buf = new Float32Array(analyser.fftSize);
        let last = 0;
        const tick = (t: number) => {
          if (t - last > 70) { // ~14 fps is plenty for the meter and the pitch track
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            level.set(Math.min(1, Math.sqrt(sum / buf.length) * 4));
            const p = framePitch(buf, ctx.sampleRate);
            if (p && pitches.current.length < 400) pitches.current.push(p);
            last = t;
          }
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        setHasMeter(true);
      } catch { /* meter is optional */ }
    }
    startRecognizer(lang);
  }, [fail, startRecognizer, teardownAudio, level]);

  useEffect(() => () => {
    active.current = false;
    clearTimeout(restartTimer.current);
    try { rec.current?.abort(); } catch { /* ignore */ }
    teardownAudio();
  }, [teardownAudio]);

  return { status, error, interim, level, hasMeter, activeLang, start, stop, clearError: () => { setError(null); setStatus("idle"); } };
}
