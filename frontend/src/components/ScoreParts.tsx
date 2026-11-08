import { motion } from "framer-motion";
import {
  AlertCircle, AlertTriangle, ArrowRight, BadgeCheck, Bot, CircleDot, Cpu, Fingerprint, Globe2, Info, Landmark, OctagonAlert,
  ShieldCheck, TrendingDown, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Fragment, useMemo } from "react";
import { EASE } from "../lib/motion";
import { evidenceSpans } from "../lib/highlight";
import { SEVERITY_COLOR, cx } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { AnalysisResult, Indicator, ScoreCategory, Severity } from "../lib/types";

export const CATEGORY_ORDER: ScoreCategory[] = ["phishing", "social_engineering", "financial_fraud", "technical", "contextual"];

export const CATEGORY_META: Record<Indicator["category"], { icon: LucideIcon; color: string }> = {
  phishing: { icon: Fingerprint, color: "#fb7185" },
  social_engineering: { icon: Users, color: "#fb923c" },
  financial_fraud: { icon: Wallet, color: "#fbbf24" },
  technical: { icon: Globe2, color: "#3b82f6" },
  contextual: { icon: Landmark, color: "#22d3ee" },
  mitigation: { icon: ShieldCheck, color: "#34d399" },
  ai_context: { icon: Bot, color: "#a78bfa" },
};

const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  info: Info, low: CircleDot, medium: AlertCircle, high: AlertTriangle, critical: OctagonAlert,
};

/** Severity shown with icon + text, never colour alone. */
export function SeverityTag({ severity }: { severity: Severity }) {
  const { t } = useI18n();
  const Icon = SEVERITY_ICON[severity];
  const c = SEVERITY_COLOR[severity];
  return (
    <span className="chip gap-1 py-0.5 text-[11px]" style={{ color: c, borderColor: `${c}55`, background: `${c}12` }}>
      <Icon size={12} aria-hidden />{t.score.severity[severity]}
    </span>
  );
}

/** Stacked bar + per-category rows. The parts sum exactly to the risk score. */
export function ScoreBreakdown({ r }: { r: AnalysisResult }) {
  const { t } = useI18n();
  const bd = r.score_breakdown ?? {};
  const det = r.score_details ?? {};
  const cats = CATEGORY_ORDER.filter((c) => (bd[c] ?? 0) > 0);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    r.indicators.forEach((i) => { if (i.contribution > 0) m[i.category] = (m[i.category] ?? 0) + 1; });
    return m;
  }, [r.indicators]);

  return (
    <div>
      {/* stacked bar on a 0–100 scale */}
      <div className="relative h-4 overflow-hidden rounded-full bg-ink-700" role="img"
        aria-label={cats.map((c) => `${t.score.categories[c]} ${bd[c]}`).join(", ") || t.score.none}>
        <div className="flex h-full">
          {cats.map((c, i) => (
            <motion.div key={c} className="h-full first:rounded-l-full" style={{ background: CATEGORY_META[c].color }}
              initial={{ width: 0 }} animate={{ width: `${bd[c]}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.12, ease: EASE }}
              title={`${t.score.categories[c]}: ${bd[c]}`} />
          ))}
        </div>
        {[25, 50, 75].map((m) => <span key={m} className="absolute inset-y-0 w-px bg-ink-950/70" style={{ left: `${m}%` }} aria-hidden />)}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-600" aria-hidden><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>

      <ul className="mt-4 space-y-2.5">
        {CATEGORY_ORDER.map((c, i) => {
          const v = bd[c] ?? 0;
          const { icon: Icon, color } = CATEGORY_META[c];
          const catDet = det.categories?.[c];
          return (
            <motion.li key={c} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.06 }}
              className={cx("flex items-center gap-3", v === 0 && "opacity-45")}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${color}18`, color }}><Icon size={14} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-200">{t.score.categories[c]}{counts[c] ? <span className="ml-1.5 text-slate-500">· {counts[c]}</span> : null}</span>
                  <span className="font-mono text-slate-300">{v} <span className="text-slate-600">{t.score.points}</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }}
                    animate={{ width: `${catDet ? (catDet.score / 100) * 100 : v}%` }} transition={{ duration: 1, delay: 0.4 + i * 0.08, ease: EASE }} />
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {/* equation */}
      <div className="mt-5 rounded-xl border border-line bg-ink-900/60 p-3 font-mono text-xs">
        <p className="label mb-2 font-sans">{t.score.howTitle}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-300">
          <span>{t.score.raw} <span className="text-white">{det.raw_score ?? r.risk_score}</span></span>
          {(det.mitigation ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-safe-400"><TrendingDown size={12} aria-hidden />− {det.mitigation} {t.score.mitigation}</span>
          )}
          <ArrowRight size={12} className="text-slate-600" aria-hidden />
          <span className="text-white">{t.score.final}: {r.risk_score}</span>
        </div>
        {cats.length > 0 && (
          <p className="mt-1.5 text-slate-500">{cats.map((c, i) => <Fragment key={c}>{i > 0 && " + "}{t.score.categories[c]} {bd[c]}</Fragment>)} = {r.risk_score}</p>
        )}
        {det.ruleset_version && <p className="mt-1.5 text-[10px] text-slate-600">{t.score.ruleset} v{det.ruleset_version}</p>}
      </div>
    </div>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const { t } = useI18n();
  const pct = Math.round(value * 100);
  const segs = 10;
  return (
    <div title={t.score.confidenceHint}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="label">{t.score.confidenceTitle}</span>
        <span className="font-mono text-slate-200">{value.toFixed(2)}</span>
      </div>
      <div className="flex gap-1" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t.score.confidenceTitle}>
        {Array.from({ length: segs }, (_, i) => (
          <motion.span key={i} className="h-1.5 flex-1 rounded-full" initial={{ background: "#16213f" }}
            animate={{ background: i < Math.round(pct / 10) ? "#22d3ee" : "#16213f" }} transition={{ delay: 0.5 + i * 0.05 }} />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{t.score.confidenceHint}</p>
    </div>
  );
}

/** Submitted content with evidence excerpts highlighted. Builds React nodes — content is never parsed as HTML. */
export function HighlightedContent({ content, indicators }: { content: string; indicators: Indicator[] }) {
  const { t } = useI18n();
  const spans = useMemo(() => evidenceSpans(content, indicators), [content, indicators]);

  if (spans.length === 0) {
    return (
      <>
        <p className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-slate-300">{content}</p>
        <p className="mt-2 text-[11px] text-slate-500">{t.score.noEvidence}</p>
      </>
    );
  }
  const nodes: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((s, i) => {
    if (s.start > pos) nodes.push(content.slice(pos, s.start));
    const c = s.ind.weight < 0 ? "#34d399" : SEVERITY_COLOR[s.ind.severity];
    nodes.push(
      <motion.mark key={i} title={`${s.ind.name} · ${t.score.severity[s.ind.severity]}`}
        initial={{ backgroundColor: "rgba(0,0,0,0)" }} animate={{ backgroundColor: `${c}2e` }} transition={{ delay: 0.4 + i * 0.12, duration: 0.5 }}
        className="rounded px-0.5 text-white underline decoration-2 underline-offset-[3px]" style={{ textDecorationColor: c }}>
        {content.slice(s.start, s.end)}
        <sup className="ml-0.5 font-sans text-[9px] font-bold" style={{ color: c }}>{i + 1}</sup>
      </motion.mark>,
    );
    pos = s.end;
  });
  if (pos < content.length) nodes.push(content.slice(pos));
  return (
    <>
      <p className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-slate-300">{nodes}</p>
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {spans.map((s, i) => <li key={i}><span className="font-mono font-bold text-slate-300">{i + 1}</span> {s.ind.name}</li>)}
      </ol>
    </>
  );
}

export function IndicatorCard({ i, idx }: { i: Indicator; idx: number }) {
  const { t } = useI18n();
  const meta = CATEGORY_META[i.category] ?? CATEGORY_META.contextual;
  const CatIcon = meta.icon;
  const sevColor = i.weight < 0 ? "#34d399" : SEVERITY_COLOR[i.severity];
  const reduced = i.weight > 0 && i.contribution > 0 && i.contribution < i.weight;
  return (
    <motion.li initial={{ opacity: 0, x: -16, filter: "blur(4px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ delay: 0.3 + idx * 0.06, duration: 0.45, ease: EASE }} whileHover={{ x: 3 }}
      className={cx("relative overflow-hidden rounded-xl border bg-ink-900/60 p-3.5", i.verified ? "border-line" : "border-dashed border-violet-400/30")}>
      <motion.span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: sevColor }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
        transition={{ delay: 0.45 + idx * 0.06, duration: 0.4 }} aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{i.name}</span>
        <SeverityTag severity={i.severity} />
        <span className="chip gap-1 border-line py-0.5 text-[10px] text-slate-400"><CatIcon size={11} style={{ color: meta.color }} aria-hidden />{t.score.categories[i.category]}</span>
        {i.verified
          ? i.evidence_type === "external" && <span className="chip gap-1 border-line py-0.5 text-[10px] text-slate-400"><Cpu size={11} aria-hidden />{t.score.external}</span>
          : <span className="chip gap-1 border-violet-400/40 py-0.5 text-[10px] text-violet-300"><Bot size={11} aria-hidden />{t.score.unverifiedAi}</span>}
        {i.weight !== 0 && (
          <span className={cx("ml-auto text-right font-mono text-xs", i.weight > 0 ? "text-orange-300" : "text-safe-400")}
            title={reduced ? t.score.grouped : undefined}>
            {i.weight > 0 ? "+" : "−"}{Math.abs(i.contribution || i.weight)}
            {reduced && <span className="ml-1 text-[10px] text-slate-500 line-through">{i.weight}</span>}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{i.explanation ?? i.description}</p>
      {i.evidence && (
        <p className="mt-2 break-words font-mono text-[11px] text-cyan-300/90">
          <span className="text-slate-500">{i.evidence_type === "derived" ? t.score.derived : t.report.evidence}: </span>
          {i.evidence_type === "derived" ? i.evidence.split(" + ").map((p, k) => <Fragment key={k}>{k > 0 && <span className="text-slate-600"> + </span>}“{p}”</Fragment>) : <>“{i.evidence}”</>}
        </p>
      )}
      {reduced && <p className="mt-1 text-[10px] text-slate-500">↳ {t.score.grouped}</p>}
      {i.recommendation && i.weight > 0 && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-cyan-400/[0.06] px-2.5 py-1.5 text-xs text-cyan-100">
          <BadgeCheck size={13} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden /><span><span className="font-semibold">{t.score.action}:</span> {i.recommendation}</span>
        </p>
      )}
    </motion.li>
  );
}
