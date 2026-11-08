import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useMemo } from "react";
import { useEffect } from "react";

const TICKS = 31;
import { RISK_COLOR } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { RiskLevel } from "../lib/types";

export function RiskGauge({ score, level, size = 200 }: { score: number; level: RiskLevel; size?: number }) {
  const { t } = useI18n();
  const r = 80;
  const C = Math.PI * r * 1.5; // 270° arc
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v));
  const dash = useTransform(mv, (v) => `${(v / 100) * C} ${C * 2}`);
  useEffect(() => {
    const c = animate(mv, score, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return c.stop;
  }, [score, mv]);
  const color = RISK_COLOR[level];
  // Glowing tip that rides the end of the arc (SVG is rotated, so angle 0 = arc start).
  const tipX = useTransform(mv, (v) => 100 + r * Math.cos((v / 100) * 1.5 * Math.PI));
  const tipY = useTransform(mv, (v) => 100 + r * Math.sin((v / 100) * 1.5 * Math.PI));
  const ticks = useMemo(() => Array.from({ length: TICKS }, (_, i) => {
    const a = (i / (TICKS - 1)) * 1.5 * Math.PI;
    const major = i % 5 === 0;
    const r1 = 93, r2 = major ? 99 : 96.5;
    return { i, x1: 100 + r1 * Math.cos(a), y1: 100 + r1 * Math.sin(a), x2: 100 + r2 * Math.cos(a), y2: 100 + r2 * Math.sin(a), major };
  }), []);
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${t.common.score}: ${score}/100, ${t.levels[level]}`}>
      <svg viewBox="0 0 200 200" width={size} height={size} className="-rotate-[225deg] overflow-visible">
        {ticks.map((tk) => {
          const lit = (tk.i / (TICKS - 1)) * 100 <= score && score > 0;
          return (
            <motion.line key={tk.i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} strokeLinecap="round" strokeWidth={tk.major ? 2 : 1.2}
              initial={{ stroke: "#1b2747", opacity: 0.6 }} animate={{ stroke: lit ? color : "#1b2747", opacity: lit ? 1 : 0.6 }}
              transition={{ delay: lit ? 0.15 + tk.i * 0.028 : 0, duration: 0.25 }} />
          );
        })}
        <circle cx="100" cy="100" r={r} fill="none" stroke="#16213f" strokeWidth="14" strokeDasharray={`${C} ${C * 2}`} strokeLinecap="round" />
        <motion.circle cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          style={{ strokeDasharray: dash, filter: `drop-shadow(0 0 10px ${color}66)` }}
          animate={level === "critical" ? { opacity: [1, 0.75, 1] } : { opacity: 1 }} transition={{ duration: 1.6, repeat: level === "critical" ? Infinity : 0 }} />
        {score > 0 && (
          <>
            <motion.circle cx={tipX} cy={tipY} r="9" fill={color} opacity="0.25" animate={{ r: [8, 12, 8] }} transition={{ duration: 1.8, repeat: Infinity }} />
            <motion.circle cx={tipX} cy={tipY} r="4.5" fill="#fff" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="font-display text-5xl font-semibold tabular-nums text-white">{display}</motion.span>
        <span className="mt-0.5 font-mono text-[11px] text-slate-500">/ 100</span>
        <span className="mt-2 text-sm font-semibold" style={{ color }}>{t.levels[level]}</span>
      </div>
    </div>
  );
}
