"""Explainable multi-layer risk scoring engine (the only place a risk score is calculated).

Algorithm (all parameters come from the ruleset, see ruleset.json):

1. **Deduplicate** — each indicator id counts once, however often it matched.
2. **Group** related indicators inside a category (e.g. otp_request + credential_request). The strongest
   member of a group counts fully; each further member counts at `group_decay` of its weight.
3. **Category score** — groups combine with diminishing returns, then the category is capped:
       cat = min(cap, 100 · (1 − Π(1 − gᵢ/100)))
4. **Raw score** — independent categories compound the same way:  raw = 100 · (1 − Π(1 − cat/100))
5. **Mitigation** — verified legitimacy signals (official domain, "never share this code" notices) subtract.
6. **Breakdown** — the final score is split across categories in proportion to −ln(1 − cat/100), each category's
   share of the compounded total, with largest-remainder rounding so the parts always sum to the score.

Missing data adds nothing: an unavailable check produces no indicator, it only lowers confidence.
Confidence (evidence coverage) is computed separately and is not a probability of fraud.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

from ..schemas import CheckResult, Indicator
from .ruleset import CATEGORIES, RuleSet, get_ruleset
from .text_rules import CATEGORY_OF

LEVELS = (("critical", 75), ("high", 50), ("moderate", 25), ("low", 0))
PHISHING_IDS = {"brand_lookalike", "typosquat", "password_form", "card_form", "homograph", "phishing_url_combo"}


def risk_level(score: int) -> str:
    for level, floor in LEVELS:
        if score >= floor:
            return level
    return "low"


@dataclass
class ScoreResult:
    score: int
    raw: float
    mitigation: float
    breakdown: dict[str, int]
    categories: dict[str, dict] = field(default_factory=dict)
    indicators: list[Indicator] = field(default_factory=list)

    def details(self, rs: RuleSet) -> dict:
        return {
            "ruleset_version": rs.version,
            "raw_score": round(self.raw, 1),
            "mitigation": round(self.mitigation, 1),
            "categories": self.categories,
            "method": "category noisy-OR with group decay and caps; breakdown sums to risk_score",
        }


def _noisy_or(values: list[float]) -> float:
    remaining = 1.0
    for v in values:
        remaining *= 1 - min(max(v, 0.0), 99.0) / 100
    return 100 * (1 - remaining)


def _allocate(total: int, shares: dict[str, float]) -> dict[str, int]:
    """Split an integer total proportionally, largest remainder first, so parts sum exactly to total."""
    out = {c: 0 for c in CATEGORIES}
    s = sum(shares.values())
    if total <= 0 or s <= 0:
        return out
    exact = {c: total * v / s for c, v in shares.items()}
    for c, v in exact.items():
        out[c] = math.floor(v)
    rest = total - sum(out.values())
    for c in sorted(exact, key=lambda c: (exact[c] - math.floor(exact[c]), exact[c]), reverse=True)[:rest]:
        out[c] += 1
    return out


def score_indicators(indicators: list[Indicator], rs: RuleSet | None = None) -> ScoreResult:
    rs = rs or get_ruleset()
    # 1. dedupe, keeping the first occurrence (evidence from the earliest match)
    unique: dict[str, Indicator] = {}
    for ind in indicators:
        if ind.source == "ai" or not ind.verified:
            continue  # AI context never influences the score
        unique.setdefault(ind.id, ind)

    # Re-apply the ruleset so stored or externally-built indicators can't carry stale weights.
    scored: list[Indicator] = []
    for ind in unique.values():
        sp = rs.spec(ind.id)
        scored.append(ind.model_copy(update={"weight": sp.weight, "severity": sp.severity, "category": sp.category, "group": sp.group}))

    mitigation = float(sum(-i.weight for i in scored if i.category == "mitigation"))
    contributions: dict[str, float] = {}
    categories: dict[str, dict] = {}
    cat_scores: dict[str, float] = {}
    for cat in CATEGORIES:
        members = [i for i in scored if i.category == cat]
        groups: dict[str, list[Indicator]] = defaultdict(list)
        for i in members:
            groups[i.group or f"_{i.id}"].append(i)
        group_values: list[float] = []
        for g in groups.values():
            g.sort(key=lambda i: -i.weight)
            value = 0.0
            for rank, i in enumerate(g):
                eff = i.weight if rank == 0 else i.weight * rs.group_decay
                contributions[i.id] = round(eff, 1)
                value += eff
            group_values.append(min(value, 95.0))
        uncapped = _noisy_or(group_values)
        cap = rs.category_caps[cat]
        cat_scores[cat] = min(uncapped, cap)
        categories[cat] = {"score": round(cat_scores[cat], 1), "uncapped": round(uncapped, 1), "cap": cap,
                           "indicators": len(members), "groups": len(groups)}

    raw = _noisy_or(list(cat_scores.values()))
    final = max(0, min(100, round(raw - mitigation)))
    shares = {c: -math.log(1 - min(v, 99.0) / 100) for c, v in cat_scores.items() if v > 0}
    breakdown = _allocate(final, shares)

    for i in scored:
        i.contribution = contributions.get(i.id, float(i.weight) if i.category == "mitigation" else 0.0)
    scored.sort(key=lambda i: (-abs(i.contribution), i.id))
    return ScoreResult(score=final, raw=raw, mitigation=mitigation, breakdown=breakdown, categories=categories, indicators=scored)


def compute_score(indicators: list[Indicator]) -> int:
    return score_indicators(indicators).score


def classify(indicators: list[Indicator], score: int, input_type: str) -> str:
    """Threat type from the strongest scam pattern among verified indicators."""
    if score < 25:
        return "safe" if score < 15 else "suspicious"
    weights: dict[str, float] = defaultdict(float)
    for i in indicators:
        if i.weight <= 0 or not i.verified:
            continue
        threat = CATEGORY_OF.get(i.id) or ("malicious_url" if i.category in ("technical", "phishing") else None)
        if threat:
            weights[threat] += i.weight
    for specific in ("financial_pyramid", "investment_fraud", "delivery_scam", "prize_scam", "job_scam",
                     "government_impersonation", "bank_impersonation"):
        if weights.get(specific, 0) >= 20:
            return specific
    if weights.get("phishing", 0) >= 20:
        return "phishing"
    if input_type == "url" and weights.get("malicious_url"):
        return "phishing" if any(i.id in PHISHING_IDS for i in indicators) else "malicious_url"
    if weights:
        return max(weights, key=weights.get)
    return "suspicious"


def confidence(indicators: list[Indicator], checks: list[CheckResult], text_len: int, ai_used: bool) -> float:
    """Evidence coverage, 0.3–0.97. Independent categories and completed checks raise it; checks that could
    not run lower it (missing data reduces certainty, never increases risk)."""
    positives = [i for i in indicators if i.weight > 0 and i.verified]
    done = sum(1 for ch in checks if ch.status in ("passed", "flagged"))
    missing = sum(1 for ch in checks if ch.status in ("unavailable", "error"))
    if positives:
        cats = {i.category for i in positives}
        c = 0.5 + 0.08 * min(len(cats), 4) + 0.03 * min(len(positives), 5) + 0.02 * min(done, 5)
    else:
        c = 0.6 + (0.1 if text_len > 40 else 0) + 0.03 * min(done, 5)
    c -= 0.04 * missing
    if ai_used:
        c += 0.04
    return round(max(0.3, min(c, 0.97)), 2)
