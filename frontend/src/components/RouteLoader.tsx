import { motion } from "framer-motion";
import { useI18n } from "../lib/i18n";
import { Skeleton } from "./ui";

/** Suspense fallback while a lazily loaded page downloads: indeterminate top bar + content skeleton. */
export function RouteLoader() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-label={t.ui.loading}>
      <div className="fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden" aria-hidden>
        <motion.div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
          animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <Skeleton className="mb-4 h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
      </div>
      <Skeleton className="mt-4 h-64" />
    </div>
  );
}
