import { AnimatePresence, motion, useInView, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Briefcase, Building2, ClipboardPaste, Eye, Fingerprint, Gift, Globe, Landmark, LayoutDashboard,
  Lightbulb, Lock, MessagesSquare, Package, ScanSearch, ShieldCheck, Sparkles, TrendingUp, Triangle,
} from "lucide-react";
import { PhoneCall, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Logo, LogoMark } from "../components/Logo";
import { LangSwitch } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { cx } from "../lib/format";
import { CountUp, EASE, Magnetic, Reveal, ScrollProgress, SpotlightCard, Stagger, StaggerItem, WordReveal, LITE, softBlur, unBlur } from "../lib/motion";

function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 25]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);
  // Mouse parallax
  const mx = useSpring(0, { stiffness: 60, damping: 20 });
  const my = useSpring(0, { stiffness: 60, damping: 20 });
  useEffect(() => {
    const h = (e: MouseEvent) => { mx.set((e.clientX / window.innerWidth - 0.5) * 30); my.set((e.clientY / window.innerHeight - 0.5) * 30); };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [mx, my]);
  const chipX = useTransform(mx, (v) => v * 1.4);
  const chipY = useTransform(my, (v) => v * 1.4);

  const chips = [
    { label: "kaspi-kz-verify.top", c: "#fb7185", x: "-6%", y: "12%", d: 0 },
    { label: "SMS code request", c: "#fb923c", x: "64%", y: "4%", d: 0.6 },
    { label: "5% / day", c: "#fbbf24", x: "70%", y: "70%", d: 1.2 },
    { label: "Verified: egov.kz", c: "#34d399", x: "-2%", y: "78%", d: 1.8 },
  ];
  return (
    <motion.div ref={ref} style={{ y, scale }} className="relative mx-auto aspect-square w-full max-w-[300px] sm:max-w-[420px]">
      <motion.div style={{ x: mx, y: my, rotate }} className="absolute inset-0">
        {[6, 20, 34].map((inset, i) => (
          <motion.div key={inset} className="absolute rounded-full border border-line" style={{ inset: `${inset}%` }}
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 - i * 0.25 }} transition={{ duration: 1.2, delay: 0.2 + i * 0.15, ease: EASE }} />
        ))}
        {/* orbiting dots */}
        {[{ r: 6, d: 14, c: "#22d3ee" }, { r: 20, d: 10, c: "#3b82f6" }, { r: 34, d: 7, c: "#34d399" }].map((o, i) => (
          <div key={i} className="absolute animate-spin" style={{ inset: `${o.r}%`, animationDuration: `${o.d}s`, animationDirection: i % 2 ? "reverse" : "normal" }}>
            <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: o.c, boxShadow: `0 0 14px ${o.c}` }} />
          </div>
        ))}
        <div className="absolute inset-[6%] animate-spin rounded-full"
          style={{ animationDuration: "9s", background: "conic-gradient(from 0deg, rgba(34,211,238,.22), transparent 22%)" }} />
      </motion.div>
      <div className="absolute inset-0 grid place-items-center">
        <motion.div initial={{ scale: 0.5, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
          whileHover={{ scale: 1.08, rotate: 3 }}
          className="relative rounded-[28px] p-3 shadow-glow" style={{ background: "rgba(10,17,34,.85)" }}>
          <span className="absolute inset-0 rounded-[28px] border border-cyan-400/40 animate-pulse-ring" />
          <div className="animate-float"><LogoMark size={112} /></div>
        </motion.div>
      </div>
      {chips.map((c) => (
        <motion.div key={c.label} className="absolute" style={{ left: c.x, top: c.y, x: chipX, y: chipY }}>
          <motion.div initial={{ opacity: 0, scale: 0.6, y: 14 }} animate={{ opacity: 1, scale: 1, y: LITE ? 0 : [0, -8, 0] }}
            transition={{ opacity: { delay: 0.9 + c.d * 0.4, duration: 0.5 }, scale: { delay: 0.9 + c.d * 0.4, type: "spring", stiffness: 260, damping: 16 }, y: { duration: 5, repeat: Infinity, delay: c.d, ease: "easeInOut" } }}
            whileHover={{ scale: 1.1 }}>
            <span className="chip whitespace-nowrap border-line bg-ink-850/90 py-1 font-mono text-[11px] text-slate-200 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: c.c }} /><span className="relative h-1.5 w-1.5 rounded-full" style={{ background: c.c, boxShadow: `0 0 8px ${c.c}` }} /></span>{c.label}
            </span>
          </motion.div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Example message typed out when it scrolls into view, then indicator chips pop in. */
function TypedExample({ text, chips }: { text: string; chips: [string, string][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); }, [text]);
  useEffect(() => {
    if (!inView || n >= text.length) return;
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 14);
    return () => clearTimeout(id);
  }, [inView, n, text]);
  const done = n >= text.length;
  return (
    <div ref={ref}>
      <motion.div initial={{ opacity: 0, x: -20, scale: 0.96 }} whileInView={{ opacity: 1, x: 0, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE }}
        className="relative overflow-hidden rounded-2xl rounded-tl-sm border border-line bg-ink-900 p-4 text-sm leading-relaxed text-slate-300">
        <p className="mb-1 font-mono text-[11px] text-slate-500">+7 7•• ••• •• 12 · WhatsApp</p>
        {text.slice(0, n)}
        {!done && <motion.span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-cyan-400" animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />}
        {done && <motion.div className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-hot-400/15 to-transparent" initial={{ top: "-20%" }} animate={{ top: "110%" }} transition={{ duration: 1.2, ease: "easeInOut" }} />}
      </motion.div>
      <div className="mt-4 flex min-h-[28px] flex-wrap gap-2 text-xs">
        <AnimatePresence>
          {done && chips.map(([c, l], i) => (
            <motion.span key={l} initial={{ opacity: 0, scale: 0.5, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.15, type: "spring", stiffness: 300, damping: 18 }}
              className="chip border-line bg-ink-900 text-slate-300"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />{l}</motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Looping illustration of Call Guard: call lines appear, flags light up, then the hang-up alert pulses. */
function CallGuardPreview() {
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-80px" });
  const [step, setStep] = useState(0);
  const phrases = {
    ru: ["«Служба безопасности банка…»", "«На вас оформлен кредит…»", "«Не кладите трубку!»", "«Продиктуйте код из СМС»"],
    kk: ["«Банк қауіпсіздік қызметі…»", "«Атыңызға несие рәсімделді…»", "«Тұтқаны қоймаңыз!»", "«SMS кодты айтыңыз»"],
    en: ["“Bank security service…”", "“A loan was taken in your name…”", "“Don't hang up!”", "“Read me the SMS code”"],
  }[lang];
  const lines = (["contact", "pretext", "pressure", "extraction"] as const).map((st, i) => (
    { text: phrases[i], flag: t.call.stages[st], risk: [20, 50, 60, 84][i] }
  ));
  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (lines.length + 3)), 1300);
    return () => clearInterval(id);
  }, [inView, lines.length]);
  const shown = Math.min(step, lines.length);
  const risk = shown ? lines[shown - 1].risk : 0;
  const alert = step >= lines.length;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-sm rounded-[2rem] border border-line bg-ink-900 p-4 shadow-glow" aria-hidden>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-slate-300"><PhoneCall size={14} className="text-cyan-400" />+7 7•• ••• •• 41</span>
        <span className="font-mono" style={{ color: risk >= 75 ? "#fb7185" : risk >= 50 ? "#fb923c" : risk ? "#fbbf24" : "#34d399" }}>{risk}/100</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-warn-400 via-orange-400 to-hot-400" animate={{ width: `${risk}%` }} transition={{ duration: 0.6, ease: EASE }} />
      </div>
      <div className="mt-4 min-h-[188px] space-y-2">
        <AnimatePresence>
          {lines.slice(0, shown).map((l) => (
            <motion.div key={l.text} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-2">
              <span className="rounded-2xl rounded-tl-sm border border-line bg-ink-850 px-3 py-1.5 text-xs text-slate-200">{l.text}</span>
              <span className="chip shrink-0 border-hot-400/30 text-[10px] text-hot-400">{l.flag}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {alert && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 grid place-items-center rounded-[2rem] bg-hot-500/30 backdrop-blur-sm">
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-hot-500 text-white shadow-[0_0_30px_#f43f5e]"><PhoneOff size={26} /></span>
              <p className="mt-3 font-display text-xl font-bold text-white">{t.call.alertTitle}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Landing() {
  const { t, lang } = useI18n();
  const L = t.landing;
  const howIcons = [ClipboardPaste, Eye, Sparkles, ShieldCheck];
  const capIcons = [Fingerprint, Globe, Lock, Landmark, Lightbulb, BadgeCheck];
  const cats: [string, typeof Globe][] = [
    ["phishing", ScanSearch], ["bank_impersonation", Building2], ["government_impersonation", Landmark], ["financial_pyramid", Triangle],
    ["investment_fraud", TrendingUp], ["delivery_scam", Package], ["prize_scam", Gift], ["job_scam", Briefcase], ["social_engineering", MessagesSquare],
  ];
  const exampleHref = `/analyze?type=message&demo=1&run=1&q=${encodeURIComponent(L.exampleMsg)}`;

  const { scrollY, scrollYProgress } = useScroll();
  const headerShadow = useTransform(scrollY, [0, 80], ["rgba(3,6,15,0)", "rgba(3,6,15,0.85)"]);
  const headerPad = useTransform(scrollY, [0, 80], [16, 10]);

  // Cursor spotlight in the hero
  const sx = useMotionValue(-500);
  const sy = useMotionValue(-500);
  const spotlight = useMotionTemplate`radial-gradient(500px circle at ${sx}px ${sy}px, rgba(34,211,238,0.09), transparent 70%)`;

  return (
    <div className="overflow-x-hidden">
      <ScrollProgress progress={scrollYProgress} />
      <motion.header style={{ backgroundColor: headerShadow }} className="sticky top-0 z-40 border-b border-line/60 backdrop-blur">
        <motion.div style={{ paddingTop: headerPad, paddingBottom: headerPad }} className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE }}><Link to="/"><Logo /></Link></motion.div>
          <Stagger as="div" className="hidden items-center gap-6 whitespace-nowrap text-sm text-slate-400 lg:flex" delay={0.2}>
            {[["/analyze", t.nav.analyze], ["/dashboard", t.nav.dashboard], ["/learn", t.nav.learn], ["/demo", t.nav.demo]].map(([to, label]) => (
              <StaggerItem key={to}>
                <Link to={to} className="group relative py-1 transition-colors hover:text-white">
                  {label}
                  <span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-cyan-400 transition-transform duration-300 group-hover:scale-x-100" />
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex items-center gap-2">
            <LangSwitch />
            <Link to="/analyze" className="btn-primary hidden whitespace-nowrap py-2 sm:inline-flex">{L.cta}</Link>
          </motion.div>
        </motion.div>
      </motion.header>

      {/* Hero */}
      <section className="relative" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); sx.set(e.clientX - r.left); sy.set(e.clientY - r.top); }}
        onMouseLeave={() => { sx.set(-500); sy.set(-500); }}>
        <motion.div className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />
        <div className={cx("pointer-events-none absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]", !LITE && "animate-grid-pan")} />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div key={lang}>
            <motion.p initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}
              className="chip border-glow mb-6 rounded-full border-cyan-400/30 bg-cyan-400/5 text-cyan-300">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full bg-safe-400 animate-pulse-ring" /><span className="relative h-1.5 w-1.5 rounded-full bg-safe-400 shadow-[0_0_8px_#34d399]" /></span>{L.eyebrow}
            </motion.p>
            <h1 className="font-display text-[34px] font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl xl:text-6xl">
              <WordReveal text={L.title1} delay={0.1} />
              <br />
              <WordReveal text={L.title2} delay={0.35} className="text-shimmer" />
            </h1>
            <motion.p initial={{ opacity: 0, y: 16, ...softBlur(6) }} animate={{ opacity: 1, y: 0, ...unBlur }} transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
              className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">{L.subtitle}</motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.8, ease: EASE }} className="mt-8 flex flex-wrap gap-3">
              <Magnetic><Link to="/analyze" className="btn-primary px-5 py-3 text-[15px]"><ScanSearch size={18} />{L.cta}</Link></Magnetic>
              <Magnetic strength={0.15}><Link to="/dashboard" className="btn-ghost px-5 py-3 text-[15px]"><LayoutDashboard size={18} />{L.cta2}</Link></Magnetic>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} className="mt-6 text-xs text-slate-500">{L.langs} · Қазақша · Русский · English</motion.p>
          </div>
          <HeroVisual />
        </div>
        {/* scroll cue */}
        <motion.div className="absolute bottom-4 left-1/2 hidden h-9 w-5 -translate-x-1/2 rounded-full border border-line lg:block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
          <motion.span className="absolute left-1/2 top-1.5 h-1.5 w-1 -translate-x-1/2 rounded-full bg-cyan-400" animate={{ y: [0, 14, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      </section>

      {/* Category marquee */}
      <section className="relative border-y border-line/60 bg-ink-900/40 py-5 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="animate-marquee flex w-max gap-3">
          {[...cats, ...cats].map(([id, I], i) => (
            <span key={i} className="chip shrink-0 border-line bg-ink-850 px-3.5 py-2 text-sm text-slate-300 transition-colors duration-300 hover:border-cyan-400/40 hover:text-white">
              <I size={15} className="text-cyan-400" />{t.threatTypes[id]}
            </span>
          ))}
        </div>
      </section>

      {/* Call Guard */}
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-2xl font-semibold leading-tight text-white sm:text-4xl">{t.call.featureTitle}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{t.call.featureBody}</p>
            <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["contact", "pretext", "pressure", "extraction"] as const).map((st, i) => (
                <li key={st} className="rounded-xl border border-line bg-ink-900/60 px-3 py-2 text-xs text-slate-300"><span className="mr-1 font-mono text-cyan-400">{i + 1}</span>{t.call.stages[st]}</li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap gap-3">
              <Magnetic><Link to="/call-guard" className="btn-primary px-5 py-3"><PhoneCall size={17} />{t.call.tryLive}</Link></Magnetic>
              <Link to="/call-guard?simulate=1" className="btn-ghost px-5 py-3">{t.call.simulate}</Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}><CallGuardPreview /></Reveal>
        </div>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <Reveal className="max-w-3xl">
          <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">{L.introTitle}</h2>
          <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2, ease: EASE }}
            className="mt-4 h-[2px] w-24 origin-left rounded-full bg-gradient-to-r from-cyan-400 to-transparent" />
          <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{L.intro}</p>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <Reveal><h2 className="label mb-6">{L.howTitle}</h2></Reveal>
        <div className="relative">
          {/* connecting line that draws itself */}
          <motion.div className="absolute left-0 right-0 top-[42px] hidden h-px origin-left bg-gradient-to-r from-cyan-400/50 via-volt-400/40 to-safe-400/50 lg:block"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 1.6, ease: EASE }} />
          <Stagger inView stagger={0.12} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {L.how.map(([title, body], i) => {
              const I = howIcons[i];
              return (
                <StaggerItem key={title}>
                  <SpotlightCard className="panel panel-pad h-full">
                    <span className="absolute right-5 top-5 font-mono text-xs text-slate-600">0{i + 1}</span>
                    <motion.span className="relative grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/30 bg-ink-900 text-cyan-400"
                      whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }} transition={{ duration: 0.5 }}>
                      <I size={20} />
                    </motion.span>
                    <h3 className="relative mt-4 font-semibold text-white">{title}</h3>
                    <p className="relative mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <Reveal><h2 className="font-display mb-8 text-2xl font-semibold text-white sm:text-3xl">{L.capTitle}</h2></Reveal>
        <Stagger inView stagger={0.08} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {L.caps.map(([title, body], i) => {
            const I = capIcons[i];
            return (
              <StaggerItem key={title}>
                <SpotlightCard className="group h-full rounded-2xl border border-line bg-ink-900 p-6 transition-colors duration-500 hover:border-cyan-400/30">
                  <motion.span className="relative inline-grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-400 transition-all duration-500 group-hover:bg-cyan-400 group-hover:text-ink-950 group-hover:shadow-[0_0_24px_rgba(34,211,238,.5)]">
                    <I size={19} />
                  </motion.span>
                  <h3 className="relative mt-4 font-semibold text-white">{title}</h3>
                  <p className="relative mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
                </SpotlightCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* Stats (demo) + example */}
      <section className="mx-auto grid max-w-[1200px] gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <SpotlightCard tilt={false} className="panel panel-pad h-full">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-white">{L.statsTitle}</h2>
              <span className="chip border-warn-400/40 bg-warn-400/10 text-[10px] uppercase tracking-wider text-warn-400">{t.common.demoData}</span>
            </div>
            <Stagger inView stagger={0.1} className="grid grid-cols-2 gap-4">
              {L.stats.map(([v, l]) => (
                <StaggerItem key={l}>
                  <motion.div whileHover={{ y: -3, borderColor: "rgba(34,211,238,.35)" }} className="h-full rounded-xl border border-line bg-ink-900/60 p-4">
                    <CountUp value={v} className="font-display text-2xl font-semibold text-white" />
                    <p className="mt-1 text-xs text-slate-400">{l}</p>
                  </motion.div>
                </StaggerItem>
              ))}
            </Stagger>
            <p className="relative mt-4 text-[11px] text-slate-500">{L.statsNote}</p>
          </SpotlightCard>
        </Reveal>

        <Reveal delay={0.1}>
          <SpotlightCard tilt={false} className="panel panel-pad h-full">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-white">{L.exampleTitle}</h2>
              <span className="chip border-volt-400/40 bg-volt-400/10 text-[10px] uppercase tracking-wider text-blue-300">{t.common.testExample}</span>
            </div>
            <TypedExample text={L.exampleMsg}
              chips={[["#fb7185", t.threatTypes.bank_impersonation], ["#fb923c", "kaspi-kz-verify.top"], ["#fb923c", "SMS code"], ["#fbbf24", "24h"]]} />
            <p className="relative mt-4 text-[11px] text-slate-500">{L.exampleNote}</p>
            <Magnetic strength={0.2} className="relative mt-4">
              <Link to={exampleHref} className="btn-primary group">{L.tryIt}<ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></Link>
            </Magnetic>
          </SpotlightCard>
        </Reveal>
      </section>

      <motion.footer initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="mt-12 border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Logo />
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{L.footer}</p>
          </div>
          <Stagger inView as="div" stagger={0.05} className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-slate-400">
            {[["/analyze", t.nav.analyze], ["/dashboard", t.nav.dashboard], ["/intel", t.nav.intel], ["/history", t.nav.history], ["/learn", t.nav.learn], ["/demo", t.nav.demo]].map(([to, label]) => (
              <StaggerItem key={to}><Link to={to} className="inline-block transition-all duration-300 hover:translate-x-1 hover:text-white">{label}</Link></StaggerItem>
            ))}
          </Stagger>
        </div>
      </motion.footer>
    </div>
  );
}
