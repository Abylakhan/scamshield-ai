from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..engine.ruleset import get_ruleset
from ..models import Scan
from .analyze import find_similar
from ..schemas import AnalysisResult, HistoryPage, ScanSummary

router = APIRouter(prefix="/api/history", tags=["history"])


def _truncate(text: str, n: int = 140) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


@router.get("", response_model=HistoryPage)
def list_history(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    risk_level: str | None = Query(None, pattern="^(low|moderate|high|critical)$"),
    input_type: str | None = Query(None, pattern="^(message|advertisement|investment|url|call)$"),
):
    q = select(Scan)
    if risk_level:
        q = q.where(Scan.risk_level == risk_level)
    if input_type:
        q = q.where(Scan.input_type == input_type)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Scan.created_at.desc(), Scan.id.desc()).offset(offset).limit(limit)).all()
    items = [ScanSummary.model_validate(r).model_copy(update={"submitted_content": _truncate(r.submitted_content)}) for r in rows]
    return HistoryPage(items=items, total=total)


def _legacy_indicators(items: list[dict]) -> list[dict]:
    """Scans saved before the category-based engine lack scoring categories; fill them from the ruleset for display.
    The stored score is never recomputed."""
    rs = get_ruleset()
    out = []
    for i in items or []:
        if "category" not in i and i.get("id") in rs.indicators:
            sp = rs.spec(i["id"])
            i = {**i, "category": sp.category, "group": sp.group, "contribution": 0.0}
        out.append(i)
    return out


@router.get("/{scan_id}", response_model=AnalysisResult)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    s = db.get(Scan, scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="Scan not found")
    return AnalysisResult(
        id=s.id, input_type=s.input_type, risk_score=s.risk_score, risk_level=s.risk_level, threat_type=s.threat_type,
        summary=s.summary, indicators=_legacy_indicators(s.indicators), recommendations=s.recommendations, confidence=s.confidence,
        checks=s.checks, domains=s.domains, language=s.language, ai_used=s.ai_used, is_demo=s.is_demo, status=s.status,
        score_breakdown=s.score_breakdown or {}, score_details=s.score_details or {}, ai_assessment=s.ai_assessment,
        similar=find_similar(db, s.submitted_content, exclude_id=s.id),
        submitted_content=s.submitted_content, created_at=s.created_at,
    )


@router.delete("/{scan_id}", status_code=204)
def delete_scan(scan_id: int, db: Session = Depends(get_db)):
    s = db.get(Scan, scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="Scan not found")
    db.delete(s)
    db.commit()


@router.delete("", status_code=204)
def clear_history(db: Session = Depends(get_db)):
    db.query(Scan).delete()
    db.commit()
