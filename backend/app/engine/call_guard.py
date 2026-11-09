"""Call Guard: live phone-scam detection on a growing call transcript.

Speakers are separated first (see speakers.py) and only the caller's words are scored — your own answers
("I didn't take any loan", "I won't tell you the code") must never raise the risk. Each frame is scored by the normal deterministic pipeline (no network lookups, no AI — fast and
private). On top of the score we report how far the caller has progressed through the classic fraud script
and raise a hang-up alert as soon as the caller tries to extract codes, credentials or money.
"""
from __future__ import annotations

from ..config import get_settings
from ..schemas import AnalysisResult, CallAnalyzeRequest
from .pipeline import analyze
from .speakers import LineIn, attribute, labelled_transcript

# The four stages of a "bank security service" call, in order.
STAGES: list[tuple[str, set[str]]] = [
    ("contact", {"security_service", "authority_pressure", "bank_impersonation", "government_impersonation"}),
    ("pretext", {"account_threat", "fake_loan", "prize_lure", "delivery_fee", "emotional_manipulation"}),
    ("pressure", {"urgency", "stay_on_line", "secrecy"}),
    ("extraction", {"otp_request", "credential_request", "personal_transfer", "payment_request", "remote_access", "vote_takeover"}),
]

# Indicators that mean "hang up now", strongest first.
ALERT_IDS = ["otp_request", "credential_request", "remote_access", "personal_transfer", "vote_takeover"]
ALERT_SCORE = 75


def call_assessment(result: AnalysisResult) -> dict:
    ids = {i.id for i in result.indicators if i.weight > 0}
    stages = [name for name, members in STAGES if ids & members]
    trigger = next((i for i in ALERT_IDS if i in ids), None)
    alert = trigger is not None or result.risk_score >= ALERT_SCORE
    reason = None
    if alert:
        hit = next((i for i in result.indicators if i.id == trigger), None) if trigger else result.indicators[0] if result.indicators else None
        reason = {"id": hit.id, "name": hit.name, "evidence": hit.evidence} if hit else None
    return {"alert": alert, "reason": reason, "stages": stages, "stage_count": len(STAGES)}


async def score_call(req: CallAnalyzeRequest, *, use_ai: bool = False) -> tuple[AnalysisResult, str]:
    """Score a call frame. Returns the result and the transcript to store (with speaker names when known)."""
    limit = get_settings().max_input_chars
    if req.lines:
        lines = [LineIn(line.text, line.speaker, line.voice, line.gap) for line in req.lines]
        labels = attribute(lines)
        caller = "\n".join(line.text for line, a in zip(lines, labels) if a.speaker == "caller")[-limit:]
        stored = labelled_transcript(lines, labels, req.lang)[-limit:]
        speakers = [a.as_dict() for a in labels]
    else:
        caller = stored = req.transcript or ""
        speakers = None
    # Nothing said by the caller yet: score an empty frame (all rules silent) instead of your own words.
    result = await analyze(caller or "…", "call", req.lang, network=False, use_ai=use_ai)
    result.call = call_assessment(result)
    if speakers is not None:
        result.call["speakers"] = speakers
        result.call["caller_lines"] = sum(1 for a in speakers if a["speaker"] == "caller")
    return result, stored
