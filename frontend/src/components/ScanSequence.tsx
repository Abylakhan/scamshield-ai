import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { cx } from "../lib/format";

/**
 * Visual progress while the real backend request is in flight. The final step only completes
 * when `done` is true (i.e. the API has actually returned) — nothing is faked as finished.
 */
export function ScanSequence({ done, hasUrl }: { done: boolean; hasUrl: boolean }) {
  const { t } = useI18n();
  const steps = t.analyzer.steps;
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (done) { setActive(steps.length); return; }
    const id = setInterval(() => setActive((a) => Math.min(a + 1, steps.length - 1)), 650);
    return () => clearInterval(id);
  }, [done, steps.length]);

  return (
    <div className="panel panel-pad relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-400/10 to-transparent animate-scanline" />
      <div className="relative">
        <p className="label mb-4 flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 animate-pulse-ring" /><span className="relative h-2 w-2 rounded-full bg-cyan-400" /></span>{t.analyzer.scanning}</p>
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const skipped = i === 2 && !hasUrl;
            const state = i < active ? "done" : i === active ? "active" : "pending";
            return (
              <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className={cx("flex items-center gap-3 text-sm", state === "pending" ? "text-slate-500" : "text-slate-200")}>
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                  state === "done" ? "border-safe-400/50 bg-safe-400/10 text-safe-400" : state === "active" ? "border-cyan-400/60 text-cyan-400" : "border-line")}>
                  {state === "done" ? <Check size={13} /> : state === "active" ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1 w-1 rounded-full bg-slate-600" />}
                </span>
                <span className={cx(skipped && state === "done" && "text-slate-500 line-through decoration-slate-600")}>{s}</span>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
