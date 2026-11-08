"""Small in-memory sliding-window rate limiter for analysis endpoints (per client IP)."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from .config import get_settings

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request) -> None:
    _check(request, "analyze", get_settings().rate_limit_per_minute)


def call_rate_limit(request: Request) -> None:
    # Live call frames arrive every few seconds; they get their own, larger budget.
    _check(request, "call", get_settings().rate_limit_per_minute * 5)


def _check(request: Request, bucket: str, limit: int) -> None:
    if limit <= 0:
        return
    key = f"{bucket}:{request.client.host if request.client else 'unknown'}"
    now = time.monotonic()
    if len(_hits) > 10_000:  # bound memory: drop idle clients
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
            _hits.pop(k, None)
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many analysis requests. Please wait a minute and try again.")
    q.append(now)
