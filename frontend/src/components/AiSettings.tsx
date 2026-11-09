import { AnimatePresence, motion } from "framer-motion";
import { Bot, CheckCircle2, KeyRound, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { STATIC_MODE } from "../lib/api";
import { onAiFailure } from "../lib/browserApi";
import { AI_PROXY, DEFAULT_GEMINI_MODEL, GeminiError, loadGemini, loadPersonalGemini, proxyAvailable, saveGemini, testGemini } from "../lib/gemini";
import { useI18n } from "../lib/i18n";
import { useFeedback } from "./Feedback";

export const OPEN_AI_SETTINGS = "scamshield:ai-settings";
export const openAiSettings = () => window.dispatchEvent(new Event(OPEN_AI_SETTINGS));

/** Reactive "is Gemini configured" flag for badges. */
export function useGeminiEnabled() {
  const [on, setOn] = useState(() => !!loadGemini());
  useEffect(() => {
    const f = () => setOn(!!loadGemini());
    window.addEventListener("scamshield:gemini", f);
    return () => window.removeEventListener("scamshield:gemini", f);
  }, []);
  return on;
}

export function AiSettings() {
  const { t } = useI18n();
  const A = t.ai;
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = !!loadPersonalGemini();
  const [testingProxy, setTestingProxy] = useState(false);

  useEffect(() => {
    const onOpen = () => { const g = loadPersonalGemini(); setKey(g?.apiKey ?? ""); setModel(g?.model ?? DEFAULT_GEMINI_MODEL); setStatus(null); setOpen(true); };
    window.addEventListener(OPEN_AI_SETTINGS, onOpen);
    return () => window.removeEventListener(OPEN_AI_SETTINGS, onOpen);
  }, []);
  // Surface Gemini failures during analysis as toasts.
  useEffect(() => { onAiFailure((kind) => toast(A.errors[kind], "error")); return () => onAiFailure(null); }, [toast, A]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const test = async () => {
    setTesting(true); setStatus(null);
    try { await testGemini({ apiKey: key.trim(), model: model.trim() || DEFAULT_GEMINI_MODEL }); setStatus({ ok: true, text: A.testOk }); }
    catch (e) { setStatus({ ok: false, text: A.errors[e instanceof GeminiError ? e.kind : "other"] }); }
    finally { setTesting(false); }
  };
  const testProxy = async () => {
    setTestingProxy(true); setStatus(null);
    try { await testGemini({ apiKey: "", model: DEFAULT_GEMINI_MODEL, proxy: AI_PROXY }); setStatus({ ok: true, text: A.testOk }); }
    catch (e) { setStatus({ ok: false, text: A.errors[e instanceof GeminiError ? e.kind : "other"] }); }
    finally { setTestingProxy(false); }
  };
  const save = () => { saveGemini({ apiKey: key, model }); toast(A.saved); setOpen(false); };
  const remove = () => { saveGemini(null); setKey(""); toast(A.removed, "info"); setOpen(false); };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[88] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="ai-title" initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 340, damping: 26 }}
            className="border-glow w-full max-w-md rounded-2xl border border-line bg-ink-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <motion.span initial={{ rotate: -30, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-400/15 text-violet-300"><Bot size={22} /></motion.span>
              <div className="flex-1">
                <h2 id="ai-title" className="font-display text-lg font-semibold text-white">{A.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{A.subtitle}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-500 hover:text-white" aria-label={t.common.cancel}><X size={16} /></button>
            </div>
            {STATIC_MODE ? (
              <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(); }}>
                {proxyAvailable() && (
                  <div className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${saved ? "border-line bg-ink-950/60 text-slate-400" : "border-safe-400/30 bg-safe-400/10 text-safe-300"}`}>
                    <p className="flex items-start gap-1.5 font-semibold"><CheckCircle2 size={14} className="mt-px shrink-0" />{saved ? A.builtInOverridden : A.builtIn}</p>
                    <button type="button" className="mt-1.5 inline-flex items-center gap-1 font-semibold text-cyan-300 hover:underline" onClick={testProxy} disabled={testingProxy}>
                      {testingProxy && <Loader2 size={12} className="animate-spin" />}{A.test}
                    </button>
                  </div>
                )}
                {proxyAvailable() && <p className="label pt-1">{A.ownKey}</p>}
                <div>
                  <label htmlFor="gemini-key" className="label mb-1.5 block">{A.keyLabel}</label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
                    <input id="gemini-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)}
                      className="w-full rounded-xl border border-line bg-ink-950/70 py-2.5 pl-9 pr-3 font-mono text-sm text-white focus:border-cyan-400/60 focus:outline-none" />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{A.keyHint}</p>
                </div>
                <div>
                  <label htmlFor="gemini-model" className="label mb-1.5 block">{A.modelLabel}</label>
                  <input id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false}
                    className="w-full rounded-xl border border-line bg-ink-950/70 px-3 py-2.5 font-mono text-sm text-white focus:border-cyan-400/60 focus:outline-none" />
                </div>
                <AnimatePresence>
                  {status && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="status"
                      className={`flex items-center gap-1.5 text-xs ${status.ok ? "text-safe-400" : "text-hot-400"}`}>
                      {status.ok && <CheckCircle2 size={13} />}{status.text}
                    </motion.p>
                  )}
                </AnimatePresence>
                <p className="rounded-lg bg-ink-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">{A.privacy}</p>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  {saved && <button type="button" className="btn-danger mr-auto" onClick={remove}><Trash2 size={14} />{A.remove}</button>}
                  <button type="button" className="btn-ghost" onClick={test} disabled={!key.trim() || testing}>
                    {testing ? <Loader2 size={14} className="animate-spin" /> : null}{testing ? A.testing : A.test}
                  </button>
                  <button type="submit" className="btn-primary" disabled={!key.trim()}>{A.save}</button>
                </div>
              </form>
            ) : (
              <p className="mt-5 rounded-lg bg-ink-950/60 px-3 py-2 font-mono text-xs text-slate-300">{A.serverNote}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
