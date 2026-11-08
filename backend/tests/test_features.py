"""Call Guard (live phone-scam detection) and scam memory (similar earlier scans)."""
import pytest

from app.engine.similarity import fingerprint, jaccard


def _total(client):
    return client.get("/api/history").json()["total"]


@pytest.mark.parametrize("lang", ["ru", "en", "kk"])
def test_scripted_scam_call_escalates_to_alert(client, lang):
    lines = [line["text"] for line in client.get(f"/api/demo/call-script?lang={lang}").json()["lines"]]
    before = _total(client)
    transcript, scores, alerts = "", [], []
    for line in lines:
        transcript = f"{transcript}\n{line}".strip()
        r = client.post("/api/analyze/call", json={"transcript": transcript, "lang": lang})
        assert r.status_code == 200
        body = r.json()
        scores.append(body["risk_score"])
        alerts.append(body["call"]["alert"])
    assert scores == sorted(scores)  # risk never drops as the call goes on
    assert not alerts[0] and alerts[-1]
    assert body["call"]["reason"]["id"] == "otp_request"
    assert body["call"]["stages"] == ["contact", "pretext", "pressure", "extraction"]
    assert body["risk_level"] == "critical" and sum(body["score_breakdown"].values()) == body["risk_score"]
    assert _total(client) == before  # live frames are not stored


def test_call_report_is_saved_only_on_request(client):
    before = _total(client)
    r = client.post("/api/analyze/call", json={"transcript": "Служба безопасности банка. Продиктуйте код из СМС.", "lang": "ru", "save": True})
    body = r.json()
    assert body["id"] and body["input_type"] == "call" and body["call"]["alert"]
    assert _total(client) == before + 1
    assert client.get("/api/history?input_type=call").json()["total"] >= 1


@pytest.mark.parametrize("text", [
    "Привет, это Айгерим, я задержусь минут на десять, не клади трубку, я в лифте.",
    "Hi, it's your dentist's office confirming your appointment tomorrow at 10.",
    "Сәлем, кешке үйге келесің бе? Анам палау жасап жатыр.",
])
def test_harmless_calls_do_not_alert(client, text):
    body = client.post("/api/analyze/call", json={"transcript": text}).json()
    assert not body["call"]["alert"] and body["risk_level"] == "low"


def test_call_validation(client):
    assert client.post("/api/analyze/call", json={"transcript": ""}).status_code == 422
    assert client.post("/api/analyze/call", json={"transcript": "x" * 5001}).status_code == 422


def test_call_frames_skip_network_and_ai(client):
    body = client.post("/api/analyze/call", json={"transcript": "Перейдите на kaspi-secure.top/login"}).json()
    names = {c["name"] for c in body["checks"]}
    assert not any(n.startswith("Safe page inspection") for n in names)
    assert any(c["detail"].startswith("live mode") for c in body["checks"])


def test_similarity_fingerprint_ignores_numbers_and_links():
    a = fingerprint("Kaspi: ваш счёт заблокирован. Срочно сообщите код 4821 на kaspi-a.top/login")
    b = fingerprint("Kaspi: ваш счёт заблокирован. Срочно сообщите код 9917 на kaspi-zz.click/verify")
    c = fingerprint("Привет! Встретимся завтра в кафе на Абая, я возьму билеты.")
    assert jaccard(a, b) == 1.0 and jaccard(a, c) < 0.2


def test_repeat_campaign_is_recognised(client):
    msg = "KazPost: ваша посылка задержана на таможне. Оплатите пошлину {} ₸ сегодня: kazpost-{}.click/pay"
    first = client.post("/api/analyze/text", json={"content": msg.format(490, "a"), "lang": "ru"}).json()
    second = client.post("/api/analyze/text", json={"content": msg.format(750, "b"), "lang": "ru"}).json()
    assert second["similar"]["count"] >= 1 and second["similar"]["best_id"] == first["id"]
    assert second["similar"]["best_similarity"] >= 0.9
    # The report page shows the same, excluding the scan itself.
    again = client.get(f"/api/history/{second['id']}").json()
    assert again["similar"]["best_id"] != second["id"]


def test_unrelated_message_has_no_matches(client):
    body = client.post("/api/analyze/text", json={"content": "Купил новый велосипед, катаюсь каждый вечер по набережной Есиль."}).json()
    assert body["similar"] is None


def test_call_rate_limit_uses_separate_bucket(client, monkeypatch):
    from app import ratelimit
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "rate_limit_per_minute", 2)
    ratelimit._hits.clear()
    try:
        for _ in range(2):
            assert client.post("/api/analyze/text", json={"content": "hello there"}).status_code == 200
        assert client.post("/api/analyze/text", json={"content": "hello there"}).status_code == 429
        assert client.post("/api/analyze/call", json={"transcript": "hello there"}).status_code == 200  # own budget (5×)
    finally:
        ratelimit._hits.clear()
