"""Network-based URL checks with strict SSRF protection.

Safety model:
* Only http/https; only ports 80/443/8080/8443.
* Every hostname is resolved first and *all* resolved addresses must be public (no loopback, private,
  link-local / cloud-metadata, multicast, reserved or CGNAT ranges).
* Redirects are followed manually (max N hops) and each hop is re-validated.
* Short timeouts, a hard response-size cap, no cookies, content is never rendered or executed.
"""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import logging
import re
import socket
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import httpx

from ..config import get_settings
from ..schemas import CheckResult, Indicator
from .ruleset import make_indicator
from .url_analyzer import ParsedUrl, is_official, is_public_ip, parse_url, registrable_domain

log = logging.getLogger("scamshield.net")
ALLOWED_PORTS = {None, 80, 443, 8080, 8443}
UA = "ScamShieldAI-Scanner/1.0 (+security analysis; no tracking)"


class BlockedTarget(Exception):
    pass


async def assert_public_host(host: str, port: int | None) -> list[str]:
    if port not in ALLOWED_PORTS:
        raise BlockedTarget(f"port {port} not allowed")
    host = host.strip("[]")
    if host in ("localhost",) or host.endswith((".localhost", ".local", ".internal", ".lan", ".home")):
        raise BlockedTarget("internal hostname")
    try:
        ip = ipaddress.ip_address(host)
        if not is_public_ip(str(ip)):
            raise BlockedTarget("non-public IP")
        return [str(ip)]
    except ValueError:
        pass
    loop = asyncio.get_running_loop()
    try:
        infos = await asyncio.wait_for(loop.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM), timeout=3)
    except (socket.gaierror, asyncio.TimeoutError) as e:
        raise LookupError("DNS resolution failed") from e
    addrs = sorted({i[4][0] for i in infos})
    if not addrs:
        raise LookupError("no addresses")
    for a in addrs:
        if not is_public_ip(a.split("%")[0]):
            raise BlockedTarget("resolves to non-public address")
    return addrs


@dataclass
class FetchReport:
    reachable: bool = False
    https_ok: bool | None = None
    tls_error: bool = False
    status_code: int | None = None
    redirect_chain: list[str] = field(default_factory=list)
    final_url: str | None = None
    has_password_form: bool = False
    has_card_form: bool = False
    title: str | None = None
    blocked_reason: str | None = None
    error: str | None = None


async def safe_fetch(p: ParsedUrl) -> FetchReport:
    s = get_settings()
    rep = FetchReport()
    url = p.normalized
    timeout = httpx.Timeout(s.fetch_timeout_seconds, connect=3.0)
    async with httpx.AsyncClient(follow_redirects=False, timeout=timeout, verify=True,
                                 headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.5"}) as client:
        for _hop in range(s.fetch_max_redirects + 1):
            try:
                parts = urlsplit(url)
                hop_port = parts.port
            except ValueError:
                rep.blocked_reason = "malformed redirect target"
                return rep
            if parts.scheme not in ("http", "https"):
                rep.blocked_reason = f"redirect to disallowed scheme '{parts.scheme}'"
                return rep
            try:
                await assert_public_host(parts.hostname or "", hop_port)
            except BlockedTarget as e:
                rep.blocked_reason = str(e)
                return rep
            except LookupError as e:
                rep.error = str(e)
                return rep
            try:
                async with client.stream("GET", url) as resp:
                    rep.reachable = True
                    rep.status_code = resp.status_code
                    if resp.is_redirect and resp.headers.get("location"):
                        url = urljoin(url, resp.headers["location"])
                        rep.redirect_chain.append(url)
                        continue
                    body = b""
                    ctype = resp.headers.get("content-type", "")
                    if "html" in ctype or "text" in ctype:
                        async for chunk in resp.aiter_bytes():
                            body += chunk
                            if len(body) >= s.fetch_max_bytes:
                                break
                    rep.final_url = str(resp.url)
                    html = body[: s.fetch_max_bytes].decode("utf-8", errors="ignore")
                    rep.has_password_form = bool(re.search(r"<input[^>]+type=[\"']?password", html, re.I))
                    rep.has_card_form = bool(re.search(r"(cvv|cvc|card[-_ ]?number|номер карты|cc-number)", html, re.I))
                    t = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
                    rep.title = re.sub(r"\s+", " ", t.group(1)).strip()[:120] if t else None
                    rep.https_ok = rep.final_url.startswith("https://")
                    return rep
            except httpx.ConnectError as e:
                if "CERTIFICATE" in str(e).upper() or "SSL" in str(e).upper():
                    rep.tls_error = True
                    rep.error = "TLS certificate validation failed"
                else:
                    rep.error = "connection failed"
                return rep
            except httpx.TimeoutException:
                rep.error = "timed out"
                return rep
            except (httpx.HTTPError, httpx.InvalidURL, ValueError) as e:
                rep.error = type(e).__name__
                return rep
        rep.error = "too many redirects"
        return rep


async def domain_age_days(domain: str) -> tuple[int | None, str]:
    """RDAP registration date lookup (public, no key). Returns (age_days, detail)."""
    if not re.fullmatch(r"[a-z0-9.-]{1,253}", domain):
        return None, "domain not eligible for RDAP lookup"
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as c:
            r = await c.get(f"https://rdap.org/domain/{domain}", headers={"Accept": "application/rdap+json"})
        if r.status_code != 200:
            return None, f"RDAP returned HTTP {r.status_code} (registry may not support RDAP)"
        for ev in r.json().get("events", []):
            if ev.get("eventAction") == "registration":
                dt = datetime.fromisoformat(ev["eventDate"].replace("Z", "+00:00"))
                return (datetime.now(timezone.utc) - dt).days, f"registered {dt.date().isoformat()}"
        return None, "registration date not published"
    except Exception as e:  # noqa: BLE001 — external service; report as unavailable
        log.info("RDAP lookup failed: %s", type(e).__name__)
        return None, "RDAP service unavailable"


async def safe_browsing(url: str) -> tuple[bool | None, str]:
    key = get_settings().google_safe_browsing_api_key
    if not key:
        return None, "not configured (GOOGLE_SAFE_BROWSING_API_KEY)"
    body = {
        "client": {"clientId": "scamshield-ai", "clientVersion": "1.0"},
        "threatInfo": {"threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                       "platformTypes": ["ANY_PLATFORM"], "threatEntryTypes": ["URL"], "threatEntries": [{"url": url}]},
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post("https://safebrowsing.googleapis.com/v4/threatMatches:find", params={"key": key}, json=body)
        r.raise_for_status()
        matches = r.json().get("matches", [])
        if matches:
            return True, "listed as " + ", ".join(sorted({m["threatType"] for m in matches}))
        return False, "not listed"
    except Exception as e:  # noqa: BLE001
        return None, f"lookup failed ({type(e).__name__})"


async def virustotal(url: str) -> tuple[bool | None, str]:
    key = get_settings().virustotal_api_key
    if not key:
        return None, "not configured (VIRUSTOTAL_API_KEY)"
    uid = base64.urlsafe_b64encode(url.encode()).decode().strip("=")
    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            r = await c.get(f"https://www.virustotal.com/api/v3/urls/{uid}", headers={"x-apikey": key})
        if r.status_code == 404:
            return None, "URL not yet known to VirusTotal"
        r.raise_for_status()
        stats = r.json()["data"]["attributes"]["last_analysis_stats"]
        mal = stats.get("malicious", 0) + stats.get("suspicious", 0)
        return (mal >= 2), f"{stats.get('malicious', 0)} malicious / {stats.get('suspicious', 0)} suspicious engine verdicts"
    except Exception as e:  # noqa: BLE001
        return None, f"lookup failed ({type(e).__name__})"


_N = {
    "redirect_offsite": ({"en": "Redirects to another domain", "ru": "Перенаправляет на другой домен", "kk": "Басқа доменге бағыттайды"},
                         {"en": "The link silently redirects to {ev}.", "ru": "Ссылка незаметно перенаправляет на {ev}.", "kk": "Сілтеме байқатпай {ev} мекенжайына бағыттайды."}),
    "password_form": ({"en": "Login form on unofficial site", "ru": "Форма входа на неофициальном сайте", "kk": "Ресми емес сайттағы кіру формасы"},
                      {"en": "The page asks for a password but is not an official domain.", "ru": "Страница запрашивает пароль, но не является официальным доменом.", "kk": "Бет құпиясөз сұрайды, бірақ ресми домен емес."}),
    "card_form": ({"en": "Card data collection", "ru": "Сбор данных банковской карты", "kk": "Банк картасының деректерін жинау"},
                  {"en": "The page contains card-number / CVV fields on an unofficial domain.", "ru": "Страница содержит поля номера карты / CVV на неофициальном домене.", "kk": "Бетте ресми емес доменде карта нөмірі / CVV өрістері бар."}),
    "tls_invalid": ({"en": "Invalid TLS certificate", "ru": "Недействительный TLS-сертификат", "kk": "Жарамсыз TLS сертификаты"},
                    {"en": "The site's HTTPS certificate failed validation.", "ru": "HTTPS-сертификат сайта не прошёл проверку.", "kk": "Сайттың HTTPS сертификаты тексеруден өтпеді."}),
    "young_domain": ({"en": "Newly registered domain", "ru": "Недавно зарегистрированный домен", "kk": "Жақында тіркелген домен"},
                     {"en": "Domain is only {ev} days old. Most scam sites live for days or weeks.", "ru": "Домену всего {ev} дн. Большинство мошеннических сайтов живут дни или недели.", "kk": "Доменге небәрі {ev} күн. Алаяқ сайттардың көбі бірнеше күн не апта ғана өмір сүреді."}),
    "recent_domain": ({"en": "Recently registered domain", "ru": "Относительно новый домен", "kk": "Салыстырмалы жаңа домен"},
                      {"en": "Domain is {ev} days old.", "ru": "Возраст домена — {ev} дн.", "kk": "Домен жасы — {ev} күн."}),
    "reputation_hit": ({"en": "Flagged by threat intelligence", "ru": "Отмечен в базах угроз", "kk": "Қауіп базаларында белгіленген"},
                       {"en": "{ev}", "ru": "{ev}", "kk": "{ev}"}),
    "internal_target": ({"en": "Points to an internal network", "ru": "Ведёт во внутреннюю сеть", "kk": "Ішкі желіге апарады"},
                        {"en": "The link targets a private or internal address ({ev}); it was not fetched.", "ru": "Ссылка ведёт на внутренний адрес ({ev}); она не была открыта.", "kk": "Сілтеме ішкі мекенжайға ({ev}) апарады; ол ашылмады."}),
}


def _ind(key: str, lang: str, ev: str = "") -> Indicator:
    name, desc = _N[key]
    return make_indicator(key, name[lang], desc[lang].format(ev=ev), evidence=ev or None, evidence_type="external",
                          source="intel" if key in ("reputation_hit", "young_domain", "recent_domain") else "url")


async def run_network_checks(p: ParsedUrl, lang: str) -> tuple[list[Indicator], list[CheckResult]]:
    s = get_settings()
    indicators: list[Indicator] = []
    checks: list[CheckResult] = []

    async def fetch_task():
        if not s.enable_url_fetch:
            return CheckResult(name="Safe page inspection", status="skipped", detail="disabled by configuration")
        rep = await safe_fetch(p)
        if rep.blocked_reason:
            indicators.append(_ind("internal_target", lang, rep.blocked_reason))
            return CheckResult(name="Safe page inspection", status="flagged", detail=f"blocked by SSRF guard: {rep.blocked_reason}")
        if rep.tls_error:
            indicators.append(_ind("tls_invalid", lang))
            return CheckResult(name="Safe page inspection", status="flagged", detail="TLS certificate validation failed")
        if not rep.reachable:
            return CheckResult(name="Safe page inspection", status="unavailable", detail=f"site not reachable ({rep.error})")
        flagged = False
        if rep.final_url:
            final_host = urlsplit(rep.final_url).hostname or ""
            if final_host and registrable_domain(final_host) != p.registrable:
                indicators.append(_ind("redirect_offsite", lang, final_host))
                flagged = True
            official_final = is_official(final_host)
            if rep.has_password_form and not official_final:
                indicators.append(_ind("password_form", lang))
                flagged = True
            if rep.has_card_form and not official_final:
                indicators.append(_ind("card_form", lang))
                flagged = True
        hops = f", {len(rep.redirect_chain)} redirect(s)" if rep.redirect_chain else ""
        https = "HTTPS ok" if rep.https_ok else "no HTTPS"
        return CheckResult(name="Safe page inspection", status="flagged" if flagged else "passed",
                           detail=f"HTTP {rep.status_code}, {https}{hops}")

    async def age_task():
        if not s.enable_domain_age or p.is_ip:
            return CheckResult(name="Domain age (RDAP)", status="skipped", detail="disabled" if not p.is_ip else "IP address")
        days, detail = await domain_age_days(p.registrable)
        if days is None:
            return CheckResult(name="Domain age (RDAP)", status="unavailable", detail=detail)
        if days < 30:
            indicators.append(_ind("young_domain", lang, str(days)))
            return CheckResult(name="Domain age (RDAP)", status="flagged", detail=detail)
        if days < 180:
            indicators.append(_ind("recent_domain", lang, str(days)))
            return CheckResult(name="Domain age (RDAP)", status="flagged", detail=detail)
        return CheckResult(name="Domain age (RDAP)", status="passed", detail=detail)

    async def rep_task(name, fn):
        hit, detail = await fn(p.normalized)
        if hit is None:
            st = "skipped" if detail.startswith("not configured") else "unavailable"
            return CheckResult(name=name, status=st, detail=detail)
        if hit:
            indicators.append(_ind("reputation_hit", lang, f"{name}: {detail}"))
            return CheckResult(name=name, status="flagged", detail=detail)
        return CheckResult(name=name, status="passed", detail=detail)

    results = await asyncio.gather(
        fetch_task(), age_task(), rep_task("Google Safe Browsing", safe_browsing), rep_task("VirusTotal", virustotal),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, CheckResult):
            checks.append(r)
        else:
            log.warning("network check crashed: %s", type(r).__name__)
            checks.append(CheckResult(name="Network check", status="error", detail="internal error"))
    return indicators, checks


__all__ = ["run_network_checks", "assert_public_host", "BlockedTarget", "parse_url"]
