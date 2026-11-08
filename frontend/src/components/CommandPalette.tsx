import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen, CornerDownLeft, FlaskConical, Globe, History, Home, Languages, LayoutDashboard, Link2, PhoneCall, Presentation, Radar,
  ScanSearch, Search, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LANG_LABELS, useI18n } from "../lib/i18n";
import { cx } from "../lib/format";
import type { Lang } from "../lib/types";

export const OPEN_PALETTE_EVENT = "scamshield:palette";
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));

interface Item { id: string; group: "pages" | "actions"; label: string; icon: LucideIcon; run: () => void }

export function CommandPalette() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_PALETTE_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQuery(""); setActive(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => nav(to);
    const pages: Item[] = [
      { id: "home", group: "pages", label: t.nav.home, icon: Home, run: go("/") },
      { id: "analyze", group: "pages", label: t.nav.analyze, icon: ScanSearch, run: go("/analyze") },
      { id: "call", group: "pages", label: t.nav.callGuard, icon: PhoneCall, run: go("/call-guard") },
      { id: "dashboard", group: "pages", label: t.nav.dashboard, icon: LayoutDashboard, run: go("/dashboard") },
      { id: "history", group: "pages", label: t.nav.history, icon: History, run: go("/history") },
      { id: "intel", group: "pages", label: t.nav.intel, icon: Radar, run: go("/intel") },
      { id: "learn", group: "pages", label: t.nav.learn, icon: BookOpen, run: go("/learn") },
      { id: "demo", group: "pages", label: t.nav.demo, icon: Presentation, run: go("/demo") },
    ];
    const P = t.ui.palette;
    const actions: Item[] = [
      { id: "a-new", group: "actions", label: P.newAnalysis, icon: ScanSearch, run: go("/analyze?type=message") },
      { id: "a-url", group: "actions", label: P.checkUrl, icon: Link2, run: go("/analyze?type=url") },
      { id: "a-call", group: "actions", label: P.simulateCall, icon: PhoneCall, run: go("/call-guard?simulate=1") },
      { id: "a-example", group: "actions", label: P.runExample, icon: FlaskConical,
        run: go(`/analyze?type=message&demo=1&run=1&q=${encodeURIComponent(t.landing.exampleMsg)}`) },
      ...(["kk", "ru", "en"] as Lang[]).filter((l) => l !== lang).map((l) => ({
        id: `lang-${l}`, group: "actions" as const, label: `${P.lang} ${LANG_LABELS[l]}`, icon: l === "en" ? Globe : Languages, run: () => setLang(l),
      })),
    ];
    return [...pages, ...actions];
  }, [t, lang, nav, setLang]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  }, [items, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (i: Item | undefined) => { if (!i) return; setOpen(false); i.run(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(filtered[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  let idx = -1;
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[85] flex items-start justify-center bg-ink-950/70 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <motion.div role="dialog" aria-modal="true" aria-label={t.ui.palette.open}
            initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="border-glow w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-[0_30px_80px_-20px_rgba(34,211,238,.35)]">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={17} className="text-cyan-400" aria-hidden />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                placeholder={t.ui.palette.placeholder} aria-label={t.ui.palette.placeholder} role="combobox" aria-expanded="true" aria-controls="palette-list"
                aria-activedescendant={filtered[active] ? `pal-${filtered[active].id}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-slate-500 focus:outline-none" />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-slate-500">Esc</kbd>
            </div>
            <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">{t.ui.palette.none}</li>}
              {(["pages", "actions"] as const).map((g) => {
                const groupItems = filtered.filter((i) => i.group === g);
                if (!groupItems.length) return null;
                return (
                  <li key={g} role="presentation">
                    <p className="label px-3 pb-1 pt-2">{g === "pages" ? t.ui.palette.pages : t.ui.palette.actions}</p>
                    <ul role="presentation">
                      {groupItems.map((i) => {
                        idx++;
                        const my = idx;
                        const Icon = i.icon;
                        const on = my === active;
                        return (
                          <motion.li key={i.id} id={`pal-${i.id}`} data-idx={my} role="option" aria-selected={on}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(my, 12) * 0.02 }}
                            onMouseEnter={() => setActive(my)} onClick={() => choose(i)}
                            className={cx("relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm", on ? "text-white" : "text-slate-300")}>
                            {on && <motion.span layoutId="palette-active" className="absolute inset-0 rounded-xl bg-cyan-400/10 ring-1 ring-cyan-400/25" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                            <Icon size={16} className={cx("relative", on ? "text-cyan-300" : "text-slate-500")} aria-hidden />
                            <span className="relative flex-1">{i.label}</span>
                            {on && <CornerDownLeft size={14} className="relative text-slate-500" aria-hidden />}
                          </motion.li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-slate-500">{t.ui.palette.hint}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
