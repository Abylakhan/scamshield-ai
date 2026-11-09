import { BookOpen, Bot, Command, History, LayoutDashboard, Menu, PhoneCall, Presentation, Radar, ScanSearch, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useScroll } from "framer-motion";
import { EASE, PageTransition, ScrollProgress, softBlur } from "../lib/motion";
import { Logo } from "./Logo";
import { openPalette } from "./CommandPalette";
import { openAiSettings, useGeminiEnabled } from "./AiSettings";
import { ScrollTop } from "./ScrollTop";
import { LangSwitch } from "./ui";
import { useI18n } from "../lib/i18n";
import { STATIC_MODE, api } from "../lib/api";
import { cx } from "../lib/format";
import type { Health } from "../lib/types";

export function useNavItems() {
  const { t } = useI18n();
  return [
    { to: "/analyze", label: t.nav.analyze, icon: ScanSearch },
    { to: "/call-guard", label: t.nav.callGuard, icon: PhoneCall },
    { to: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { to: "/history", label: t.nav.history, icon: History },
    { to: "/intel", label: t.nav.intel, icon: Radar },
    { to: "/learn", label: t.nav.learn, icon: BookOpen },
    { to: "/demo", label: t.nav.demo, icon: Presentation },
  ];
}

function AiButton() {
  const { t } = useI18n();
  const on = useGeminiEnabled();
  return (
    <button onClick={openAiSettings} className="group flex w-full items-center gap-2 rounded-xl border border-line bg-ink-900/60 px-3 py-2 text-xs text-slate-400 transition-colors duration-300 hover:border-violet-400/40 hover:text-white">
      <Bot size={13} className="text-violet-300 transition-transform duration-300 group-hover:scale-110" />{t.ai.title}
      <span className={cx("ml-auto flex items-center gap-1 rounded px-1.5 font-mono text-[10px]", on ? "bg-safe-400/10 text-safe-400" : "bg-ink-700 text-slate-500")}>
        <span className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-safe-400" : "bg-slate-600")} />{on ? t.ai.on : t.ai.off}
      </span>
    </button>
  );
}

function EngineLoadingText() {
  const { t } = useI18n();
  return <span className="animate-pulse">{t.ui.engineLoading}</span>;
}

function EngineStatus() {
  const [h, setH] = useState<Health | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    // Re-check periodically so the badge recovers by itself when the API comes back.
    const check = () => api.health().then((r) => { setH(r); setDown(false); }).catch(() => setDown(true));
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);
  const color = down ? "#fb7185" : h ? "#34d399" : "#64748b";
  return (
    <div className="rounded-xl border border-line bg-ink-900/60 p-3 text-[11px] text-slate-400">
      <p className="mb-1 flex items-center gap-2 font-semibold text-slate-300">
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: color }} /><span className="relative h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} /></span>
        {down ? "API offline" : h ? (h.mode === "browser" ? "Browser engine" : "Engine online") : STATIC_MODE ? <EngineLoadingText /> : "…"}
      </p>
      {h && !down && <p className="font-mono">AI: {h.ai_provider.enabled ? "on" : "heuristic"} · RDAP: {h.checks.domain_age_rdap ? "on" : "off"}</p>}
      <svg viewBox="0 0 120 20" className="mt-2 h-4 w-full" aria-hidden>
        <path d="M0 10 H38 L44 3 L50 17 L56 6 L60 10 H120" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="60 200" style={{ animation: down ? "none" : "heartbeat 1.8s ease-in-out infinite", opacity: 0.8 }} />
      </svg>
    </div>
  );
}

export function AppLayout() {
  const items = useNavItems();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const outlet = useOutlet();
  const { scrollYProgress } = useScroll();
  const nav = (id: string) => (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map(({ to, label, icon: Icon }, i) => (
        <motion.div key={to} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.05, duration: 0.5, ease: EASE }}>
          <NavLink to={to}
            className={({ isActive }) => cx("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-300",
              isActive ? "text-cyan-300" : "text-slate-400 hover:text-white")}>
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId={`nav-pill-${id}`} className="absolute inset-0 rounded-xl border border-cyan-400/20 bg-cyan-400/10"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
                  </motion.span>
                )}
                <span className="absolute inset-0 rounded-xl bg-ink-800 opacity-0 transition-opacity duration-300 group-hover:opacity-60" style={{ display: isActive ? "none" : undefined }} />
                <Icon size={17} className="relative transition-transform duration-300 group-hover:scale-110" />
                <span className="relative transition-transform duration-300 group-hover:translate-x-0.5">{label}</span>
              </>
            )}
          </NavLink>
        </motion.div>
      ))}
    </nav>
  );

  return (
    <motion.div className="min-h-screen lg:pl-64 print:pl-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, ...softBlur(6) }} transition={{ duration: 0.35 }}>
      <ScrollProgress progress={scrollYProgress} />
      {/* Desktop sidebar */}
      <motion.aside initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.6, ease: EASE }}
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-ink-900/80 px-4 py-5 backdrop-blur lg:flex print:!hidden">
        <Link to="/" className="mb-8 px-2 transition-opacity hover:opacity-80"><Logo /></Link>
        {nav("desktop")}
        <div className="mt-auto space-y-3">
          <AiButton />
          <button onClick={openPalette} className="group flex w-full items-center gap-2 rounded-xl border border-line bg-ink-900/60 px-3 py-2 text-xs text-slate-400 transition-colors duration-300 hover:border-cyan-400/30 hover:text-white">
            <Command size={13} className="transition-transform duration-300 group-hover:rotate-12" />{t.ui.palette.open}
            <kbd className="ml-auto rounded border border-line px-1 font-mono text-[10px]">⌘K</kbd>
          </button>
          <LangSwitch className="w-full justify-between" />
          <EngineStatus />
        </div>
      </motion.aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink-950/85 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Link to="/"><Logo compact /></Link>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <button className="grid h-9 w-9 place-items-center rounded-xl border border-line text-slate-300" onClick={openPalette} aria-label={t.ui.palette.open}><Command size={16} /></button>
          <button className="grid h-9 w-9 place-items-center rounded-xl border border-line text-slate-300" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-line bg-ink-900 p-4 lg:hidden"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.22 }}>
              <div className="mb-6 flex items-center justify-between">
                <Logo compact />
                <button className="grid h-9 w-9 place-items-center rounded-xl border border-line" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
              </div>
              {nav("mobile")}
              <div className="mt-auto space-y-3"><AiButton /><EngineStatus /></div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        {STATIC_MODE && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-xl border border-volt-400/25 bg-volt-400/5 px-4 py-2.5 text-xs leading-relaxed text-blue-200/90 print:hidden">{t.ui.browserMode}</motion.p>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={loc.pathname}>{outlet}</PageTransition>
        </AnimatePresence>
      </main>
      <ScrollTop />

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-ink-950/90 backdrop-blur lg:hidden print:hidden" aria-label="Quick">
        {items.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx("relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors duration-300", isActive ? "text-cyan-300" : "text-slate-500")}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="bottom-nav" className="absolute inset-x-5 top-0 h-[2px] rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                <motion.span animate={{ y: isActive ? -2 : 0, scale: isActive ? 1.1 : 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}><Icon size={18} /></motion.span>
                <span className="max-w-full truncate px-1">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </motion.div>
  );
}
