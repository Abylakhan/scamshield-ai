import { Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBox, PageHeader, Skeleton, TestBadge } from "../components/ui";
import { api } from "../lib/api";
import { RISK_COLOR, SEVERITY_COLOR, fmtDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useAsync } from "../lib/useAsync";
import { motion } from "framer-motion";
import { CountUp, SpotlightCard, Stagger, StaggerItem } from "../lib/motion";

const tooltipStyle = { background: "#0a1122", border: "1px solid #1b2747", borderRadius: 12, fontSize: 12, color: "#e2e8f0" };

export default function Intel() {
  const { t, lang } = useI18n();
  const { data: d, error, loading, reload } = useAsync(() => api.threats(lang), [lang]);

  return (
    <>
      <PageHeader title={t.intel.title} subtitle={t.intel.subtitle} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}
      {d && (
        <motion.div className="space-y-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.p variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} className="flex items-start gap-2 rounded-xl border border-volt-400/25 bg-volt-400/5 px-4 py-3 text-xs leading-relaxed text-blue-200/90"><Info size={14} className="mt-0.5 shrink-0" />{d.disclaimer}</motion.p>

          <section>
            <h2 className="label mb-3">{t.intel.categories}</h2>
            <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" stagger={0.05}>
              {d.categories.map((c) => (
                <StaggerItem key={c.id} className="h-full">
                  <SpotlightCard className="panel h-full p-4">
                    <div className="relative flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{t.threatTypes[c.id] ?? c.label}</p>
                      <CountUp value={c.observed} className={c.observed ? "font-mono text-xs text-cyan-300" : "font-mono text-xs text-slate-600"} />
                    </div>
                    <p className="relative mt-1.5 text-xs leading-relaxed text-slate-400">{c.description}</p>
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </Stagger>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel panel-pad">
              <h2 className="label mb-4">{t.intel.severity}</h2>
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={Object.entries(d.severity_distribution).map(([k, v]) => ({ k, v, label: t.levels[k === "medium" ? "moderate" : (k as "low" | "high" | "critical")] }))} margin={{ left: -20 }}>
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#16213f" }} />
                    <Bar dataKey="v" radius={[6, 6, 0, 0]} barSize={36} animationDuration={1300} animationBegin={300}>
                      {Object.keys(d.severity_distribution).map((k) => <Cell key={k} fill={SEVERITY_COLOR[k]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel panel-pad">
              <h2 className="label mb-3">{t.intel.top}</h2>
              {d.top_indicators.length ? (
                <ul className="space-y-2">
                  {d.top_indicators.map((i, idx) => {
                    const max = d.top_indicators[0].count;
                    return (
                      <motion.li key={i.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + idx * 0.05 }} className="text-xs">
                        <div className="mb-1 flex justify-between"><span className="text-slate-300">{i.name}</span><span className="font-mono text-slate-400">{i.count}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                          <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-volt-400" initial={{ width: 0 }} animate={{ width: `${(i.count / max) * 100}%` }}
                            transition={{ delay: 0.4 + idx * 0.06, duration: 1, ease: [0.16, 1, 0.3, 1] }} />
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-slate-500">{t.intel.none}</p>}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel panel-pad">
              <h2 className="label mb-3">{t.intel.domains}</h2>
              {d.domain_indicators.length ? (
                <ul className="divide-y divide-line">
                  {d.domain_indicators.map((x, i) => (
                    <motion.li key={x.domain} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.04 }} className="py-2.5 transition-transform duration-300 hover:translate-x-1">
                      <div className="flex items-center justify-between gap-2">
                        <code className="truncate font-mono text-xs text-slate-200">{x.domain.replace(/\./g, "[.]")}</code>
                        <span className="shrink-0 font-mono text-[11px] text-slate-500">{x.seen}× · {t.intel.maxRisk} <span style={{ color: x.max_risk >= 75 ? RISK_COLOR.critical : x.max_risk >= 50 ? RISK_COLOR.high : RISK_COLOR.moderate }}>{x.max_risk}</span></span>
                      </div>
                      {x.indicators.length > 0 && <p className="mt-1 truncate text-[11px] text-slate-500">{x.indicators.join(" · ")}</p>}
                    </motion.li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">{t.intel.none}</p>}
            </section>
            <section className="panel panel-pad">
              <h2 className="label mb-3">{t.intel.recent}</h2>
              {d.recent_findings.length ? (
                <ul className="space-y-2">
                  {d.recent_findings.map((f, i) => (
                    <motion.li key={f.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06 }}>
                      <Link to={`/history/${f.id}`} className="block rounded-xl border border-line bg-ink-900/50 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:shadow-[0_10px_30px_-12px_rgba(34,211,238,.35)]">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-white">{t.threatTypes[f.threat_type] ?? f.label}</span>
                          {f.is_demo && <TestBadge />}
                          <span className="ml-auto font-mono text-xs" style={{ color: f.risk_score >= 75 ? RISK_COLOR.critical : RISK_COLOR.high }}>{f.risk_score}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{f.summary}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-600">{fmtDate(f.created_at, lang)}</p>
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">{t.intel.none}</p>}
            </section>
          </div>

          <section className="panel panel-pad">
            <h2 className="label">{t.intel.patterns}</h2>
            <p className="mb-4 mt-1 text-xs text-slate-500">{t.intel.patternsNote}</p>
            <Stagger inView className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" stagger={0.04}>
              {d.reference_patterns.map((p) => (
                <StaggerItem key={p.id} className="rounded-xl border border-line bg-ink-900/50 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/25">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[p.severity] }} />
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-slate-500">+{p.weight}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{p.description}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </motion.div>
      )}
    </>
  );
}
