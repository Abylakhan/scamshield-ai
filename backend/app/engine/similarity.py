"""Scam memory: find earlier scans with near-identical wording (same campaign, different numbers or links).

Texts are normalised (case, digits, links, redaction placeholders) and compared as sets of word bigrams with
Jaccard similarity. Pure Python and deterministic; fast enough for the last few thousand scans.
"""
from __future__ import annotations

import re

_URL = re.compile(r"(?:https?://|www\.)\S+|\b[\w-]+(?:\.[\w-]+)+(?:/\S*)?", re.I)
_REDACTED = re.compile(r"\[[A-Z ]+REDACTED\]")
_WORD = re.compile(r"[^\W\d_]{2,}|0+", re.UNICODE)

SIMILAR_THRESHOLD = 0.5


def fingerprint(text: str) -> frozenset[str]:
    text = _REDACTED.sub(" 0 ", text)
    text = _URL.sub(" link ", text.lower())
    text = re.sub(r"\d+", "0", text)
    words = _WORD.findall(text)
    if len(words) < 2:
        return frozenset(words)
    return frozenset(f"{a} {b}" for a, b in zip(words, words[1:]))


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)
