import asyncio

import pytest

from app.demo import SCENARIOS
from app.engine.net_checks import BlockedTarget, assert_public_host
from app.engine.pipeline import analyze
from app.engine.redact import redact
from app.engine.url_analyzer import analyze_url_static, extract_urls

LEVEL_ORDER = ["low", "moderate", "high", "critical"]


def run(content, input_type="message", lang="ru"):
    return asyncio.run(analyze(content, input_type, lang))


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["id"])
@pytest.mark.parametrize("lang", ["en", "ru", "kk"])
def test_demo_scenarios_reach_expected_level(scenario, lang):
    r = run(scenario["content"][lang], scenario["input_type"], lang)
    got, want = LEVEL_ORDER.index(r.risk_level), LEVEL_ORDER.index(scenario["expected"])
    if scenario["expected"] == "low":
        assert r.risk_level == "low", (r.risk_score, [i.id for i in r.indicators])
    else:
        assert got >= want, (lang, r.risk_score, [i.id for i in r.indicators])


@pytest.mark.parametrize("text", [
    "Kaspi: Код подтверждения 4821. Никому не сообщайте этот код.",
    "Halyk Bank: покупка 3 500 ₸, Magnum. Баланс 120 000 ₸.",
    "Сәлем! Kaspi арқылы ақшаны жібердім, тексеріп жіберші.",
    "Your Wolt order is on the way and will arrive in 15 minutes.",
    "Встреча с командой переносится на четверг, повестка дня в документе.",
])
def test_legitimate_messages_with_brands_stay_low(text):
    r = run(text)
    assert r.risk_level == "low", (r.risk_score, [i.id for i in r.indicators])


def test_brand_alone_is_not_impersonation():
    r = run("Я сегодня открыл депозит в Kaspi, очень удобно")
    assert not any(i.id == "bank_impersonation" for i in r.indicators)


def test_otp_request_is_critical_signal():
    r = run("Здравствуйте, это служба безопасности Halyk. Продиктуйте код из СМС, чтобы отменить операцию.")
    ids = {i.id for i in r.indicators}
    assert {"otp_request", "security_service", "bank_impersonation"} <= ids
    assert r.risk_level in ("high", "critical")
    assert r.threat_type in ("bank_impersonation", "phishing")


@pytest.mark.parametrize("url,expected_id", [
    ("http://kaspi-bonus.top/gift", "brand_lookalike"),
    ("https://kaspl.kz/login", "typosquat"),
    ("http://192.168.1.10/admin", "ip_host"),
    ("https://xn--kspi-5ve.kz", "punycode"),
    ("https://kаspi.kz", "homograph"),  # Cyrillic 'а'
    ("https://bit.ly/3abcd", "shortener"),
    ("https://kaspi.kz@evil.example.com/", "userinfo_trick"),
    ("javascript:alert(1)", "dangerous_scheme"),
])
def test_url_indicators(url, expected_id):
    _, inds = analyze_url_static(url, "en")
    assert expected_id in {i.id for i in inds}


def test_official_domain_is_low():
    r = run("https://kaspi.kz/shop", "url", "en")
    assert r.risk_level == "low"
    assert any(i.id == "official_domain" for i in r.indicators)


def test_extract_urls_from_text():
    urls = extract_urls("Перейдите: kaspi-verify.top/login или https://bit.ly/x1 .")
    assert "kaspi-verify.top/login" in urls and "https://bit.ly/x1" in urls


@pytest.mark.parametrize("host", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "localhost", "[::1]", "metadata.internal", "0.0.0.0"])
def test_ssrf_guard_blocks_internal_targets(host):
    with pytest.raises(BlockedTarget):
        asyncio.run(assert_public_host(host, None))


def test_ssrf_guard_blocks_odd_ports():
    with pytest.raises(BlockedTarget):
        asyncio.run(assert_public_host("8.8.8.8", 22))


def test_redaction_masks_sensitive_data():
    out = redact("Карта 4400 4301 2345 6789, код: 482913, пароль: qwerty123, ИИН 900101300123")
    assert "4400 4301" not in out and "482913" not in out and "qwerty123" not in out and "900101300123" not in out
