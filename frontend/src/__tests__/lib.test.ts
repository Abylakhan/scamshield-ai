import { describe, expect, it } from "vitest";
import { ApiError, errorKind } from "../lib/api";
import { evidenceSpans } from "../lib/highlight";
import { DICTS } from "../lib/i18n";
import type { Indicator } from "../lib/types";

const ind = (over: Partial<Indicator>): Indicator => ({
  id: "x", name: "x", description: "", severity: "high", weight: 10, category: "social_engineering", contribution: 10,
  source: "heuristic", evidence: null, evidence_type: "content", verified: true, ...over,
});

describe("evidenceSpans", () => {
  it("finds evidence case-insensitively and in order", () => {
    const spans = evidenceSpans("СРОЧНО сообщите код из СМС", [ind({ id: "otp", evidence: "сообщите код из смс" }), ind({ id: "urg", evidence: "срочно" })]);
    expect(spans.map((s) => [s.start, s.ind.id])).toEqual([[0, "urg"], [7, "otp"]]);
  });
  it("splits derived evidence and skips external evidence", () => {
    const spans = evidenceSpans("kaspi-bonus.top/login", [
      ind({ id: "combo", evidence: "kaspi + login", evidence_type: "derived" }),
      ind({ id: "age", evidence: "registered 3 days ago", evidence_type: "external" }),
    ]);
    expect(spans.map((s) => s.ind.id)).toEqual(["combo", "combo"]);
  });
  it("never produces overlapping spans", () => {
    const spans = evidenceSpans("transfer money now", [ind({ evidence: "transfer money" }), ind({ evidence: "money now" })]);
    expect(spans).toHaveLength(1);
  });
  it("treats markup as plain text", () => {
    const spans = evidenceSpans("<script>alert(1)</script>", [ind({ evidence: "<script>" })]);
    expect(spans[0]).toMatchObject({ start: 0, end: 8 });
  });
});

describe("errorKind", () => {
  it("maps statuses to user-facing error kinds", () => {
    expect(errorKind(new ApiError(0, "network"))).toBe("network");
    expect(errorKind(new ApiError(408, "timeout"))).toBe("timeout");
    expect(errorKind(new ApiError(422, "Invalid input"))).toBe("invalid");
    expect(errorKind(new ApiError(429, "slow down"))).toBe("rateLimit");
    expect(errorKind(new ApiError(503, "db"))).toBe("unavailable");
    expect(errorKind(new Error("boom"))).toBe("server");
  });
});

describe("i18n", () => {
  const keys = (o: object, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  it("Russian and Kazakh dictionaries have every English key", () => {
    const en = keys(DICTS.en).sort();
    expect(keys(DICTS.ru).sort()).toEqual(en);
    expect(keys(DICTS.kk).sort()).toEqual(en);
  });
});
