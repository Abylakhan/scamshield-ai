import type { Indicator } from "./types";

export interface EvidenceSpan { start: number; end: number; ind: Indicator }

/**
 * Locate each indicator's evidence in the content (case-insensitive). Derived indicators contribute each of
 * their excerpts; external-check evidence is not part of the content and is skipped. Overlaps keep the earliest,
 * longest match so spans never nest.
 */
export function evidenceSpans(content: string, indicators: Indicator[]): EvidenceSpan[] {
  const lower = content.toLowerCase();
  const found: EvidenceSpan[] = [];
  for (const ind of indicators) {
    if (!ind.evidence || ind.evidence_type === "external") continue;
    const parts = ind.evidence_type === "derived" ? ind.evidence.split(" + ") : [ind.evidence];
    for (const part of parts) {
      const needle = part.toLowerCase().trim();
      if (needle.length < 2) continue;
      const at = lower.indexOf(needle);
      if (at >= 0) found.push({ start: at, end: at + needle.length, ind });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: EvidenceSpan[] = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.start < last.end) continue;
    merged.push(f);
  }
  return merged;
}
