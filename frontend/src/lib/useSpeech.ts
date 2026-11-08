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

export type MicError = "insecure" | "unsupported" | "denied" | "no-mic" | "network" | "busy" | "failed";
export type MicStatus = "idle" | "requesting" | "listening" | "error";

/** Recognition language fallbacks: Kazakh models are not available on every browser/OS. */
const FALLBACK: Record<string, string> = { "kk-KZ": "ru-RU" };

/**
 * Live speech-to-text from the microphone with an audio level meter.
 * - asks for microphone permission explicitly (clear errors instead of silent failure);
 * - restarts recognition automatically when the browser stops after silence;
 * - falls back from kk-KZ to ru-RU when the Kazakh model is unavailable.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [error, setError] = useState<MicError | null>(null);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [activeLang, setActiveLang] = useState<string | null>(null);

  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const active = useRef(false);
  const rec = useRef<Recognizer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const restartTimer = useRef(0);

  const teardownAudio = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audio.current?.close().catch(() => undefined);
    audio.current = null;
    setLevel(0);
  }, []);

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

  const startRecognizer = useCallback((lang: string) => {
    if (!SpeechRecognitionCtor) return;
    const r = new SpeechRecognitionCtor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { setActiveLang(lang); setStatus("listening"); };
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) { if (text.trim()) onFinalRef.current(text.trim()); }
        else partial += text;
      }
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
      // Browsers end continuous recognition after silence; resume shortly while the user keeps listening.
      restartTimer.current = window.setTimeout(() => {
        if (!active.current || rec.current !== r) return;
        try { r.start(); } catch { /* already running */ }
      }, 250);
    };
    rec.current = r;
    try { r.start(); } catch { fail("busy"); }
  }, [fail]);

  const start = useCallback(async (lang: string) => {
    setError(null);
    if (!window.isSecureContext) return fail("insecure");
    if (!SpeechRecognitionCtor) return fail("unsupported");
    if (!navigator.mediaDevices?.getUserMedia) return fail("unsupported");
    setStatus("requesting");
    active.current = true;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = (err as DOMException)?.name;
      return fail(name === "NotAllowedError" || name === "SecurityError" ? "denied"
        : name === "NotFoundError" || name === "OverconstrainedError" ? "no-mic"
          : name === "NotReadableError" ? "busy" : "failed");
    }
    if (!active.current) { teardownAudio(); return; } // stopped while the permission prompt was open
    // Audio level for the live waveform.
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream.current).connect(analyser);
      audio.current = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (t: number) => {
        analyser.getByteTimeDomainData(buf);
        if (t - last > 60) { // ~16 fps is plenty for the meter and avoids needless re-renders
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          last = t;
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch { /* meter is optional */ }
    startRecognizer(lang);
  }, [fail, startRecognizer, teardownAudio]);

  useEffect(() => () => {
    active.current = false;
    clearTimeout(restartTimer.current);
    try { rec.current?.abort(); } catch { /* ignore */ }
    teardownAudio();
  }, [teardownAudio]);

  return { status, error, interim, level, activeLang, start, stop, clearError: () => { setError(null); setStatus("idle"); } };
}
