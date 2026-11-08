import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; text: string }
interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; danger?: boolean }

interface Ctx {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}
const FeedbackContext = createContext<Ctx | null>(null);

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info };
const TOAST_COLOR = { success: "#34d399", error: "#fb7185", info: "#22d3ee" };
const TOAST_MS = 3200;

/** App-wide toasts and a promise-based confirm dialog (replaces window.confirm). */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = ++nextId.current;
    setToasts((ts) => [...ts.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })), []);
  const close = useCallback((v: boolean) => {
    setDialog((d) => { d?.resolve(v); return null; });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [dialog, close]);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((x) => {
            const Icon = TOAST_ICON[x.kind];
            const c = TOAST_COLOR[x.kind];
            return (
              <motion.div key={x.id} layout initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.2 } }} transition={{ type: "spring", stiffness: 380, damping: 28 }}
                role={x.kind === "error" ? "alert" : "status"}
                className="pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-xl border bg-ink-900/95 px-4 py-3 text-sm text-slate-100 shadow-2xl backdrop-blur"
                style={{ borderColor: `${c}55`, boxShadow: `0 12px 40px -12px ${c}66` }}>
                <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 14, delay: 0.05 }}>
                  <Icon size={18} style={{ color: c }} aria-hidden />
                </motion.span>
                <span className="flex-1">{x.text}</span>
                <button onClick={() => dismiss(x.id)} className="rounded-md p-1 text-slate-500 hover:text-white" aria-label={t.common.cancel}><X size={14} /></button>
                <motion.span className="absolute bottom-0 left-0 h-[2px]" style={{ background: c }} initial={{ width: "100%" }} animate={{ width: 0 }}
                  transition={{ duration: TOAST_MS / 1000, ease: "linear" }} aria-hidden />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {dialog && (
          <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
            <motion.div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={dialog.body ? "confirm-body" : undefined}
              initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 340, damping: 26 }}
              className="w-full max-w-sm rounded-2xl border border-line bg-ink-900 p-6 shadow-2xl">
              <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.05 }}
                className={`grid h-11 w-11 place-items-center rounded-xl ${dialog.danger ? "bg-hot-500/15 text-hot-400" : "bg-cyan-400/15 text-cyan-300"}`}>
                {dialog.danger ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
              </motion.span>
              <h2 id="confirm-title" className="mt-4 font-display text-lg font-semibold text-white">{dialog.title}</h2>
              {dialog.body && <p id="confirm-body" className="mt-1.5 text-sm leading-relaxed text-slate-400">{dialog.body}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button ref={cancelRef} className="btn-ghost" onClick={() => close(false)}>{t.common.cancel}</button>
                <button className={dialog.danger ? "btn btn-primary bg-hot-400 hover:bg-hot-500" : "btn-primary"} onClick={() => close(true)}>
                  {dialog.confirmLabel ?? t.common.delete}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback outside FeedbackProvider");
  return ctx;
}
