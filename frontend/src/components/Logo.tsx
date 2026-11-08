import { motion } from "framer-motion";

/** The shield draws itself, then the pulse line traces through it. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ss-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#0a1122" stroke="#1b2747" />
      <motion.path d="M32 9 51 15.5v14c0 12.4-8.2 21.6-19 25-10.8-3.4-19-12.6-19-25v-14z" fill="none" stroke="url(#ss-g)" strokeWidth="3.6" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
      <motion.path d="M13 31h9l4-7 6 14 5-10 3 3h11" fill="none" stroke="#34d399" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, delay: 0.6, ease: "easeInOut" }} />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap">
      <LogoMark size={compact ? 28 : 32} />
      <span className="font-display text-[15px] font-semibold tracking-tight text-white">
        ScamShield<span className="text-cyan-400"> AI</span>
      </span>
    </span>
  );
}
