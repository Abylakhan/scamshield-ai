"""Gemini provider: request shape, parsing, failure fallback, and that AI never changes the score."""
import asyncio
import json

import httpx
import pytest

from app.config import get_settings
from app.engine import ai, pipeline

_REAL = httpx.AsyncClient
SCAM = "Kaspi: ваш счёт заблокирован, срочно сообщите код из СМС"


def _mock(handler):
    class Mocked(_REAL):
        def __init__(self, *a, **kw):
            kw["transport"] = httpx.MockTransport(handler)
            super().__init__(*a, **kw)
    return Mocked


def _answer(obj) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj, ensure_ascii=False)}]}}]}


GOOD = {"risk_score": 97, "risk_level": "critical", "threat_type": "bank_impersonation", "summary": "Похоже на мошенничество.",
        "indicators": [{"name": "Запрос кода", "description": "Просит код из СМС", "severity": "critical", "evidence": "сообщите код из СМС"},
                       {"name": "Выдумка", "description": "нет в тексте", "severity": "high", "evidence": "переведите миллион"}],
        "recommendations": ["Позвоните в банк по номеру на карте."], "confidence": 0.9}


@pytest.fixture
def gemini(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "gemini_api_key", "test-gemini-key")
    monkeypatch.setattr(s, "anthropic_api_key", None)
    monkeypatch.setattr(s, "ai_provider", "auto")
    return s


def run(text=SCAM):
    return asyncio.run(pipeline.analyze(text, "message", "ru"))


def test_auto_prefers_gemini_when_key_present(gemini, monkeypatch):
    assert gemini.active_ai_provider == "gemini" and gemini.active_ai_model == gemini.gemini_model
    monkeypatch.setattr(gemini, "ai_provider", "none")
    assert gemini.active_ai_provider is None and not gemini.ai_enabled


def test_gemini_success_adds_context_but_not_score(gemini, monkeypatch):
    baseline = asyncio.run(pipeline.analyze(SCAM, "message", "ru", use_ai=False))
    seen = {}

    def handler(req: httpx.Request):
        seen["url"], seen["key"], seen["body"] = str(req.url), req.headers.get("x-goog-api-key"), json.loads(req.content)
        return httpx.Response(200, json=_answer(GOOD))

    monkeypatch.setattr(httpx, "AsyncClient", _mock(handler))
    r = run()
    assert r.ai_used and r.risk_score == baseline.risk_score and r.score_breakdown == baseline.score_breakdown
    assert f"/models/{gemini.gemini_model}:generateContent" in seen["url"] and seen["key"] == "test-gemini-key"
    assert seen["body"]["generationConfig"]["responseMimeType"] == "application/json"
    assert "<b>" not in json.dumps(seen["body"])  # untrusted text is neutralised
    ai_inds = [i for i in r.indicators if i.source == "ai"]
    assert [i.name for i in ai_inds] == ["Запрос кода"]  # the invented one is dropped
    assert r.ai_assessment["risk_score"] == 97 and r.ai_assessment["model"] == gemini.gemini_model
    assert any(c.name == "AI contextual analysis" and c.status == "passed" for c in r.checks)


@pytest.mark.parametrize("response", [
    httpx.Response(429, json={"error": {"message": "quota"}}),
    httpx.Response(400, json={"error": {"message": "bad model"}}),
    httpx.Response(200, json={"candidates": []}),  # blocked by safety filters
    httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "not json at all"}]}}]}),
    httpx.Response(200, json=_answer({"risk_score": "abc"})),
])
def test_gemini_failures_fall_back(gemini, monkeypatch, response):
    monkeypatch.setattr(httpx, "AsyncClient", _mock(lambda req: response))
    r = run()
    assert not r.ai_used and r.risk_level in ("high", "critical")
    assert any(c.name == "AI contextual analysis" and c.status == "unavailable" for c in r.checks)


def test_gemini_network_error_falls_back(gemini, monkeypatch):
    def boom(req):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(httpx, "AsyncClient", _mock(boom))
    assert not run().ai_used


def test_parse_verdict_clips_and_repairs():
    v = ai.parse_verdict("```json\n" + json.dumps({**GOOD, "risk_score": 140, "risk_level": "extreme", "summary": "x" * 900,
                                                    "indicators": GOOD["indicators"] * 5}) + "\n```")
    assert v.risk_score == 100 and v.risk_level == "critical" and len(v.summary) == 500 and len(v.indicators) == 6
    assert ai.parse_verdict("{}") is not None  # minimal answer → defaults
    assert ai.parse_verdict("[1,2]") is None


def test_gemini_text_skips_thought_parts():
    payload = {"candidates": [{"content": {"parts": [{"text": "thinking…", "thought": True}, {"text": '{"risk_score": 5}'}]}}]}
    assert ai.gemini_text(payload) == '{"risk_score": 5}'
