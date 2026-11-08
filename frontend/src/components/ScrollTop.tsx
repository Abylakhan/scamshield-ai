import { AnimatePresence, motion, useScroll } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";

/** Floating "back to top" button with a ring that fills with scroll progress. */
export function ScrollTop() {
  const { t } = useI18n();
  const { scrollYProgress } = useScroll();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Native listener: visibility must not depend on animation frames.
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 20 }}
          whileHover={{ y: -3 }} whileTap={{ scale: 0.9 }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t.ui.toTop} title={t.ui.toTop}
          className="fixed bottom-20 right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-line bg-ink-900/90 text-cyan-300 shadow-glow backdrop-blur lg:bottom-6 lg:right-6 print:hidden">
          <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
            <motion.circle cx="22" cy="22" r="20" fill="none" stroke="#22d3ee" strokeWidth="2" style={{ pathLength: scrollYProgress }} />
          </svg>
          <ArrowUp size={17} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
