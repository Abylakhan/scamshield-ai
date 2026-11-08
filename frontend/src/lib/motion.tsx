import { animate, motion, type MotionValue, useInView, useMotionTemplate, useMotionValue, useSpring, useTransform, type HTMLMotionProps, type Variants } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Shared easing — a soft "expo out" used across the app. */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
};

export const staggerParent = (stagger = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Reveals children when scrolled into view. */
export function Reveal({ children, delay = 0, className, y = 18 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y, filter: "blur(6px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.7, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Staggered container: direct <StaggerItem> children animate in sequence. */
export function Stagger({ children, className, stagger = 0.07, delay = 0, inView = false, as = "div" }:
  { children: ReactNode; className?: string; stagger?: number; delay?: number; inView?: boolean; as?: "div" | "ul" | "ol" }) {
  const C = motion[as];
  const trigger = inView ? { whileInView: "show", viewport: { once: true, margin: "-40px" } } : { animate: "show" };
  return <C className={className} variants={staggerParent(stagger, delay)} initial="hidden" {...trigger}>{children}</C>;
}

export function StaggerItem({ children, className, as = "div", ...rest }: { children: ReactNode; className?: string; as?: "div" | "li" } & Omit<HTMLMotionProps<"div">, "children">) {
  const C = motion[as] as typeof motion.div;
  return <C className={className} variants={fadeUp} {...rest}>{children}</C>;
}

/** Number that counts up when it enters the viewport. Non-numeric prefixes/suffixes are preserved. */
export function CountUp({ value, duration = 1.4, decimals, className }: { value: number | string; duration?: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const str = String(value);
  const m = str.match(/^([^\d]*)([\d\s.,]+)(.*)$/);
  const prefix = m?.[1] ?? "";
  const suffix = (m?.[2].match(/\s+$/)?.[0] ?? "") + (m?.[3] ?? "");
  const raw = m ? m[2].trim() : "";
  const num = m ? parseFloat(raw.replace(/\s/g, "").replace(",", ".")) : NaN;
  const dec = decimals ?? (raw.includes(".") || raw.includes(",") ? (raw.split(/[.,]/)[1]?.length ?? 0) : 0);
  const sep = raw.includes(",") ? "," : ".";
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView || isNaN(num)) return;
    const c = animate(from.current, num, { duration, ease: EASE, onUpdate: (v) => { from.current = v; setShown(v); } });
    return c.stop;
  }, [inView, num, duration]);
  if (isNaN(num)) return <span className={className}>{str}</span>;
  const grouped = raw.includes(" ") ? Math.round(shown).toLocaleString("ru-RU") : shown.toFixed(dec).replace(".", sep);
  return <span ref={ref} className={className}>{prefix}{grouped}{suffix}</span>;
}

/** Card that lifts on hover, tilts slightly toward the cursor and shows a cyan spotlight. */
export function SpotlightCard({ children, className, tilt = true, ...rest }: { children: ReactNode; className?: string; tilt?: boolean } & Omit<HTMLMotionProps<"div">, "children">) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const rx = useSpring(0, { stiffness: 200, damping: 20 });
  const ry = useSpring(0, { stiffness: 200, damping: 20 });
  const bg = useMotionTemplate`radial-gradient(320px circle at ${mx}px ${my}px, rgba(34,211,238,0.10), transparent 70%)`;
  return (
    <motion.div ref={ref} className={`relative ${className ?? ""}`} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        mx.set(e.clientX - r.left); my.set(e.clientY - r.top);
        if (tilt) { ry.set(((e.clientX - r.left) / r.width - 0.5) * 6); rx.set(-((e.clientY - r.top) / r.height - 0.5) * 6); }
      }}
      onMouseLeave={() => { rx.set(0); ry.set(0); mx.set(-200); my.set(-200); }} {...rest}>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: bg }} />
      {children}
    </motion.div>
  );
}

/** Element gently follows the cursor (for primary CTAs). */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 15 });
  const y = useSpring(0, { stiffness: 220, damping: 15 });
  return (
    <motion.div ref={ref} className={`inline-block ${className ?? ""}`} style={{ x, y }}
      onMouseMove={(e) => { const r = ref.current!.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength); }}
      onMouseLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.div>
  );
}

/** Text that appears word by word. */
export function WordReveal({ text, className, delay = 0, stagger = 0.06 }: { text: string; className?: string; delay?: number; stagger?: number }) {
  return (
    <motion.span className={className} initial="hidden" animate="show" variants={staggerParent(stagger, delay)} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span className="inline-block" variants={{ hidden: { y: "110%", opacity: 0 }, show: { y: "0%", opacity: 1, transition: { duration: 0.75, ease: EASE } } }}>
            {w}{i < text.split(" ").length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Fixed, slowly drifting aurora orbs + subtle particles behind the whole app. */
export function AnimatedBackground() {
  const dots = useRef(Array.from({ length: 26 }, () => ({
    x: Math.random() * 100, y: Math.random() * 100, s: 1 + Math.random() * 1.8, d: 8 + Math.random() * 14, delay: Math.random() * 8,
  }))).current;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-volt-500/20 blur-[120px]"
        animate={{ x: [0, 120, 40, 0], y: [0, 60, 140, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute -right-32 top-1/4 h-[460px] w-[460px] rounded-full bg-cyan-500/[0.12] blur-[120px]"
        animate={{ x: [0, -100, -30, 0], y: [0, 80, -60, 0] }} transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute bottom-[-200px] left-1/3 h-[420px] w-[420px] rounded-full bg-safe-500/[0.07] blur-[120px]"
        animate={{ x: [0, 80, -60, 0], y: [0, -50, 20, 0] }} transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }} />
      {dots.map((d, i) => (
        <motion.span key={i} className="absolute rounded-full bg-cyan-300/50" style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s }}
          animate={{ y: [0, -40, 0], opacity: [0, 0.8, 0] }} transition={{ duration: d.d, delay: d.delay, repeat: Infinity, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

/** Wrapper for route content: soft blur/slide transition. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.45, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Scroll-progress bar at the top of the page. */
export function ScrollProgress({ progress }: { progress: MotionValue<number> }) {
  const scaleX = useSpring(progress, { stiffness: 120, damping: 25 });
  const opacity = useTransform(progress, [0, 0.02], [0, 1]);
  return <motion.div className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-cyan-400 via-volt-400 to-safe-400" style={{ scaleX, opacity }} />;
}

/** Soft cyan glow that follows the cursor across the app (desktop pointers only; off with reduced motion). */
export function CursorGlow() {
  const enabled = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const x = useSpring(-600, { stiffness: 120, damping: 24 });
  const y = useSpring(-600, { stiffness: 120, damping: 24 });
  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => { x.set(e.clientX - 250); y.set(e.clientY - 250); };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [enabled, x, y]);
  if (!enabled) return null;
  return (
    <motion.div aria-hidden className="pointer-events-none fixed left-0 top-0 -z-10 h-[500px] w-[500px] rounded-full print:hidden"
      style={{ x, y, background: "radial-gradient(circle, rgba(34,211,238,0.07), transparent 65%)" }} />
  );
}
