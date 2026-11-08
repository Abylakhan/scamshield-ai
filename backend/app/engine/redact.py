"""Privacy: mask sensitive data before content is persisted. Analysis runs on the original in memory only."""
import re

_PATTERNS = [
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[CARD REDACTED]"),
    (re.compile(r"\b\d{12}\b"), "[IIN REDACTED]"),
    (re.compile(r"(?i)((?:парол\w*|password|құпиясөз|pin|пин|cvv|cvc)\s*[:=\-]?\s*)\S+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)((?:код\w*|code|otp|кодыңыз)\s*[:=\-]?\s*)\d{4,8}\b"), r"\1[CODE REDACTED]"),
    (re.compile(r"(\+?7|8)[\s(-]*7\d{2}[\s)-]*\d{3}[\s-]*(\d{2})[\s-]*(\d{2})"), r"+7 7** *** ** \3"),
    (re.compile(r"\b[\w.+-]+@([\w-]+\.[\w.-]+)\b"), r"***@\1"),
]


def redact(text: str) -> str:
    for rx, repl in _PATTERNS:
        text = rx.sub(repl, text)
    return text
