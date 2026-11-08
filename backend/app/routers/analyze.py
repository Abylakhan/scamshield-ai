from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session

from ..database import get_db
from ..demo import call_script, list_scenarios
from ..engine.call_guard import call_assessment
from ..engine.pipeline import analyze
from ..engine.redact import redact
from ..engine.similarity import SIMILAR_THRESHOLD, fingerprint, jaccard
from ..engine.url_analyzer import validate_url_input
from ..models import Scan
from ..ratelimit import call_rate_limit, rate_limit
from ..schemas import AnalysisResult, CallAnalyzeRequest, InvestmentAnalyzeRequest, Lang, TextAnalyzeRequest, UrlAnalyzeRequest

router = APIRouter(prefix="/api", tags=["analysis"])


def find_similar(db: Session, content: str, exclude_id: int | None = None, window: int = 2000) -> dict | None:
    """Earlier scans whose (redacted) wording is near-identical — the same campaign seen again."""
    fp = fingerprint(redact(content))
    if len(fp) < 3:
        return None  # too short to compare meaningfully
    rows = db.execute(select(Scan.id, Scan.submitted_content, Scan.threat_type, Scan.risk_score)
                      .order_by(Scan.id.desc()).limit(window)).all()
    matches = [(jaccard(fp, fingerprint(text)), sid, threat, score) for sid, text, threat, score in rows if sid != exclude_id]
    matches = [m for m in matches if m[0] >= SIMILAR_THRESHOLD]
    if not matches:
        return None
    best = max(matches, key=lambda m: (m[0], m[1]))
    return {"count": len(matches), "best_id": best[1], "best_similarity": round(best[0], 2),
            "threat_type": best[2], "best_risk_score": best[3]}


def _persist(db: Session, content: str, result: AnalysisResult, is_demo: bool) -> AnalysisResult:
    result.similar = find_similar(db, content)
    scan = Scan(
        submitted_content=redact(content)[:2000], input_type=result.input_type, risk_score=result.risk_score,
        risk_level=result.risk_level, threat_type=result.threat_type, summary=result.summary,
        indicators=[i.model_dump() for i in result.indicators], recommendations=result.recommendations,
        checks=[c.model_dump() for c in result.checks], domains=result.domains, confidence=result.confidence,
        score_breakdown=result.score_breakdown, score_details=result.score_details, ai_assessment=result.ai_assessment,
        language=result.language, ai_used=result.ai_used, is_demo=is_demo,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return result.model_copy(update={"id": scan.id, "created_at": scan.created_at, "is_demo": is_demo,
                                     "submitted_content": scan.submitted_content})


@router.post("/analyze/text", response_model=AnalysisResult, dependencies=[Depends(rate_limit)])
async def analyze_text(req: TextAnalyzeRequest, db: Session = Depends(get_db)):
    """Analyze a message (WhatsApp / Telegram / SMS) or advertisement text."""
    result = await analyze(req.content, req.input_type, req.lang)
    return _persist(db, req.content, result, req.is_demo)


@router.post("/analyze/investment", response_model=AnalysisResult, dependencies=[Depends(rate_limit)])
async def analyze_investment(req: InvestmentAnalyzeRequest, db: Session = Depends(get_db)):
    """Analyze an investment offer."""
    result = await analyze(req.content, "investment", req.lang)
    return _persist(db, req.content, result, req.is_demo)


@router.post("/analyze/url", response_model=AnalysisResult, dependencies=[Depends(rate_limit)])
async def analyze_url(req: UrlAnalyzeRequest, db: Session = Depends(get_db)):
    """Analyze a URL. The URL is never opened in the user's browser; server-side checks are SSRF-protected."""
    if err := validate_url_input(req.url):
        raise RequestValidationError([{"loc": ("body", "url"), "msg": err, "type": "value_error"}])
    result = await analyze(req.url, "url", req.lang)
    return _persist(db, req.url, result, req.is_demo)


@router.post("/analyze/call", response_model=AnalysisResult, dependencies=[Depends(call_rate_limit)])
async def analyze_call(req: CallAnalyzeRequest, db: Session = Depends(get_db)):
    """Call Guard: score a live phone-call transcript. Frames are analysed locally (no network lookups, no AI) and
    are not stored; send `save: true` with the final transcript to keep the call report in history."""
    result = await analyze(req.transcript, "call", req.lang, network=False, use_ai=req.save)
    result.call = call_assessment(result)
    if req.save:
        return _persist(db, req.transcript, result, req.is_demo)
    return result


@router.get("/demo/call-script", tags=["demo"])
def demo_call_script(lang: Lang = Query("en")):
    """A fictional scam call used by Call Guard's simulation mode. Each line still goes through /api/analyze/call."""
    return call_script(lang)


@router.get("/demo/scenarios", tags=["demo"])
def demo_scenarios(lang: Lang = Query("en")):
    """Predefined TEST scenarios for demonstrations. Submit them through the normal analyze endpoints."""
    return list_scenarios(lang)
