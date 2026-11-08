"""Configurable scoring ruleset — the single source of every indicator's weight, severity, category and group.

Loaded from `ruleset.json` next to this file, or from the path in SCORING_RULESET_PATH. Detectors only decide
*whether* an indicator is present (and with what evidence); everything that influences the score lives here.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from ..schemas import Indicator

CATEGORIES = ("phishing", "social_engineering", "financial_fraud", "technical", "contextual")
SEVERITIES = ("info", "low", "medium", "high", "critical")


@dataclass(frozen=True)
class IndicatorSpec:
    id: str
    category: str
    severity: str
    weight: int
    group: str | None


@dataclass(frozen=True)
class RuleSet:
    version: str
    severity_points: dict[str, int]
    group_decay: float
    category_caps: dict[str, int]
    indicators: dict[str, IndicatorSpec]

    def spec(self, indicator_id: str) -> IndicatorSpec:
        try:
            return self.indicators[indicator_id]
        except KeyError as e:
            raise KeyError(f"Indicator '{indicator_id}' is not defined in the scoring ruleset") from e


def load_ruleset(path: str | Path | None = None) -> RuleSet:
    path = Path(path or os.environ.get("SCORING_RULESET_PATH") or Path(__file__).with_name("ruleset.json"))
    raw = json.loads(path.read_text(encoding="utf-8"))
    points = {k: int(v) for k, v in raw["severity_points"].items()}
    caps = {k: int(v["cap"]) for k, v in raw["categories"].items()}
    if set(caps) != set(CATEGORIES):
        raise ValueError(f"ruleset categories must be exactly {CATEGORIES}")
    decay = float(raw.get("group_decay", 0.35))
    if not 0 <= decay <= 1:
        raise ValueError("group_decay must be between 0 and 1")
    specs: dict[str, IndicatorSpec] = {}
    for iid, d in raw["indicators"].items():
        cat, sev = d["category"], d["severity"]
        if cat not in (*CATEGORIES, "mitigation"):
            raise ValueError(f"{iid}: unknown category {cat}")
        if sev not in SEVERITIES:
            raise ValueError(f"{iid}: unknown severity {sev}")
        weight = int(d.get("weight", points[sev]))
        if cat == "mitigation" and weight > 0:
            raise ValueError(f"{iid}: mitigating indicators must have weight <= 0")
        if cat != "mitigation" and not 0 < weight <= 95:
            raise ValueError(f"{iid}: weight must be in 1..95")
        specs[iid] = IndicatorSpec(iid, cat, sev, weight, d.get("group"))
    return RuleSet(raw.get("version", "unversioned"), points, decay, caps, specs)


@lru_cache
def get_ruleset() -> RuleSet:
    return load_ruleset()


def make_indicator(indicator_id: str, name: str, description: str, *, evidence: str | None, source: str,
                   evidence_type: str = "content") -> Indicator:
    """Create an indicator with score-relevant fields taken from the ruleset."""
    s = get_ruleset().spec(indicator_id)
    return Indicator(id=indicator_id, name=name, description=description, explanation=description,
                     severity=s.severity, weight=s.weight, category=s.category, group=s.group, source=source,
                     evidence=evidence, evidence_type=evidence_type, verified=True)
