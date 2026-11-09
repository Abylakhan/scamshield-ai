import { AnimatePresence, motion } from "framer-motion";
import { Stagger, StaggerItem, softBlur, unBlur } from "../lib/motion";
import { AlertTriangle, Brain, CheckCircle2, Fish, Link as LinkIcon, MessageCircle, Smartphone, TrendingUp, Triangle } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../components/ui";
import { cx } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { LEARN } from "../lib/learn";

const ICONS = { Fish, Smartphone, Triangle, Brain, TrendingUp, Link: LinkIcon, MessageCircle } as const;

export default function Learn() {
  const { t, lang } = useI18n();
  const topics = LEARN[lang];
  const [active, setActive] = useState(topics[0].id);
  const topic = topics.find((x) => x.id === active) ?? topics[0];
  const Icon = ICONS[topic.icon as keyof typeof ICONS];

  return (
    <>
      <PageHeader title={t.learn.title} subtitle={t.learn.subtitle} />
      <div className="relative grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Stagger as="div" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" stagger={0.05} key={lang}>
          {topics.map((x) => {
            const I = ICONS[x.icon as keyof typeof ICONS];
            return (
              <StaggerItem key={x.id} className="shrink-0">
                <motion.button onClick={() => setActive(x.id)} aria-current={active === x.id} whileTap={{ scale: 0.97 }}
                  className={cx("group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors duration-300",
                    active === x.id ? "border-cyan-400/40 text-cyan-100" : "border-line bg-ink-900/50 text-slate-400 hover:border-cyan-400/20 hover:text-white")}>
                  {active === x.id && <motion.span layoutId="learn-pill" className="absolute inset-0 rounded-xl bg-cyan-400/10" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                  <I size={16} className="relative shrink-0 transition-transform duration-300 group-hover:scale-110" />
                  <span className="relative whitespace-nowrap lg:whitespace-normal">{x.title}</span>
                </motion.button>
              </StaggerItem>
            );
          })}
        </Stagger>

        <AnimatePresence mode="popLayout">
        <motion.article key={topic.id + lang} initial={{ opacity: 0, x: 24, ...softBlur(6) }} animate={{ opacity: 1, x: 0, ...unBlur }}
          exit={{ opacity: 0, x: -24, ...softBlur(6) }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="panel panel-pad">
          <div className="mb-4 flex items-center gap-3">
            <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
              className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,.2)]"><Icon size={20} /></motion.span>
            <h2 className="font-display text-xl font-semibold text-white">{topic.title}</h2>
          </div>
          <p className="max-w-3xl text-[15px] leading-relaxed text-slate-300">{topic.intro}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} whileHover={{ y: -3 }} className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-4">
              <h3 className="label mb-3 flex items-center gap-2 text-orange-300"><AlertTriangle size={13} />{t.learn.signs}</h3>
              <Stagger as="ul" className="space-y-2" delay={0.2} stagger={0.08}>{topic.signs.map((s) => <StaggerItem as="li" key={s} className="flex gap-2 text-sm text-slate-300"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-orange-400 shadow-[0_0_6px_#fb923c]" />{s}</StaggerItem>)}</Stagger>
            </motion.section>
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} whileHover={{ y: -3 }} className="rounded-xl border border-safe-400/20 bg-safe-400/5 p-4">
              <h3 className="label mb-3 flex items-center gap-2 text-safe-400"><CheckCircle2 size={13} />{t.learn.actions}</h3>
              <Stagger as="ul" className="space-y-2" delay={0.35} stagger={0.08}>{topic.actions.map((s) => <StaggerItem as="li" key={s} className="flex gap-2 text-sm text-slate-300"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-safe-400 shadow-[0_0_6px_#34d399]" />{s}</StaggerItem>)}</Stagger>
            </motion.section>
          </div>
        </motion.article>
        </AnimatePresence>
      </div>
    </>
  );
}
