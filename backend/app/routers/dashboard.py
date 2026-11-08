from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..engine.advice import THREAT_LABELS
from ..engine.catalog import CATEGORY_INFO, INTEL_DISCLAIMER
from ..engine.text_rules import rule_catalog
from ..models import Scan
from ..schemas import Lang

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db), lang: Lang = Query("en"), days: int = Query(14, ge=1, le=90)):
    """All numbers are computed from stored scans."""
    total = db.scalar(select(func.count(Scan.id))) or 0
    threats = db.scalar(select(func.count(Scan.id)).where(Scan.risk_score >= 50)) or 0
    critical = db.scalar(select(func.count(Scan.id)).where(Scan.risk_score >= 75)) or 0
    avg = db.scalar(select(func.avg(Scan.risk_score))) or 0

    by_level = dict(db.execute(select(Scan.risk_level, func.count()).group_by(Scan.risk_level)).all())
    by_type = db.execute(select(Scan.threat_type, func.count()).where(Scan.risk_score >= 25)
                         .group_by(Scan.threat_type).order_by(func.count().desc())).all()
    by_input = dict(db.execute(select(Scan.input_type, func.count()).group_by(Scan.input_type)).all())

    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.execute(select(Scan.created_at, Scan.risk_score).where(Scan.created_at >= since)).all()
    buckets = {(since + timedelta(days=i)).date().isoformat(): {"scans": 0, "threats": 0} for i in range(days)}
    for created, score in rows:
        key = created.date().isoformat()
        if key in buckets:
            buckets[key]["scans"] += 1
            buckets[key]["threats"] += int(score >= 50)

    # Total risk points per scoring category across all scans (from each scan's score breakdown)
    category_points = {c: 0 for c in ("phishing", "social_engineering", "financial_fraud", "technical", "contextual")}
    for (bd,) in db.execute(select(Scan.score_breakdown)).all():
        for c, v in (bd or {}).items():
            if c in category_points:
                category_points[c] += int(v)

    recent = db.scalars(select(Scan).order_by(Scan.created_at.desc(), Scan.id.desc()).limit(6)).all()
    url_rows = db.scalars(select(Scan).where(Scan.risk_score >= 50).order_by(Scan.created_at.desc()).limit(50)).all()
    seen, suspicious_urls = set(), []
    for s in url_rows:
        for d in s.domains or []:
            if d not in seen:
                seen.add(d)
                suspicious_urls.append({"domain": d, "risk_score": s.risk_score, "scan_id": s.id, "created_at": s.created_at})
    return {
        "total_scans": total,
        "threats_detected": threats,
        "critical_threats": critical,
        "average_risk": round(float(avg), 1),
        "ai_scans": db.scalar(select(func.count(Scan.id)).where(Scan.ai_used.is_(True))) or 0,
        "demo_scans": db.scalar(select(func.count(Scan.id)).where(Scan.is_demo.is_(True))) or 0,
        "by_level": {k: by_level.get(k, 0) for k in ("low", "moderate", "high", "critical")},
        "by_threat_type": [{"type": t, "label": THREAT_LABELS.get(t, {}).get(lang, t), "count": c} for t, c in by_type],
        "by_input_type": by_input,
        "category_points": category_points,
        "activity": [{"date": k, **v} for k, v in buckets.items()],
        "recent": [{"id": s.id, "input_type": s.input_type, "risk_score": s.risk_score, "risk_level": s.risk_level,
                    "threat_type": s.threat_type, "content": s.submitted_content[:90], "created_at": s.created_at,
                    "is_demo": s.is_demo} for s in recent],
        "suspicious_domains": suspicious_urls[:8],
    }




@router.get("/threats", tags=["threat-intelligence"])
def threats(db: Session = Depends(get_db), lang: Lang = Query("en")):
    """Threat intelligence view: reference catalog (detection patterns) + findings aggregated from local scans.

    Reference patterns are detection rules, not confirmed real-world threats. Domain indicators come only from
    content submitted to this instance.
    """
    counts = dict(db.execute(select(Scan.threat_type, func.count()).group_by(Scan.threat_type)).all())
    categories = [{"id": k, "label": THREAT_LABELS[k][lang], "description": v[lang], "observed": counts.get(k, 0)}
                  for k, v in CATEGORY_INFO.items()]

    scans = db.scalars(select(Scan).where(Scan.risk_score >= 25).order_by(Scan.created_at.desc()).limit(300)).all()
    ind_counter: Counter = Counter()
    ind_names: dict[str, str] = {}
    sev: Counter = Counter()
    domains: dict[str, dict] = {}
    for s in scans:
        for i in s.indicators or []:
            if i.get("weight", 0) > 0:
                ind_counter[i["id"]] += 1
                ind_names.setdefault(i["id"], i["name"])
                sev[i["severity"]] += 1
        for d in s.domains or []:
            e = domains.setdefault(d, {"domain": d, "max_risk": 0, "seen": 0, "last_seen": s.created_at, "indicators": set()})
            e["max_risk"] = max(e["max_risk"], s.risk_score)
            e["seen"] += 1
            e["indicators"] |= {i["name"] for i in (s.indicators or []) if i.get("source") in ("url", "intel") and i.get("weight", 0) > 0}
    domain_list = sorted(domains.values(), key=lambda e: (-e["max_risk"], -e["seen"]))[:20]
    for e in domain_list:
        e["indicators"] = sorted(e["indicators"])[:4]

    recent = db.scalars(select(Scan).where(Scan.risk_score >= 50).order_by(Scan.created_at.desc()).limit(8)).all()
    return {
        "categories": categories,
        "reference_patterns": rule_catalog(lang),
        "top_indicators": [{"id": k, "name": ind_names[k], "count": c} for k, c in ind_counter.most_common(10)],
        "severity_distribution": {k: sev.get(k, 0) for k in ("low", "medium", "high", "critical")},
        "domain_indicators": domain_list,
        "recent_findings": [{"id": s.id, "threat_type": s.threat_type, "label": THREAT_LABELS.get(s.threat_type, {}).get(lang, s.threat_type),
                             "risk_score": s.risk_score, "summary": s.summary, "created_at": s.created_at, "is_demo": s.is_demo} for s in recent],
        "disclaimer": INTEL_DISCLAIMER[lang],
    }
