def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["ai_provider"]["enabled"] is False


def test_analyze_text_persists_and_history_roundtrip(client):
    r = client.post("/api/analyze/text", json={
        "content": "Kaspi: ваш счёт заблокирован. Срочно сообщите код из СМС и пароль: qwerty",
        "input_type": "message", "lang": "ru"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] and body["risk_score"] >= 75 and body["risk_level"] == "critical"
    assert body["indicators"] and body["recommendations"]
    assert "qwerty" not in body["submitted_content"]  # redacted before storage

    h = client.get("/api/history").json()
    assert h["total"] >= 1 and any(i["id"] == body["id"] for i in h["items"])
    one = client.get(f"/api/history/{body['id']}").json()
    assert one["risk_score"] == body["risk_score"]

    assert client.delete(f"/api/history/{body['id']}").status_code == 204
    assert client.get(f"/api/history/{body['id']}").status_code == 404


def test_analyze_url_and_investment(client):
    u = client.post("/api/analyze/url", json={"url": "http://halyk-bank-secure.online/homebank/login", "lang": "en"}).json()
    assert u["risk_level"] in ("high", "critical") and u["threat_type"] == "phishing"
    assert "halyk-bank-secure.online" in u["domains"]
    inv = client.post("/api/analyze/investment", json={
        "content": "Guaranteed profit 7% per day, invite friends for a referral bonus!", "lang": "en"}).json()
    assert inv["input_type"] == "investment" and inv["risk_level"] in ("high", "critical")


def test_validation_errors(client):
    assert client.post("/api/analyze/text", json={"content": "   ", "lang": "en"}).status_code == 422
    assert client.post("/api/analyze/text", json={"content": "x" * 6000}).status_code == 422
    assert client.post("/api/analyze/text", json={"content": "hi", "lang": "de"}).status_code == 422


def test_dashboard_and_threats(client):
    s = client.get("/api/dashboard/stats?lang=ru").json()
    assert s["total_scans"] >= 2 and len(s["activity"]) == 14
    assert s["threats_detected"] >= 1
    t = client.get("/api/threats?lang=kk").json()
    assert t["categories"] and t["reference_patterns"] and "disclaimer" in t


def test_demo_scenarios_endpoint(client):
    d = client.get("/api/demo/scenarios?lang=en").json()
    assert len(d) >= 5 and all(x["is_test_example"] for x in d)
