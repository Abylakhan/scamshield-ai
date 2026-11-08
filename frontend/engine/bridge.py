"""Browser bridge: runs the real ScamShield backend engine inside Pyodide (GitHub Pages build).

Only the server-only dependencies are replaced:
* pydantic_settings → a plain pydantic model (settings use their defaults);
* httpx → an inert stub (live link checks need a server and are skipped here).
Detection rules, URL analysis, scoring, advice, Call Guard and scam memory are the unmodified backend modules.
"""
from __future__ import annotations

import json
import sys
import types


def _install_shims() -> None:
    try:
        import pydantic_settings  # noqa: F401
    except ImportError:
        from pydantic import BaseModel, ConfigDict

        mod = types.ModuleType("pydantic_settings")

        class BaseSettings(BaseModel):
            model_config = ConfigDict(extra="ignore")

        mod.BaseSettings = BaseSettings
        mod.SettingsConfigDict = lambda **_kw: ConfigDict(extra="ignore")
        sys.modules["pydantic_settings"] = mod
    try:
        import httpx  # noqa: F401
    except ImportError:
        mod = types.ModuleType("httpx")

        class HTTPError(Exception):
            pass

        for name in ("ConnectError", "TimeoutException"):
            setattr(mod, name, type(name, (HTTPError,), {}))
        mod.HTTPError = HTTPError
        mod.InvalidURL = type("InvalidURL", (Exception,), {})

        class _Unavailable:
            def __init__(self, *a, **kw):
                raise RuntimeError("network checks are not available in the browser build")

        mod.AsyncClient = mod.Timeout = mod.MockTransport = _Unavailable
        sys.modules["httpx"] = mod


_install_shims()

from pydantic import ValidationError  # noqa: E402

from app.demo import call_script, list_scenarios  # noqa: E402
from app.engine.advice import THREAT_LABELS  # noqa: E402
from app.engine.call_guard import call_assessment  # noqa: E402
from app.engine.catalog import CATEGORY_INFO, INTEL_DISCLAIMER  # noqa: E402
from app.engine.pipeline import analyze  # noqa: E402
from app.engine.redact import redact  # noqa: E402
from app.engine.similarity import SIMILAR_THRESHOLD, fingerprint, jaccard  # noqa: E402
from app.engine.text_rules import rule_catalog  # noqa: E402
from app.engine.url_analyzer import validate_url_input  # noqa: E402
from app.schemas import (  # noqa: E402
    CallAnalyzeRequest, CheckResult, InvestmentAnalyzeRequest, TextAnalyzeRequest, UrlAnalyzeRequest,
)

BROWSER_CHECK = CheckResult(name="Live link checks", status="skipped",
                            detail="browser version — page inspection, domain age and reputation need the server version")


class InvalidInput(Exception):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field, self.message = field, message


def _validate(model, body: dict):
    try:
        return model(**body)
    except ValidationError as e:
        err = e.errors()[0]
        field = ".".join(str(p) for p in err["loc"]) or "body"
        raise InvalidInput(field, err["msg"].removeprefix("Value error, ")) from None


def find_similar(content: str, history: list[dict], exclude_id: int | None = None) -> dict | None:
    """Same logic as the server: near-identical earlier scans (word-bigram Jaccard on redacted text)."""
    fp = fingerprint(redact(content))
    if len(fp) < 3:
        return None
    matches = [(jaccard(fp, fingerprint(h["submitted_content"])), h) for h in history if h["id"] != exclude_id]
    matches = [m for m in matches if m[0] >= SIMILAR_THRESHOLD]
    if not matches:
        return None
    best_sim, best = max(matches, key=lambda m: (m[0], m[1]["id"]))
    return {"count": len(matches), "best_id": best["id"], "best_similarity": round(best_sim, 2),
            "threat_type": best["threat_type"], "best_risk_score": best["risk_score"]}


async def _analyze(kind: str, body: dict, history: list[dict]) -> dict:
    if kind == "url":
        req = _validate(UrlAnalyzeRequest, body)
        if err := validate_url_input(req.url):
            raise InvalidInput("url", err)
        content, input_type, lang = req.url, "url", req.lang
    elif kind == "investment":
        req = _validate(InvestmentAnalyzeRequest, body)
        content, input_type, lang = req.content, "investment", req.lang
    else:
        req = _validate(TextAnalyzeRequest, body)
        content, input_type, lang = req.content, req.input_type, req.lang
    result = await analyze(content, input_type, lang, network=False, use_ai=False)
    result.checks.insert(1, BROWSER_CHECK)
    result.similar = find_similar(content, history)
    out = result.model_dump(mode="json")
    out["submitted_content"] = redact(content)[:2000]
    out["is_demo"] = req.is_demo
    return out


async def _analyze_call(body: dict, history: list[dict]) -> dict:
    req = _validate(CallAnalyzeRequest, body)
    result = await analyze(req.transcript, "call", req.lang, network=False, use_ai=False)
    result.call = call_assessment(result)
    if req.save:
        result.similar = find_similar(req.transcript, history)
    out = result.model_dump(mode="json")
    out["submitted_content"] = redact(req.transcript)[:2000]
    out["is_demo"] = req.is_demo
    out["save"] = req.save
    return out


def _catalog(lang: str) -> dict:
    return {
        "categories": [{"id": k, "label": THREAT_LABELS[k][lang], "description": v[lang]} for k, v in CATEGORY_INFO.items()],
        "labels": {k: v[lang] for k, v in THREAT_LABELS.items()},
        "reference_patterns": rule_catalog(lang),
        "disclaimer": INTEL_DISCLAIMER[lang],
    }


async def dispatch(raw: str) -> str:
    """Single entry point called from the Web Worker: JSON in, JSON out."""
    msg = json.loads(raw)
    op, args = msg["op"], msg.get("args", {})
    try:
        if op == "analyze":
            data = await _analyze(args["kind"], args["body"], args.get("history", []))
        elif op == "analyze_call":
            data = await _analyze_call(args["body"], args.get("history", []))
        elif op == "similar":
            data = find_similar(args["content"], args.get("history", []), args.get("exclude_id"))
        elif op == "scenarios":
            data = list_scenarios(args["lang"])
        elif op == "call_script":
            data = call_script(args["lang"])
        elif op == "catalog":
            data = _catalog(args["lang"])
        else:
            raise ValueError(f"unknown op {op}")
        return json.dumps({"ok": True, "data": data}, ensure_ascii=False)
    except InvalidInput as e:
        return json.dumps({"ok": False, "status": 422, "detail": "Invalid input",
                           "errors": [{"field": e.field, "message": e.message}]}, ensure_ascii=False)
    except Exception as e:  # noqa: BLE001 — surface a generic error to the UI
        return json.dumps({"ok": False, "status": 500, "detail": f"Engine error: {type(e).__name__}"})
