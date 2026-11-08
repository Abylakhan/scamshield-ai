import { ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, ErrorBox, PageHeader, RiskBadge, Skeleton, TestBadge } from "../components/ui";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useAsync } from "../lib/useAsync";
import { useFeedback } from "../components/Feedback";
import { AnimatePresence, motion } from "framer-motion";

const LEVELS = ["", "low", "moderate", "high", "critical"] as const;
const TYPES = ["", "message", "url", "investment", "advertisement", "call"] as const;

export default function HistoryPage() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const { confirm, toast } = useFeedback();
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const { data, error, loading, reload, setData } = useAsync(() => api.history({ risk_level: level, input_type: type, limit: 200 }), [level, type]);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const remove = async (id: number) => {
    if (!(await confirm({ title: t.ui.deleteTitle, body: t.ui.deleteBody, danger: true }))) return;
    setBusy(id);
    try {
      await api.deleteScan(id);
      setData((d) => d && { items: d.items.filter((i) => i.id !== id), total: d.total - 1 });
      toast(t.ui.deleted);
    } catch (e) { setActionError(e); } finally { setBusy(null); }
  };
  const clearAll = async () => {
    if (!(await confirm({ title: t.ui.clearTitle, body: t.ui.clearBody, confirmLabel: t.ui.clearAction, danger: true }))) return;
    try { await api.clearHistory(); reload(); toast(t.ui.cleared); } catch (e) { setActionError(e); }
  };

  const select = "rounded-xl border border-line bg-ink-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-400/60 focus:outline-none";

  return (
    <>
      <PageHeader title={t.history.title} subtitle={t.history.subtitle}
        actions={data && data.total > 0 ? <button className="btn-danger" onClick={clearAll}><Trash2 size={15} />{t.history.clear}</button> : null} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="f-level">{t.history.level}</label>
        <select id="f-level" className={select} value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => <option key={l} value={l}>{l ? t.levels[l] : `${t.history.level}: ${t.history.all}`}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-type">{t.history.type}</label>
        <select id="f-type" className={select} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((x) => <option key={x} value={x}>{x ? t.types[x] : `${t.history.type}: ${t.history.all}`}</option>)}
        </select>
        {data && <motion.span key={data.total} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="ml-auto font-mono text-xs text-slate-500">{data.total} {t.history.total}</motion.span>}
      </motion.div>

      {(error || actionError) && <div className="mb-4"><ErrorBox error={error ?? actionError} onRetry={() => { setActionError(null); reload(); }} /></div>}

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="panel overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data && data.items.length === 0 ? (
          <EmptyState title={t.history.empty} action={<Link className="btn-primary" to="/analyze">{t.landing.cta}</Link>} />
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left text-sm lg:table">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t.history.date}</th>
                  <th className="px-4 py-3 font-semibold">{t.history.content}</th>
                  <th className="px-4 py-3 font-semibold">{t.history.type}</th>
                  <th className="px-4 py-3 font-semibold">{t.history.threat}</th>
                  <th className="px-4 py-3 font-semibold">{t.history.score}</th>
                  <th className="px-4 py-3 font-semibold">{t.history.status}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <AnimatePresence initial={true}>
                {data?.items.map((s, i) => (
                  <motion.tr key={s.id} layout initial={{ opacity: 0, x: -14 }} animate={{ opacity: busy === s.id ? 0.4 : 1, x: 0 }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.3 } }} transition={{ delay: Math.min(i, 15) * 0.03, duration: 0.35 }}
                    className="group cursor-pointer transition-colors duration-300 hover:bg-cyan-400/[0.04]" onClick={() => nav(`/history/${s.id}`)}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{fmtDate(s.created_at, lang)}</td>
                    <td className="max-w-[340px] px-4 py-3"><span className="line-clamp-1 text-slate-300">{s.submitted_content}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{t.types[s.input_type]} {s.is_demo && <TestBadge />}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-300">{t.threatTypes[s.threat_type] ?? s.threat_type}</td>
                    <td className="px-4 py-3"><RiskBadge level={s.risk_level} score={s.risk_score} /></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-safe-400">{s.status}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="rounded-lg p-1.5 text-slate-500 hover:bg-hot-500/10 hover:text-hot-400" aria-label={t.common.delete}
                        onClick={(e) => { e.stopPropagation(); remove(s.id); }}><Trash2 size={15} className="transition-transform duration-300 hover:rotate-12 hover:scale-110" /></button>
                    </td>
                  </motion.tr>
                ))}
                </AnimatePresence>
              </tbody>
            </table>
            {/* Mobile list */}
            <ul className="divide-y divide-line lg:hidden">
              <AnimatePresence>
              {data?.items.map((s, i) => (
                <motion.li key={s.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60, height: 0, padding: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.04 }} className="flex items-center gap-3 overflow-hidden p-4">
                  <Link to={`/history/${s.id}`} className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2"><RiskBadge level={s.risk_level} score={s.risk_score} />{s.is_demo && <TestBadge />}</div>
                    <p className="line-clamp-2 text-sm text-slate-300">{s.submitted_content}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">{fmtDate(s.created_at, lang)} · {t.threatTypes[s.threat_type] ?? s.threat_type}</p>
                  </Link>
                  <button className="rounded-lg p-2 text-slate-500 hover:text-hot-400" aria-label={t.common.delete} onClick={() => remove(s.id)}><Trash2 size={16} /></button>
                  <ChevronRight size={16} className="text-slate-600" />
                </motion.li>
              ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </motion.div>
    </>
  );
}
