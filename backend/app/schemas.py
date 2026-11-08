from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import get_settings

Lang = Literal["en", "ru", "kk"]
Severity = Literal["low", "medium", "high", "critical", "info"]
RiskLevel = Literal["low", "moderate", "high", "critical"]
CheckStatus = Literal["passed", "flagged", "unavailable", "skipped", "error"]

_MAX = get_settings().max_input_chars


def _clean(v: str) -> str:
    # Strip control characters (keep newlines/tabs); content is only ever treated as data.
    v = "".join(ch for ch in v if ch in "\n\t" or ord(ch) >= 32)
    v = v.strip()
    if not v:
        raise ValueError("Content must not be empty")
    return v


class TextAnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=_MAX)
    input_type: Literal["message", "advertisement"] = "message"
    lang: Lang = "en"
    is_demo: bool = False

    @field_validator("content")
    @classmethod
    def _check(cls, v: str) -> str:
        return _clean(v)


class InvestmentAnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=_MAX)
    lang: Lang = "en"
    is_demo: bool = False

    @field_validator("content")
    @classmethod
    def _check(cls, v: str) -> str:
        return _clean(v)


class CallAnalyzeRequest(BaseModel):
    """A live call transcript (the client sends the most recent part, up to the input limit)."""
    transcript: str = Field(..., min_length=1, max_length=_MAX)
    lang: Lang = "en"
    save: bool = False  # persist the final call report to history
    is_demo: bool = False

    @field_validator("transcript")
    @classmethod
    def _check(cls, v: str) -> str:
        return _clean(v)


class UrlAnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    lang: Lang = "en"
    is_demo: bool = False

    @field_validator("url")
    @classmethod
    def _check(cls, v: str) -> str:
        return _clean(v)


ScoreCategory = Literal["phishing", "social_engineering", "financial_fraud", "technical", "contextual", "mitigation", "ai_context"]


class Indicator(BaseModel):
    id: str
    name: str
    description: str
    severity: Severity
    weight: int = 0  # ruleset weight; negative = mitigating
    category: ScoreCategory = "contextual"
    group: str | None = None  # related indicators share a group and are not double counted
    contribution: float = 0.0  # effective points after grouping (0 for AI context and duplicates)
    source: Literal["heuristic", "url", "intel", "ai"] = "heuristic"
    evidence: str | None = None
    # content: evidence is a literal excerpt of the submitted content; external: result of a verified check;
    # derived: built from other detected indicators (evidence lists their excerpts); ai: unverified AI claim
    evidence_type: Literal["content", "external", "derived", "ai"] = "content"
    explanation: str | None = None
    recommendation: str | None = None
    verified: bool = True  # False for AI-generated context (never used in the score)


class CheckResult(BaseModel):
    name: str
    status: CheckStatus
    detail: str


class AnalysisResult(BaseModel):
    id: int | None = None
    input_type: str
    risk_score: int
    risk_level: RiskLevel
    threat_type: str
    summary: str
    indicators: list[Indicator]
    recommendations: list[str]
    confidence: float
    checks: list[CheckResult]
    domains: list[str] = []
    # Category points; always sums exactly to risk_score.
    score_breakdown: dict[str, int] = {}
    score_details: dict = {}
    # The AI's own opinion, shown for context only — the deterministic engine sets the score.
    ai_assessment: dict | None = None
    # Earlier scans with near-identical wording (same campaign): {count, best_id, best_similarity, threat_type}
    similar: dict | None = None
    # Call Guard only: {alert, reason, stages, stage_count}
    call: dict | None = None
    language: Lang
    ai_used: bool
    is_demo: bool = False
    status: str = "completed"
    submitted_content: str | None = None
    created_at: datetime | None = None


class ScanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submitted_content: str
    input_type: str
    risk_score: int
    risk_level: str
    threat_type: str
    confidence: float
    status: str
    is_demo: bool
    ai_used: bool
    created_at: datetime


class HistoryPage(BaseModel):
    items: list[ScanSummary]
    total: int
