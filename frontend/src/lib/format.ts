import type { Lang, RiskLevel } from "./types";

export const RISK_COLOR: Record<RiskLevel, string> = {
  low: "#34d399",
  moderate: "#fbbf24",
  high: "#fb923c",
  critical: "#fb7185",
};

export const SEVERITY_COLOR: Record<string, string> = {
  info: "#7ee8fa",
  low: "#94a3b8",
  medium: "#fbbf24",
  high: "#fb923c",
  critical: "#fb7185",
};

const LOCALE: Record<Lang, string> = { en: "en-GB", ru: "ru-RU", kk: "kk-KZ" };

export function fmtDate(iso: string | null | undefined, lang: Lang, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(LOCALE[lang], withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" });
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
