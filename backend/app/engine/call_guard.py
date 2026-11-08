"""Call Guard: live phone-scam detection on a growing call transcript.

Each transcript frame is scored by the normal deterministic pipeline (no network lookups, no AI — fast and
private). On top of the score we report how far the caller has progressed through the classic fraud script
and raise a hang-up alert as soon as the caller tries to extract codes, credentials or money.
"""
from __future__ import annotations

from ..schemas import AnalysisResult

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
