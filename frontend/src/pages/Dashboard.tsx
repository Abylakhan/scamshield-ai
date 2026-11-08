import { Activity, AlertOctagon, Gauge, RefreshCw, ScanLine, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, ErrorBox, PageHeader, RiskBadge, Skeleton, TestBadge } from "../components/ui";
import { api } from "../lib/api";
import { RISK_COLOR, fmtDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useAsync } from "../lib/useAsync";
import { motion } from "framer-motion";
import { CountUp, SpotlightCard, Stagger, StaggerItem } from "../lib/motion";
import { CATEGORY_META, CATEGORY_ORDER } from "../components/ScoreParts";
import type { RiskLevel } from "../lib/types";

const tooltipStyle = { background: "#0a1122", border: "1px solid #1b2747", borderRadius: 12, fontSize: 12, color: "#e2e8f0" };

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: typeof Activity; accent: string }) {
  return (
    <SpotlightCard className="panel panel-pad group h-full overflow-hidden">
      <motion.div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl" style={{ background: accent }}
        animate={{ opacity: [0.08, 0.18, 0.08], scale: [1, 1.2, 1] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
      <div className="relative flex items-center justify-between">
        <p className="label">{label}</p>
        <motion.span whileHover={{ rotate: 12, scale: 1.15 }} className="grid h-8 w-8 place-items-center rounded-lg transition-shadow duration-500 group-hover:shadow-[0_0_18px_var(--g)]"
          style={{ background: `${accent}18`, color: accent, ["--g" as string]: `${accent}66` }}><Icon size={16} /></motion.span>
      </div>
      <CountUp value={value} className="relative mt-3 block font-display text-3xl font-semibold tabular-nums text-white" />
    </SpotlightCard>
  );
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { data: s, error, loading, reload, setData } = useAsync(() => api.stats(lang), [lang]);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  // Silent background refresh: numbers animate to new values without skeleton flashes.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api.stats(lang)); setUpdatedAt(new Date()); } catch { /* keep last data; ErrorBox shows hard failures */ }
    finally { setRefreshing(false); }
  }, [lang, setData]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) return <><PageHeader title={t.dashboard.title} subtitle={t.dashboard.subtitle} /><ErrorBox error={error} onRetry={reload} /></>;

  const levels = (["low", "moderate", "high", "critical"] as RiskLevel[]).map((l) => ({ name: t.levels[l], key: l, value: s?.by_level[l] ?? 0 }));
  const activity = (s?.activity ?? []).map((a) => ({ ...a, label: fmtDate(a.date, lang, false) }));

  return (
    <>
      <PageHeader title={t.dashboard.title} subtitle={t.dashboard.subtitle}
        actions={<>
          <span className="chip self-center border-safe-400/30 bg-safe-400/5 py-1 text-[11px] text-safe-400" title={`${t.ui.updated} ${updatedAt.toLocaleTimeString()}`}>
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full bg-safe-400 animate-pulse-ring" /><span className="relative h-1.5 w-1.5 rounded-full bg-safe-400" /></span>
            {t.ui.live} · {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <button className="btn-ghost" onClick={refresh} disabled={refreshing} aria-label={t.ui.refresh}>
            <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}><RefreshCw size={15} /></motion.span>
            <span className="hidden sm:inline">{t.ui.refresh}</span>
          </button>
          <Link to="/analyze" className="btn-primary"><ScanLine size={16} />{t.common.newScan}</Link>
        </>} />

      {loading || !s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px]" />)}</div>
      ) : (
        <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" stagger={0.08}>
          <StaggerItem><Stat label={t.dashboard.total} value={s.total_scans} icon={Activity} accent="#22d3ee" /></StaggerItem>
          <StaggerItem><Stat label={t.dashboard.threats} value={s.threats_detected} icon={ShieldAlert} accent="#fb923c" /></StaggerItem>
          <StaggerItem><Stat label={t.dashboard.critical} value={s.critical_threats} icon={AlertOctagon} accent="#fb7185" /></StaggerItem>
          <StaggerItem><Stat label={t.dashboard.avg} value={s.average_risk} icon={Gauge} accent="#3b82f6" /></StaggerItem>
        </Stagger>
      )}
      {s && s.demo_scans > 0 && (
        <p className="mt-2 text-xs text-slate-500">{s.demo_scans} {t.dashboard.demoCount} · <TestBadge /></p>
      )}

      {s && s.total_scans === 0 ? (
        <div className="panel mt-6">
          <EmptyState title={t.dashboard.emptyTitle} body={t.dashboard.emptyBody}
            action={<div className="flex gap-2"><Link className="btn-primary" to="/analyze">{t.landing.cta}</Link><Link className="btn-ghost" to="/demo">{t.nav.demo}</Link></div>} />
        </div>
      ) : (
        <>
          <Stagger className="mt-6 grid gap-4 lg:grid-cols-3" delay={0.25} stagger={0.1}>
            <StaggerItem className="panel panel-pad lg:col-span-2">
              <h2 className="label mb-4">{t.dashboard.activity}</h2>
              <div className="h-64">
                {s && (
                  <ResponsiveContainer>
                    <AreaChart data={activity} margin={{ left: -20, right: 8, top: 6 }}>
                      <defs>
                        <linearGradient id="gScans" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity={0.35} /><stop offset="1" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gThreats" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" stopOpacity={0.35} /><stop offset="1" stopColor="#fb7185" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid stroke="#16213f" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="scans" name={t.dashboard.scans} stroke="#22d3ee" strokeWidth={2} fill="url(#gScans)" animationDuration={1600} animationEasing="ease-out" />
                      <Area type="monotone" dataKey="threats" name={t.dashboard.threatsSeries} stroke="#fb7185" strokeWidth={2} fill="url(#gThreats)" animationDuration={1600} animationBegin={300} animationEasing="ease-out" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </StaggerItem>
            <StaggerItem className="panel panel-pad">
              <h2 className="label mb-4">{t.dashboard.distribution}</h2>
              <div className="relative h-48">
                {s && (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={levels} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none" animationDuration={1400} animationBegin={200}>
                        {levels.map((l) => <Cell key={l.key} fill={RISK_COLOR[l.key]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  {s ? <CountUp value={s.total_scans} className="font-display text-2xl font-semibold text-white" /> : <span>–</span>}
                </div>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {levels.map((l, i) => (
                  <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.06 }} key={l.key} className="flex items-center gap-2 text-slate-400"><span className="h-2 w-2 rounded-full" style={{ background: RISK_COLOR[l.key] }} />{l.name}<span className="ml-auto font-mono text-slate-200">{l.value}</span></motion.li>
                ))}
              </ul>
            </StaggerItem>
          </Stagger>

          <Stagger className="mt-4 grid gap-4 lg:grid-cols-3" delay={0.4} stagger={0.1}>
            <StaggerItem className="panel panel-pad">
              <h2 className="label mb-4">{t.dashboard.categories}</h2>
              {s && s.by_threat_type.length ? (
                <div style={{ height: Math.max(160, s.by_threat_type.length * 34) }}>
                  <ResponsiveContainer>
                    <BarChart data={s.by_threat_type.map((x) => ({ ...x, label: t.threatTypes[x.type] ?? x.label }))} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={130} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#16213f" }} />
                      <Bar dataKey="count" name={t.dashboard.scans} fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={14} animationDuration={1300} animationBegin={400} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-slate-500">{t.common.noData}</p>}
            </StaggerItem>

            <StaggerItem className="panel panel-pad lg:col-span-2">
              <div className="mb-3 flex items-center justify-between"><h2 className="label">{t.dashboard.recent}</h2><Link to="/history" className="text-xs text-cyan-400 hover:underline">{t.common.viewAll}</Link></div>
              <ul className="divide-y divide-line">
                {s?.recent.map((r, i) => (
                  <motion.li key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.06, duration: 0.4 }}>
                    <Link to={`/history/${r.id}`} className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition-all duration-300 hover:translate-x-1 hover:bg-ink-900/40">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-slate-500">{fmtDate(r.created_at, lang)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{r.content}</span>
                      {r.is_demo && <span className="hidden sm:inline"><TestBadge /></span>}
                      <RiskBadge level={r.risk_level} score={r.risk_score} />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </StaggerItem>
          </Stagger>

          {s && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }} className="panel panel-pad mt-4">
              <h2 className="label mb-4">{t.dashboard.categoryPoints}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {CATEGORY_ORDER.map((c, i) => {
                  const v = s.category_points?.[c] ?? 0;
                  const max = Math.max(1, ...CATEGORY_ORDER.map((k) => s.category_points?.[k] ?? 0));
                  const { icon: Icon, color } = CATEGORY_META[c];
                  return (
                    <motion.li key={c} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + i * 0.06 }}
                      className="rounded-xl border border-line bg-ink-900/50 p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: `${color}18`, color }}><Icon size={13} aria-hidden /></span>
                        <span className="truncate">{t.score.categories[c]}</span>
                      </div>
                      <CountUp value={v} className="mt-2 block font-display text-xl font-semibold text-white" />
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }}
                          transition={{ delay: 0.7 + i * 0.08, duration: 1, ease: [0.16, 1, 0.3, 1] }} />
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </motion.section>
          )}

          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className="panel panel-pad mt-4">
            <h2 className="label mb-3">{t.dashboard.domains}</h2>
            {s && s.suspicious_domains.length ? (
              <Stagger as="ul" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" delay={0.7} stagger={0.05}>
                {s.suspicious_domains.map((d) => (
                  <StaggerItem as="li" key={d.domain}>
                    <Link to={`/history/${d.scan_id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-ink-900/50 px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-hot-400/40 hover:shadow-[0_6px_20px_-8px_rgba(251,113,133,.4)]">
                      {/* Displayed as inert text, never as a clickable external link */}
                      <code className="truncate font-mono text-xs text-slate-200">{d.domain.replace(/\./g, "[.]")}</code>
                      <span className="font-mono text-xs" style={{ color: d.risk_score >= 75 ? RISK_COLOR.critical : RISK_COLOR.high }}>{d.risk_score}</span>
                    </Link>
                  </StaggerItem>
                ))}
              </Stagger>
            ) : <p className="text-sm text-slate-500">{t.common.noData}</p>}
          </motion.section>
        </>
      )}
    </>
  );
}
