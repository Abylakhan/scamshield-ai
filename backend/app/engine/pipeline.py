"""Analysis pipeline: deterministic detectors → URL checks → scoring engine (authoritative) → optional AI context → report."""
from __future__ import annotations

import logging

from ..config import get_settings
from ..schemas import AnalysisResult, CheckResult, Indicator
from . import advice, scoring
from .ai import ai_analyze
from .net_checks import run_network_checks
from .ruleset import get_ruleset
from .text_rules import analyze_text
from .url_analyzer import analyze_url_static, extract_urls

log = logging.getLogger("scamshield.pipeline")

def _dedupe(indicators: list[Indicator]) -> list[Indicator]:
    """One entry per indicator id (first occurrence keeps its evidence)."""
    out: dict[str, Indicator] = {}
    for i in indicators:
        out.setdefault(i.id, i)
    return list(out.values())


async def _url_findings(raw: str, lang: str, network: bool) -> tuple[list[Indicator], list[CheckResult], str | None]:
    parsed, inds = analyze_url_static(raw, lang)
    checks: list[CheckResult] = [CheckResult(
        name="URL structure analysis", status="flagged" if any(i.weight > 0 for i in inds) else "passed",
        detail=(parsed.normalized if parsed else "invalid or dangerous URL")[:200],
    )]
    if parsed and network and not parsed.official:
        n_inds, n_checks = await run_network_checks(parsed, lang)
        inds += n_inds
        checks += n_checks
    elif parsed and parsed.official:
        checks.append(CheckResult(name="Network checks", status="skipped", detail="known official domain"))
    return inds, checks, (parsed.registrable if parsed else None)


async def analyze(content: str, input_type: str, lang: str, *, network: bool = True, use_ai: bool = True) -> AnalysisResult:
    """network=False skips live URL fetch/reputation lookups; use_ai=False skips the AI layer (used for live call frames)."""
    s = get_settings()
    indicators: list[Indicator] = []
    checks: list[CheckResult] = []
    domains: list[str] = []

    if input_type == "url":
        inds, chks, dom = await _url_findings(content, lang, network=network)
        indicators += inds
        checks += chks
        if dom:
            domains.append(dom)
        if not inds and dom is None:
            checks.append(CheckResult(name="URL parsing", status="error", detail="could not parse URL"))
    else:
        text_inds, _brands = analyze_text(content, lang)
        indicators += text_inds
        checks.append(CheckResult(name="Language & pattern analysis", status="flagged" if text_inds else "passed",
                                  detail=f"{len(text_inds)} pattern(s) matched"))
        urls = extract_urls(content)
        for idx, u in enumerate(urls[:3]):
            inds, chks, dom = await _url_findings(u, lang, network=network and idx < 2)
            indicators += inds
            for c in chks:
                c.name = f"{c.name} — {dom or u[:40]}"
            checks += chks
            if dom:
                domains.append(dom)
        if any(i.source in ("url", "intel") and i.weight > 0 for i in indicators):
            # Mentioning an official domain does not offset a look-alike link elsewhere in the same message.
            indicators = [i for i in indicators if i.id != "official_domain"]
        if not urls:
            checks.append(CheckResult(name="Embedded link analysis", status="skipped", detail="no links found in content"))

    indicators = _dedupe(indicators)
    result = scoring.score_indicators(indicators)
    indicators = result.indicators
    final_score = result.score
    level = scoring.risk_level(final_score)
    threat_type = scoring.classify(indicators, final_score, input_type)
    for i in indicators:
        i.recommendation = advice.indicator_recommendation(i.id, lang)
        i.explanation = i.explanation or i.description

    # Optional AI layer: explains and adds context, but never changes the deterministic score or level.
    ai_used = False
    ai_assessment = None
    ai_recs: list[str] = []
    verdict = await ai_analyze(content, input_type, lang, indicators, final_score, checks) if use_ai else None
    if verdict is not None:
        ai_used = True
        known = {i.name.lower() for i in indicators}
        for ai_ind in verdict.indicators:
            ev = ai_ind.evidence.strip()
            # Keep only AI observations whose quoted evidence is literally present in the submitted content.
            if ai_ind.name.lower() in known or not ev or ev.lower()[:30] not in content.lower():
                continue
            indicators.append(Indicator(
                id=f"ai_{len(indicators)}", name=ai_ind.name, description=ai_ind.description, explanation=ai_ind.description,
                severity=ai_ind.severity, weight=0, contribution=0, category="ai_context", source="ai",
                evidence=ev, evidence_type="ai", verified=False,
            ))
        ai_assessment = {"risk_score": verdict.risk_score, "risk_level": verdict.risk_level, "threat_type": verdict.threat_type,
                         "summary": verdict.summary, "confidence": verdict.confidence,
                         "note": "AI opinion for context only; the deterministic engine sets the risk score."}
        ai_recs = verdict.recommendations
        checks.append(CheckResult(name="AI contextual analysis", status="passed",
                                  detail=f"{s.ai_model}; AI opinion {verdict.risk_score}/100 (not used for score)"))
    else:
        if not use_ai:
            checks.append(CheckResult(name="AI contextual analysis", status="skipped", detail="live mode — heuristic engine only"))
        else:
            checks.append(CheckResult(name="AI contextual analysis", status="skipped" if not s.ai_enabled else "unavailable",
                                      detail="no ANTHROPIC_API_KEY configured — heuristic engine only" if not s.ai_enabled
                                      else "provider unavailable — heuristic engine only"))

    recommendations = advice.build_recommendations(indicators, level, lang)
    if ai_recs and level != "low":
        recommendations = list(dict.fromkeys([*recommendations, *ai_recs]))[:7]
    summary = advice.build_summary(level, threat_type, lang)

    return AnalysisResult(
        input_type=input_type, risk_score=final_score, risk_level=level, threat_type=threat_type,
        summary=summary, indicators=indicators, recommendations=recommendations,
        confidence=scoring.confidence(indicators, checks, len(content), ai_used),
        checks=checks, domains=list(dict.fromkeys(domains)), language=lang, ai_used=ai_used,
        score_breakdown=result.breakdown, score_details=result.details(get_ruleset()), ai_assessment=ai_assessment,
    )
