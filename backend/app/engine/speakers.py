"""Call Guard speaker separation: who said each line — the caller or you?

The browser's speech recogniser returns plain text with no speaker information, and both voices reach the same
microphone (the call is on speaker). Each line is attributed from three independent signals:

* text cues  — who claims to be the bank/police, gives instructions and asks for codes (caller) versus who answers,
               refuses or talks about themselves in the first person (you); Kazakh, Russian and English;
* voice      — the median pitch of the utterance, compared with the pitch of lines already attributed;
* turn-taking — a line that follows the previous one almost without a pause is usually the same speaker.

Lines the user has marked by hand are never changed. An optional AI pass (see `ai.diarize_*`) can relabel the
whole conversation from its meaning; it only replaces automatic labels, never manual ones.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

F = re.IGNORECASE | re.UNICODE

# (pattern, weight). Strong cues ≈ 1.0, weak cues ≈ 0.35 (second/first-person pronouns are only hints).
CALLER_CUES: list[tuple[re.Pattern, float]] = [(re.compile(p, F), w) for p, w in [
    # self-introduction as an organisation
    (r"служб\w* безопасност|специалист\w*|сотрудник\w*|оператор\w*|вас беспокоит|звоню (вам )?(из|по поводу)|из (банка|полиции|налоговой|егова|акимата)|следовател|майор|капитан|\bмвд\b|\bкнб\b|нацбанк|финмониторинг", 1.0),
    (r"қауіпсіздік қызмет|маманы?мын|қызметкері?мін|хабарласып тұр|мазалап тұр|банктен|полициядан|тергеуші|ұлттық банк|қаржы мониторинг", 1.0),
    (r"this is .{0,25}(bank|security|police|support)|calling (you )?(from|about)|security (department|team|service)|investigator|officer", 1.0),
    # claims about the victim's account / documents
    (r"на (ваше имя|вас)[^.\n]{0,30}(оформ|взят)|по вашей карт|ваш\w* (сч[её]т|карт|данн|аккаунт)|подозрительн\w+ (операц|перевод)|попытк\w+ (списан|перевод|входа)|безопасн\w+ сч[её]т", 1.0),
    (r"атыңызға|картаңыз|шотыңыз|деректеріңіз|аккаунтыңыз|күдікті (операция|аударым)|қауіпсіз шот", 1.0),
    (r"in your name|your (account|card|details|code)|suspicious (transaction|activity|login)|safe account", 1.0),
    # instructions in the polite imperative
    (r"\b(назовите|продиктуйте|сообщите|подтвердите|переведите|установите|скачайте|нажмите|перейдите|зайдите|откройте|включите|оставайтесь|не (кладите|отключайтесь|говорите|сообщайте))\b", 1.0),
    (r"\w{2,}(ыңыз|іңіз|ңыз|ңіз)(шы|ші)?\b", 0.6),  # Kazakh polite 2nd person: айтыңыз, жіберіңіз, картаңыз
    (r"\b(read|tell|give|send|confirm|install|download|press|open) (me|us|it|the)\b|don'?t (hang up|tell)|stay on the line", 1.0),
    # weak: addressing the other person
    (r"\b(вы|вам|вас|ваш\w*)\b", 0.35),
    (r"\b(сіз|сізге|сізді|сізде|сіздің)\b", 0.35),
    (r"\b(you|your)\b", 0.35),
]]

YOU_CUES: list[tuple[re.Pattern, float]] = [(re.compile(p, F), w) for p, w in [
    # refusals, denials, suspicion
    (r"\bне (буду|скажу|дам|брал\w*|оформлял\w*|получал\w*|понимаю|хочу)\b|сам (перезвоню|позвоню|схожу)|положу трубку|кто (вы|это)\b|откуда у вас|зачем вам|как вас зовут|я перезвоню", 1.0),
    (r"айтпаймын|бермеймін|алған жоқпын|алмадым|рәсімдеген жоқпын|түсінбедім|өзім (хабарласамын|барамын|қоңырау)|кімсіз|қайдан білесіз|неге керек|қоямын", 1.0),
    (r"\bi (won'?t|will not|didn'?t|did not|don'?t understand)\b|i'?ll call (you )?back|who (are you|is this)|why do you need", 1.0),
    # first person
    (r"\b(я|мне|меня|мой|моя|моё|мои|мою)\b", 0.35),
    (r"\b(мен|маған|мені|менің|менде)\b", 0.35),
    (r"\b(i|me|my|mine)\b", 0.35),
]]

# A whole line that is only a short answer ("Алло", "Иә", "Да", "Нет") is almost always the person who picked up.
_ANSWERS = (r"алло|алё|да|нет|ага|угу|хорошо|ладно|понятно|слушаю|слушаю вас|я слушаю|а что случилось|что случилось|"
            r"иә|ия|жоқ|жарайды|түсінікті|тыңдап тұрмын|не болды|"
            r"hello|hi|yes|no|okay|ok|sure|right|i'?m listening")
SHORT_ANSWER = re.compile(rf"^({_ANSWERS})([\s,.!?…-]+({_ANSWERS}))*[\s,.!?…-]*$", F)

# Cue phrases that start with a pronoun of the *other* party but belong to the caller ("меня зовут… из банка").
_CALLER_SELF = re.compile(r"(меня зовут|менің атым|my name is)[^.\n]{0,40}(банк|служб|полиц|қызмет|bank|security|police)", F)


def text_score(text: str) -> float:
    """Text evidence in [-1, 1]: positive = caller, negative = you, 0 = no evidence."""
    t = text.strip()
    if not t:
        return 0.0
    if SHORT_ANSWER.match(t):
        return -0.9
    caller = sum(w for rx, w in CALLER_CUES if rx.search(t))
    you = sum(w for rx, w in YOU_CUES if rx.search(t))
    if _CALLER_SELF.search(t):
        caller += 1.0
        you = max(0.0, you - 0.35)
    diff = max(-2.5, min(2.5, caller - you))
    return round(diff / 2.5, 3)


@dataclass
class LineIn:
    text: str
    speaker: str = "auto"  # "caller" | "you" | "auto"
    voice: float | None = None  # median pitch of the utterance, Hz
    gap: float | None = None  # seconds of silence before the line


@dataclass
class Attribution:
    speaker: str
    confidence: float
    source: str  # manual | text | voice | turn | default | ai

    def as_dict(self) -> dict:
        return {"speaker": self.speaker, "confidence": round(self.confidence, 2), "source": self.source}


def _voice_score(pitch: float | None, centroids: dict[str, float]) -> float:
    if pitch is None or len(centroids) < 2:
        return 0.0
    caller, you = centroids["caller"], centroids["you"]
    spread = abs(caller - you)
    if spread < 15:  # voices too similar to tell apart by pitch
        return 0.0
    # +1 when the pitch sits on the caller's centroid, -1 on yours.
    s = (abs(pitch - you) - abs(pitch - caller)) / spread
    return max(-1.0, min(1.0, s))


def _centroids(lines: list[LineIn], labels: list[Attribution]) -> dict[str, float]:
    groups: dict[str, list[float]] = {"caller": [], "you": []}
    for line, lab in zip(lines, labels):
        if line.voice and (lab.source == "manual" or lab.confidence >= 0.6):
            groups[lab.speaker].append(line.voice)
    return {k: sorted(v)[len(v) // 2] for k, v in groups.items() if v}


def attribute(lines: list[LineIn]) -> list[Attribution]:
    """Attribute every line. Two passes: text + turn-taking first, then voice centroids learned from confident lines."""
    first = _pass(lines, {})
    cents = _centroids(lines, first)
    return _pass(lines, cents) if len(cents) == 2 else first


def _pass(lines: list[LineIn], cents: dict[str, float]) -> list[Attribution]:
    out: list[Attribution] = []
    for i, line in enumerate(lines):
        if line.speaker in ("caller", "you"):
            out.append(Attribution(line.speaker, 1.0, "manual"))
            continue
        ts = text_score(line.text)
        vs = _voice_score(line.voice, cents) * 0.8
        turn = 0.0
        if out and line.gap is not None:
            toward_prev = 1 if out[-1].speaker == "caller" else -1
            if line.gap < 0.8:
                turn = 0.3 * toward_prev  # continuation of the same breath
            elif line.gap > 2.0:
                turn = -0.15 * toward_prev  # a real pause usually means the other person answers
        total = ts + vs + turn
        if abs(total) < 0.12:
            # No evidence: keep the previous speaker for a quick continuation, otherwise assume the caller —
            # scoring a neutral line as the caller's is the safe default for fraud detection.
            if out and line.gap is not None and line.gap < 0.8:
                out.append(Attribution(out[-1].speaker, 0.5, "turn"))
            else:
                out.append(Attribution("caller", 0.5, "default"))
            continue
        parts = {"text": abs(ts), "voice": abs(vs), "turn": abs(turn)}
        source = max(parts, key=parts.get)
        out.append(Attribution("caller" if total > 0 else "you", min(0.97, 0.55 + abs(total) * 0.45), source))
    return out


LABELS = {"caller": {"kk": "Қоңырау шалушы", "ru": "Звонящий", "en": "Caller"},
          "you": {"kk": "Мен", "ru": "Я", "en": "Me"}}


def labelled_transcript(lines: list[LineIn], labels: list[Attribution], lang: str) -> str:
    """Readable transcript for history: one "Speaker: text" line per utterance."""
    return "\n".join(f"{LABELS[a.speaker][lang]}: {line.text}" for line, a in zip(lines, labels))
