import { motion } from "framer-motion";
import { Bot, Check, CheckCircle2, CircleSlash, Copy, Cpu, Globe, Highlighter, Printer, Repeat2, ShieldAlert, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useFeedback } from "./Feedback";
import { CATEGORY_META, CATEGORY_ORDER, ConfidenceMeter, HighlightedContent, IndicatorCard, ScoreBreakdown } from "./ScoreParts";
import { RiskGauge } from "./RiskGauge";
import { RiskBadge, TestBadge } from "./ui";
import { useI18n } from "../lib/i18n";
import { cx, fmtDate } from "../lib/format";
import type { AnalysisResult, CheckResult, Indicator } from "../lib/types";
import { softBlur, unBlur } from "../lib/motion";

const fade = { initial: { opacity: 0, y: 18, ...softBlur(6) }, animate: { opacity: 1, y: 0, ...unBlur } };

function CheckIcon({ s }: { s: CheckResult["status"] }) {
  if (s === "passed") return <CheckCircle2 size={15} className="text-safe-400" />;
  if (s === "flagged") return <TriangleAlert size={15} className="text-orange-400" />;
  if (s === "error") return <XCircle size={15} className="text-hot-400" />;
  return <CircleSlash size={15} className="text-slate-500" />;
}

/** Copies a short, plain-language warning that people can forward to relatives. */
function ShareButton({ r }: { r: AnalysisResult }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const { toast } = useFeedback();
  const text = t.share.text
    .replace("{threat}", t.threatTypes[r.threat_type] ?? r.threat_type)
    .replace("{score}", String(r.risk_score))
    .replace("{level}", t.levels[r.risk_level]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API blocked (e.g. insecure context): fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast(t.ui.copied);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={copy} aria-live="polite">
      {copied ? <Check size={13} className="text-safe-400" aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? t.share.copied : t.share.copy}
    </button>
  );
}

export function ReportView({ r }: { r: AnalysisResult }) {
  const { t, lang } = useI18n();
  const safe = r.risk_level === "low";
  const hasBreakdown = Object.keys(r.score_breakdown ?? {}).length > 0;
  // Group indicators by scoring category, strongest first; AI context last.
  const grouped = useMemo(() => {
    const order: Indicator["category"][] = [...CATEGORY_ORDER, "mitigation", "ai_context"];
    return order
      .map((c) => ({ c, items: r.indicators.filter((i) => (i.category ?? "contextual") === c) }))
      .filter((g) => g.items.length > 0);
  }, [r.indicators]);
  let idx = 0;

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <motion.section {...fade} className="panel panel-pad relative overflow-hidden">
        <motion.div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: safe ? "rgba(52,211,153,.14)" : "rgba(251,113,133,.14)" }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: r.risk_level === "critical" ? 2.2 : 4, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-cyan-400/[0.07] to-transparent"
          initial={{ top: "-30%" }} animate={{ top: "130%" }} transition={{ duration: 1.4, ease: "easeInOut", delay: 0.2 }} />
        <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-center">
          <motion.div initial={{ scale: 0.7, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 140, damping: 16 }}>
            <RiskGauge score={r.risk_score} level={r.risk_level} size={220} />
          </motion.div>
          <motion.div className="w-full flex-1 text-center md:text-left" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {safe ? <ShieldCheck size={18} className="text-safe-400" aria-hidden /> : <ShieldAlert size={18} className="text-hot-400" aria-hidden />}
              <span className="font-display text-lg font-semibold text-white">{t.threatTypes[r.threat_type] ?? r.threat_type}</span>
              <RiskBadge level={r.risk_level} score={r.risk_score} />
              {r.is_demo && <TestBadge />}
            </div>
            <p className="text-[15px] leading-relaxed text-slate-300">{r.summary}</p>
            <div className="mx-auto mt-4 max-w-sm md:mx-0"><ConfidenceMeter value={r.confidence} /></div>
            {r.similar && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-warn-400/30 bg-warn-400/[0.07] px-3 py-2 text-xs text-slate-200 md:justify-start">
                <Repeat2 size={14} className="text-warn-400" aria-hidden />
                <span className="font-semibold text-warn-400">{t.similar.seen}</span>
                <span>{t.similar.body.replace("{count}", String(r.similar.count))}</span>
                <Link to={`/history/${r.similar.best_id}`} className="font-semibold text-cyan-300 underline-offset-2 hover:underline print:hidden">{t.similar.open} →</Link>
              </motion.div>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start print:hidden">
              <ShareButton r={r} />
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => window.print()}><Printer size={13} aria-hidden />{t.share.print}</button>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-400 md:justify-start">
              <span className="inline-flex items-center gap-1.5">{r.ai_used ? <Bot size={13} className="text-cyan-400" aria-hidden /> : <Cpu size={13} aria-hidden />}{r.ai_used ? t.report.aiOn : t.report.aiOff}</span>
              {r.created_at && <span className="font-mono">{fmtDate(r.created_at, lang)}</span>}
              {r.id && <span className="font-mono text-slate-500">#{r.id}</span>}
            </div>
          </motion.div>
        </div>
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {/* Evidence highlighting */}
          {r.submitted_content && (
            <motion.section {...fade} transition={{ delay: 0.06 }} className="panel panel-pad">
              <h3 className="label mb-3 flex items-center gap-2"><Highlighter size={13} aria-hidden />{t.score.evidenceTitle}</h3>
              <HighlightedContent content={r.submitted_content} indicators={r.indicators} />
            </motion.section>
          )}

          {/* Indicators grouped by category */}
          <motion.section {...fade} transition={{ delay: 0.1 }} className="panel panel-pad">
            <h3 className="label mb-4">{t.report.indicators} · {r.indicators.filter((i) => i.weight > 0 || i.source === "ai").length}</h3>
            {r.indicators.length === 0 ? (
              <p className="text-sm text-slate-400">{t.report.noIndicators}</p>
            ) : (
              <div className="space-y-5">
                {grouped.map(({ c, items }) => {
                  const { icon: Icon, color } = CATEGORY_META[c];
                  return (
                    <div key={c}>
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Icon size={14} style={{ color }} aria-hidden />{t.score.categories[c]}
                        {c in (r.score_breakdown ?? {}) && <span className="font-mono text-slate-500">· {r.score_breakdown[c as keyof typeof r.score_breakdown]} {t.score.points}</span>}
                      </p>
                      <ul className="space-y-2.5">{items.map((i) => <IndicatorCard key={i.id} i={i} idx={idx++} />)}</ul>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {hasBreakdown && (
            <motion.section {...fade} transition={{ delay: 0.12 }} className="panel panel-pad">
              <h3 className="label mb-4">{t.score.breakdown}</h3>
              <ScoreBreakdown r={r} />
            </motion.section>
          )}

          {/* Recommendations */}
          <motion.section {...fade} transition={{ delay: 0.16 }} className={cx("panel panel-pad", !safe && "border-glow border-cyan-400/25")}>
            <h3 className="label mb-3">{t.report.recs}</h3>
            <ol className="space-y-2.5">
              {r.recommendations.map((rec, i) => (
                <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.08 }} className="flex gap-3 text-sm leading-relaxed text-slate-200">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.55 + i * 0.08, type: "spring", stiffness: 400, damping: 15 }}
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-cyan-400/10 font-mono text-[11px] text-cyan-300">{i + 1}</motion.span>
                  {rec}
                </motion.li>
              ))}
            </ol>
          </motion.section>

          {r.ai_assessment && (
            <motion.section {...fade} transition={{ delay: 0.2 }} className="panel panel-pad border-dashed border-violet-400/30">
              <h3 className="label mb-2 flex items-center gap-2 text-violet-300"><Bot size={13} aria-hidden />{t.score.aiTitle}</h3>
              <p className="text-sm text-slate-300">{r.ai_assessment.summary}</p>
              <p className="mt-2 font-mono text-xs text-slate-400">{r.ai_assessment.risk_score}/100 · {t.threatTypes[r.ai_assessment.threat_type] ?? r.ai_assessment.threat_type}</p>
              <p className="mt-2 text-[11px] text-slate-500">{t.score.aiNote}</p>
            </motion.section>
          )}
        </div>
      </div>

      {/* Checks */}
      <motion.section {...fade} transition={{ delay: 0.2 }} className="panel panel-pad">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="label">{t.report.checks}</h3>
          {r.domains.length > 0 && (
            <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-slate-400"><Globe size={13} />{r.domains.map((d) => <code key={d} className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{d}</code>)}</span>
          )}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {r.checks.map((c, i) => (
            <motion.li key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.05 }}
              whileHover={{ y: -2 }} className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-900/50 px-3 py-2.5 transition-colors duration-300 hover:border-cyan-400/25">
              <span className="mt-0.5"><CheckIcon s={c.status} /></span>
              <div className="min-w-0">
                <p className="text-[13px] text-slate-200">{c.name} <span className="ml-1 font-mono text-[10px] uppercase text-slate-500">{t.report.status[c.status]}</span></p>
                <p className="truncate font-mono text-[11px] text-slate-500" title={c.detail}>{c.detail}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </motion.section>

    </div>
  );
}
