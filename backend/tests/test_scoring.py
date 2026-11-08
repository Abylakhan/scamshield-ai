"""Risk scoring engine: required scenarios plus invariants (bounds, classification, dedup, missing data,
traceable evidence, reproducibility, AI independence, configurable ruleset)."""
import asyncio
import json
from pathlib import Path

import pytest

from app.engine import pipeline, ruleset, scoring
from app.engine.ai import AIIndicator, AIVerdict
from app.engine.ruleset import CATEGORIES, get_ruleset, load_ruleset, make_indicator
from app.schemas import CheckResult

SCENARIOS = {
    "harmless": ("message", "Привет! Встретимся завтра в 7 у фонтана, я возьму зонт.", ("low",)),
    "bank_notification": ("message", "Halyk Bank: покупка 3 500 ₸, Magnum Cash&Carry. Доступно 120 000 ₸.", ("low",)),
    "kaspi_suspension": ("message", "Kaspi Bank: ваш счёт будет заблокирован в течение 24 часов. Срочно подтвердите данные "
                                    "на kaspi-kz-verify.top/login и сообщите код из СМС сотруднику службы безопасности.", ("critical",)),
    "phishing_url": ("url", "http://halyk-bank-secure.online/homebank/login/verify", ("critical",)),
    "investment": ("investment", "Guaranteed profit 7% per day, risk-free! Invite your friends and get a referral bonus.", ("high", "critical")),
    "otp_sms": ("message", "Здравствуйте! Вам пришёл код по ошибке, продиктуйте код из СМС, пожалуйста.", ("moderate", "high", "critical")),
    "legit_ad": ("advertisement", "Скидки до 30% на ноутбуки в Technodom до конца месяца. Подробности на technodom.kz", ("low",)),
    "overlapping": ("message", "СРОЧНО! Служба безопасности Kaspi: ваша карта заблокирована. Назовите код из СМС, введите пароль "
                               "и CVV на kaspi-secure.top/verify. Переведите деньги на безопасный счёт. Никому не говорите!", ("critical",)),
}


def run(content, input_type="message", lang="ru"):
    return asyncio.run(pipeline.analyze(content, input_type, lang))


@pytest.mark.parametrize("name", SCENARIOS)
def test_required_scenarios(name):
    input_type, content, levels = SCENARIOS[name]
    r = run(content, input_type)
    assert 0 <= r.risk_score <= 100
    assert r.risk_level in levels, (name, r.risk_score, [(i.id, i.contribution) for i in r.indicators])
    assert r.risk_level == scoring.risk_level(r.risk_score)


@pytest.mark.parametrize("name", SCENARIOS)
def test_breakdown_sums_to_score(name):
    input_type, content, _ = SCENARIOS[name]
    r = run(content, input_type)
    assert set(r.score_breakdown) == set(CATEGORIES)
    assert sum(r.score_breakdown.values()) == r.risk_score
    assert all(v >= 0 for v in r.score_breakdown.values())


@pytest.mark.parametrize("score,level", [(0, "low"), (24, "low"), (25, "moderate"), (49, "moderate"), (50, "high"),
                                         (74, "high"), (75, "critical"), (100, "critical")])
def test_classification_thresholds(score, level):
    assert scoring.risk_level(score) == level


def test_confidence_is_separate_from_risk():
    harmless = run(SCENARIOS["harmless"][1])
    scam = run(SCENARIOS["kaspi_suspension"][1])
    assert 0 < harmless.confidence <= 1 and 0 < scam.confidence <= 1
    # A clearly harmless message is low risk yet can be judged with reasonable confidence.
    assert harmless.risk_score < 25 and harmless.confidence >= 0.6


def _ind(iid, evidence="x"):
    return make_indicator(iid, iid, iid, evidence=evidence, source="heuristic")


def test_duplicate_indicators_do_not_inflate():
    once = scoring.score_indicators([_ind("urgency")]).score
    many = scoring.score_indicators([_ind("urgency", f"e{i}") for i in range(10)]).score
    assert once == many == get_ruleset().spec("urgency").weight


def test_repeated_phrases_in_text_do_not_inflate():
    one = run("Срочно переведите деньги.")
    five = run("Срочно! Срочно! Срочно! Срочно! Срочно переведите деньги.")
    assert one.risk_score == five.risk_score


def test_related_indicators_are_grouped():
    rs = get_ruleset()
    lookalike, typo = rs.spec("brand_lookalike").weight, rs.spec("typosquat").weight
    r = scoring.score_indicators([_ind("brand_lookalike"), _ind("typosquat")])
    by_id = {i.id: i for i in r.indicators}
    assert by_id["brand_lookalike"].contribution == lookalike
    assert by_id["typosquat"].contribution == pytest.approx(typo * rs.group_decay, abs=0.1)
    ungrouped = scoring.score_indicators([_ind("brand_lookalike"), _ind("phishing_url_combo")]).score
    assert r.score < ungrouped  # same-group signals count less than independent ones


def test_independent_categories_compound_and_stay_bounded():
    single = scoring.score_indicators([_ind("otp_request")]).score
    multi = scoring.score_indicators([_ind("otp_request"), _ind("brand_lookalike"), _ind("unrealistic_profit"),
                                      _ind("reputation_hit"), _ind("personal_transfer")]).score
    assert single < multi <= 100
    everything = scoring.score_indicators([_ind(i) for i, s in get_ruleset().indicators.items() if s.category != "mitigation"])
    assert everything.score == 100 and sum(everything.breakdown.values()) == 100


def test_category_caps_are_respected():
    r = scoring.score_indicators([_ind(i) for i, s in get_ruleset().indicators.items() if s.category == "technical"])
    assert r.categories["technical"]["score"] <= get_ruleset().category_caps["technical"]


def test_brand_mention_alone_is_not_risky():
    for text in ["Оплатил продукты через Kaspi, всё ок", "Halyk Bank открыл новое отделение на Абая", "eGov напомнил продлить документы"]:
        r = run(text)
        assert r.risk_level == "low", (text, r.risk_score)


def test_missing_external_intelligence_does_not_raise_risk(monkeypatch):
    content = SCENARIOS["phishing_url"][1]
    baseline = run(content, "url")

    async def all_unavailable(parsed, lang):
        return [], [CheckResult(name=n, status="unavailable", detail="service unavailable")
                    for n in ("Safe page inspection", "Domain age (RDAP)", "Google Safe Browsing", "VirusTotal")]

    monkeypatch.setattr(pipeline, "run_network_checks", all_unavailable)
    degraded = run(content, "url")
    assert degraded.risk_score == baseline.risk_score
    assert degraded.confidence < baseline.confidence  # missing data lowers certainty only

    harmless = run("https://example.org/about", "url")
    assert harmless.risk_level == "low"


def test_evidence_is_traceable():
    for name, (input_type, content, _) in SCENARIOS.items():
        r = run(content, input_type)
        for i in r.indicators:
            assert i.evidence, (name, i.id)
            assert i.explanation and i.recommendation and i.category
            parts = i.evidence.split(" + ") if i.evidence_type == "derived" else [i.evidence]
            if i.evidence_type in ("content", "derived"):
                for part in parts:
                    assert part.lower() in content.lower(), (name, i.id, part)


def test_results_are_reproducible():
    content = SCENARIOS["overlapping"][1]
    a, b = run(content), run(content)
    assert a.risk_score == b.risk_score and a.score_breakdown == b.score_breakdown
    assert [(i.id, i.contribution, i.evidence) for i in a.indicators] == [(i.id, i.contribution, i.evidence) for i in b.indicators]


def test_ai_unavailable_falls_back_to_heuristics(monkeypatch):
    async def down(*args, **kwargs):
        return None

    monkeypatch.setattr(pipeline, "ai_analyze", down)
    r = run(SCENARIOS["kaspi_suspension"][1])
    assert r.risk_level == "critical" and not r.ai_used
    assert any(c.name == "AI contextual analysis" and c.status in ("skipped", "unavailable") for c in r.checks)


def test_ai_cannot_change_the_deterministic_score(monkeypatch):
    content = SCENARIOS["harmless"][1]
    baseline = run(content)

    async def alarmist(*args, **kwargs):
        return AIVerdict(risk_score=99, risk_level="critical", threat_type="phishing", summary="Definitely a scam.",
                         indicators=[AIIndicator(name="Invented", description="Not in text", severity="critical", evidence="wire money now"),
                                     AIIndicator(name="Meeting place", description="Mentions a meeting", severity="low", evidence="у фонтана")],
                         recommendations=["Be careful."], confidence=0.99)

    monkeypatch.setattr(pipeline, "ai_analyze", alarmist)
    r = run(content)
    assert r.ai_used and r.risk_score == baseline.risk_score and r.risk_level == "low"
    assert r.ai_assessment["risk_score"] == 99
    ai = [i for i in r.indicators if i.source == "ai"]
    assert [i.name for i in ai] == ["Meeting place"]  # fabricated evidence is discarded
    assert all(not i.verified and i.contribution == 0 for i in ai)


def test_ruleset_is_configurable(tmp_path):
    raw = json.loads(Path(ruleset.__file__).with_name("ruleset.json").read_text())
    raw["indicators"]["urgency"]["weight"] = 40
    custom = tmp_path / "rules.json"
    custom.write_text(json.dumps(raw))
    rs = load_ruleset(custom)
    assert scoring.score_indicators([_ind("urgency")], rs).score == 40


def test_ruleset_validation(tmp_path):
    raw = json.loads(Path(ruleset.__file__).with_name("ruleset.json").read_text())
    raw["indicators"]["urgency"]["severity"] = "extreme"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(raw))
    with pytest.raises(ValueError):
        load_ruleset(bad)


def test_every_detector_indicator_is_in_ruleset():
    from app.engine.net_checks import _N
    from app.engine.text_rules import RULES
    from app.engine.url_analyzer import _T

    ids = {r.id for r in RULES} | set(_T) | set(_N) | {"bank_impersonation", "government_impersonation", "delivery_scam",
                                                       "delivery_fee_combo", "investment_scheme_combo", "safety_warning"}
    assert ids <= set(get_ruleset().indicators)
