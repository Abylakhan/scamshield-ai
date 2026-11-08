import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useId } from "react";
import { EASE } from "../lib/motion";
import type { ReactNode } from "react";
import { useI18n, LANG_LABELS } from "../lib/i18n";
import { RISK_COLOR, cx } from "../lib/format";
import type { Lang, RiskLevel } from "../lib/types";
import { ApiError, errorKind } from "../lib/api";

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const { t } = useI18n();
  const c = RISK_COLOR[level];
  return (
    <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="chip font-mono" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
      <span className="relative flex h-1.5 w-1.5">{(level === "critical" || level === "high") && <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: c }} />}<span className="relative h-1.5 w-1.5 rounded-full" style={{ background: c }} /></span>
      {score !== undefined && <span>{score}</span>}
      <span className="font-sans">{t.levels[level]}</span>
    </motion.span>
  );
}

export function TestBadge() {
  const { t } = useI18n();
  return <span className="chip border-volt-400/40 bg-volt-400/10 text-[10px] uppercase tracking-wider text-blue-300">{t.common.testExample}</span>;
}

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const id = useId();
  return (
    <div className={cx("inline-flex rounded-xl border border-line bg-ink-900/80 p-0.5", className)} role="group" aria-label="Language">
      {(["kk", "ru", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cx("relative rounded-[10px] px-2.5 py-1 text-xs font-semibold transition-colors duration-300", lang === l ? "text-ink-950" : "text-slate-400 hover:text-white")}
        >
          {lang === l && <motion.span layoutId={`lang-${id}`} className="absolute inset-0 rounded-[10px] bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,.5)]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
          <span className="relative">{LANG_LABELS[l]}</span>
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <motion.h1 initial={{ opacity: 0, y: 12, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: EASE }}
          className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</motion.h1>
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
          className="mt-2 h-[2px] w-16 origin-left rounded-full bg-gradient-to-r from-cyan-400 to-transparent" />
        {subtitle && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-2 max-w-2xl text-sm text-slate-400">{subtitle}</motion.p>}
      </div>
      {actions && <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: EASE }} className="flex flex-wrap gap-2">{actions}</motion.div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="animate-float mb-3 grid h-11 w-11 place-items-center rounded-xl border border-line bg-ink-800 text-slate-400"><Inbox size={20} /></div>
      <p className="font-semibold text-white">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const kind = errorKind(error);
  const msg = kind === "network" ? t.common.errorNetwork : t.errors[kind];
  const detail = error instanceof ApiError && kind === "invalid" ? error.fieldMessage : undefined;
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} transition={{ duration: 0.5 }} role="alert" className="flex flex-col gap-3 rounded-2xl border border-hot-400/30 bg-hot-500/5 p-4 sm:flex-row sm:items-center">
      <AlertTriangle className="shrink-0 text-hot-400" size={20} />
      <div className="flex-1 text-sm text-slate-200"><p>{msg}</p>{detail && <p className="mt-0.5 text-xs text-slate-400">{detail}</p>}</div>
      {onRetry && <button className="btn-ghost" onClick={onRetry}><RefreshCw size={14} />{t.common.retry}</button>}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-xl bg-ink-700/40", className)}>
      <motion.div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cyan-300/[0.07] to-transparent"
        animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
    </div>
  );
}
