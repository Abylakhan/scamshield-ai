"""Static URL / domain analysis. Never makes network requests."""
from __future__ import annotations

import ipaddress
import re
import socket
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlsplit

from ..schemas import Indicator
from .ruleset import make_indicator as _rs_make

OFFICIAL_DOMAINS = {
    "kaspi.kz", "halykbank.kz", "homebank.kz", "egov.kz", "gov.kz", "elicense.kz", "freedombank.kz", "ffin.kz",
    "jusan.kz", "bcc.kz", "forte.kz", "fortebank.com", "nationalbank.kz", "kazpost.kz", "post.kz", "cdek.kz",
    "wildberries.kz", "wildberries.ru", "ozon.kz", "ozon.ru", "olx.kz", "krisha.kz", "kolesa.kz", "glovoapp.com",
    "telegram.org", "t.me", "whatsapp.com", "google.com", "apple.com", "microsoft.com", "gosuslugi.ru", "1fin.kz",
}
# Brand tokens that scammers embed in look-alike domains, mapped to the real domain.
BRAND_TOKENS = {
    "kaspi": "kaspi.kz", "halyk": "halykbank.kz", "homebank": "homebank.kz", "egov": "egov.kz", "freedom": "freedombank.kz",
    "jusan": "jusan.kz", "forte": "forte.kz", "kazpost": "kazpost.kz", "wildberries": "wildberries.kz", "ozon": "ozon.kz",
    "olx": "olx.kz", "cdek": "cdek.kz", "telegram": "telegram.org", "whatsapp": "whatsapp.com", "nationalbank": "nationalbank.kz",
}
MULTI_PART_SUFFIXES = {"com.kz", "org.kz", "net.kz", "edu.kz", "gov.kz", "mil.kz", "co.uk", "com.ru", "org.ru", "com.ua", "com.tr", "co.jp", "com.au"}
SUSPICIOUS_TLDS = {"top", "xyz", "click", "icu", "buzz", "live", "online", "site", "shop", "rest", "cfd", "sbs", "monster",
                   "tk", "ml", "ga", "cf", "gq", "work", "loan", "vip", "win", "bid", "cyou", "quest", "pw", "fun", "store"}
SHORTENERS = {"bit.ly", "tinyurl.com", "clck.ru", "cutt.ly", "t.ly", "is.gd", "goo.su", "rb.gy", "ow.ly", "shorturl.at",
              "tiny.cc", "u.to", "vk.cc", "s.id", "rebrand.ly", "lnkd.in"}
PATH_KEYWORDS = re.compile(
    r"login|log-in|signin|sign-in|verify|verif|secure|update|account|unlock|confirm|wallet|bonus|gift|prize|"
    r"payment|oplata|vozvrat|kompensac|refund|delivery|dostavka|claim|recover|password|auth",
    re.I,
)

URL_IN_TEXT = re.compile(
    r"(?:(?:https?|hxxps?)://|www\.)[^\s<>\"'()]+|\b(?:[a-z0-9-]+\.)+(?:kz|com|ru|net|org|top|xyz|site|online|info|click|shop|live|icu|me|io|ly|cc|app|link|biz|pro|store|vip)(?:/[^\s<>\"'()]*)?",
    re.I,
)

_T: dict[str, tuple[dict, dict]] = {
    # id: (name, description) — weight/severity/category live in ruleset.json
    "dangerous_scheme": ({"en": "Dangerous link scheme", "ru": "Опасная схема ссылки", "kk": "Қауіпті сілтеме схемасы"},
                         {"en": "Uses a non-web scheme ({ev}) that can execute code or open local files.",
                          "ru": "Использует не-веб схему ({ev}), которая может выполнить код или открыть локальные файлы.",
                          "kk": "Код орындай алатын немесе жергілікті файлдарды аша алатын веб емес схеманы ({ev}) пайдаланады."}),
    "ip_host": ({"en": "Raw IP address instead of domain", "ru": "IP-адрес вместо домена", "kk": "Домен орнына IP-мекенжай"},
                {"en": "The link points to a bare IP address ({ev}). Legitimate services use named domains.",
                 "ru": "Ссылка ведёт на голый IP-адрес ({ev}). Легитимные сервисы используют доменные имена.",
                 "kk": "Сілтеме жалаң IP-мекенжайға ({ev}) апарады. Заңды қызметтер домен атауларын пайдаланады."}),
    "userinfo_trick": ({"en": "Deceptive '@' in URL", "ru": "Обманный символ «@» в ссылке", "kk": "Сілтемедегі алдамшы «@» белгісі"},
                       {"en": "Text before '@' is ignored by browsers — the real destination is {ev}.",
                        "ru": "Браузер игнорирует текст до «@» — реальный адрес: {ev}.",
                        "kk": "Браузер «@» алдындағы мәтінді елемейді — нақты мекенжай: {ev}."}),
    "punycode": ({"en": "Punycode / internationalized domain", "ru": "Punycode / интернационализированный домен", "kk": "Punycode / халықаралық домен"},
                 {"en": "The domain uses encoded non-Latin characters ({ev}), often used to mimic real brands.",
                  "ru": "Домен содержит закодированные нелатинские символы ({ev}) — часто используется для имитации брендов.",
                  "kk": "Доменде кодталған латын емес таңбалар бар ({ev}) — брендтерге еліктеу үшін жиі қолданылады."}),
    "homograph": ({"en": "Mixed-script homograph domain", "ru": "Домен-омограф со смешанными алфавитами", "kk": "Аралас әліпбилі омограф домен"},
                  {"en": "Mixes Latin and Cyrillic look-alike letters ({ev}) to impersonate a real domain.",
                   "ru": "Смешивает похожие латинские и кириллические буквы ({ev}), чтобы выдать себя за настоящий домен.",
                   "kk": "Нағыз доменге ұқсау үшін ұқсас латын және кирилл әріптерін араластырады ({ev})."}),
    "brand_lookalike": ({"en": "Brand look-alike domain", "ru": "Домен, имитирующий бренд", "kk": "Брендке ұқсайтын домен"},
                        {"en": "Contains '{ev}' but is not the official domain. Real address: {official}.",
                         "ru": "Содержит «{ev}», но не является официальным доменом. Настоящий адрес: {official}.",
                         "kk": "«{ev}» бар, бірақ ресми домен емес. Нағыз мекенжай: {official}."}),
    "typosquat": ({"en": "Typosquatted brand domain", "ru": "Домен с опечаткой бренда", "kk": "Бренд атауы қате жазылған домен"},
                  {"en": "'{ev}' is one or two characters away from '{official}' — a typosquatting trick.",
                   "ru": "«{ev}» отличается от «{official}» на один-два символа — приём тайпсквоттинга.",
                   "kk": "«{ev}» «{official}» атауынан бір-екі таңбаға ғана ерекшеленеді — тайпсквоттинг тәсілі."}),
    "suspicious_tld": ({"en": "High-abuse domain zone", "ru": "Доменная зона с частыми злоупотреблениями", "kk": "Жиі теріс пайдаланылатын домен аймағы"},
                       {"en": "The .{ev} zone is cheap and frequently used for short-lived scam sites.",
                        "ru": "Зона .{ev} дешёвая и часто используется для краткосрочных мошеннических сайтов.",
                        "kk": ".{ev} аймағы арзан және қысқа мерзімді алаяқ сайттар үшін жиі қолданылады."}),
    "shortener": ({"en": "URL shortener hides destination", "ru": "Сокращатель ссылок скрывает адрес", "kk": "Қысқартқыш сілтеменің мекенжайын жасырады"},
                  {"en": "{ev} hides the real destination. Scammers use shorteners to bypass filters.",
                   "ru": "{ev} скрывает реальный адрес. Мошенники используют сокращатели, чтобы обойти фильтры.",
                   "kk": "{ev} нақты мекенжайды жасырады. Алаяқтар сүзгілерді айналып өту үшін қысқартқыштарды пайдаланады."}),
    "many_subdomains": ({"en": "Unusually deep subdomains", "ru": "Необычно глубокие поддомены", "kk": "Әдеттен тыс терең субдомендер"},
                        {"en": "The host has many nested subdomains ({ev}), often used to push the real domain out of view.",
                         "ru": "Адрес содержит много вложенных поддоменов ({ev}) — так прячут настоящий домен.",
                         "kk": "Мекенжайда көп кірістірілген субдомендер бар ({ev}) — нағыз доменді жасыру тәсілі."}),
    "path_keywords": ({"en": "Phishing keywords in URL", "ru": "Фишинговые слова в ссылке", "kk": "Сілтемедегі фишинг сөздері"},
                      {"en": "The URL contains '{ev}', typical of fake login and payment pages.",
                       "ru": "Ссылка содержит «{ev}», что типично для поддельных страниц входа и оплаты.",
                       "kk": "Сілтемеде «{ev}» бар — жалған кіру және төлем беттеріне тән."}),
    "hyphenated": ({"en": "Heavily hyphenated domain", "ru": "Домен с множеством дефисов", "kk": "Көп сызықшасы бар домен"},
                   {"en": "Domains like '{ev}' with several hyphens are common in phishing.",
                    "ru": "Домены вида «{ev}» с несколькими дефисами часто используются в фишинге.",
                    "kk": "«{ev}» сияқты бірнеше сызықшасы бар домендер фишингте жиі кездеседі."}),
    "odd_port": ({"en": "Non-standard port", "ru": "Нестандартный порт", "kk": "Стандартты емес порт"},
                 {"en": "Uses port {ev}, unusual for public websites.",
                  "ru": "Использует порт {ev}, необычный для публичных сайтов.",
                  "kk": "Жалпыға ортақ сайттар үшін әдеттен тыс {ev} портын пайдаланады."}),
    "no_https": ({"en": "Unencrypted HTTP link", "ru": "Незашифрованная HTTP-ссылка", "kk": "Шифрланбаған HTTP сілтеме"},
                 {"en": "The link uses plain HTTP; any data entered can be intercepted.",
                  "ru": "Ссылка использует HTTP без шифрования; введённые данные могут быть перехвачены.",
                  "kk": "Сілтеме шифрсыз HTTP пайдаланады; енгізілген деректерді ұстап алуға болады."}),
    "long_url": ({"en": "Obfuscated long URL", "ru": "Длинная запутанная ссылка", "kk": "Ұзын шатастырылған сілтеме"},
                 {"en": "The link is unusually long ({ev}…), which can hide its real purpose.",
                  "ru": "Ссылка необычно длинная ({ev}…) — это может скрывать её истинное назначение.",
                  "kk": "Сілтеме әдеттен тыс ұзын ({ev}…) — бұл оның шын мақсатын жасыруы мүмкін."}),
    "phishing_url_combo": ({"en": "Impersonation domain with phishing traits", "ru": "Домен-двойник с признаками фишинга", "kk": "Фишинг белгілері бар жалған домен"},
                           {"en": "A brand look-alike domain combined with login/payment paths or a high-abuse zone is a strong phishing pattern.",
                            "ru": "Домен-двойник бренда в сочетании с путями входа/оплаты или подозрительной зоной — сильный признак фишинга.",
                            "kk": "Брендке ұқсас домен мен кіру/төлем жолдарының немесе күдікті аймақтың үйлесімі — фишингтің күшті белгісі."}),
    "internal_target": ({"en": "Points to an internal network", "ru": "Ведёт во внутреннюю сеть", "kk": "Ішкі желіге апарады"},
                        {"en": "The link targets a private, loopback or internal address ({ev}). Public services never use these; it is not fetched.",
                         "ru": "Ссылка ведёт на частный, локальный или внутренний адрес ({ev}). Публичные сервисы их не используют; ссылка не открывается.",
                         "kk": "Сілтеме жеке, жергілікті немесе ішкі мекенжайға ({ev}) апарады. Жалпыға ортақ қызметтер оларды қолданбайды; сілтеме ашылмайды."}),
    "official_domain": ({"en": "Verified official domain", "ru": "Подтверждённый официальный домен", "kk": "Расталған ресми домен"},
                        {"en": "{ev} is on the list of known official domains of Kazakhstan services.",
                         "ru": "{ev} входит в список известных официальных доменов сервисов Казахстана.",
                         "kk": "{ev} Қазақстан қызметтерінің белгілі ресми домендері тізімінде бар."}),
}


def make_indicator(key: str, lang: str, ev: str = "", source: str = "url", evidence_type: str = "content", **fmt) -> Indicator:
    name, desc = _T[key]
    return _rs_make(key, name[lang], desc[lang].format(ev=ev, **fmt), evidence=ev or None, source=source, evidence_type=evidence_type)


@dataclass
class ParsedUrl:
    original: str
    normalized: str
    scheme: str
    host: str  # ascii / punycode form (canonical dotted form for IPv4 written in octal/hex/decimal)
    raw_host: str  # host exactly as written in the input
    unicode_host: str
    registrable: str
    port: int | None
    path: str
    is_ip: bool
    official: bool


def registrable_domain(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in MULTI_PART_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def is_official(host: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in OFFICIAL_DOMAINS)


class UrlError(ValueError):
    pass


_HOST_OK = re.compile(r"^[a-z0-9\-_.]+$")  # after IDNA encoding
_NUMERIC_HOST = re.compile(r"^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){0,3}$", re.I)


def _numeric_ipv4(host: str) -> str | None:
    """Canonical dotted IPv4 for obfuscated forms browsers accept (127.1, 0x7f000001, 2130706433, 0177.0.0.1)."""
    if not _NUMERIC_HOST.match(host):
        return None
    try:
        return socket.inet_ntoa(socket.inet_aton(host))
    except OSError:
        return None


def is_public_ip(host: str) -> bool:
    ip = ipaddress.ip_address(host)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local or ip.is_private)


def parse_url(raw: str) -> ParsedUrl:
    raw = raw.strip().replace("hxxp", "http")
    if not re.match(r"^[a-z][a-z0-9+.-]*:", raw, re.I) or re.match(r"^[^/]+:\d+", raw):
        raw = "http://" + raw
    parts = urlsplit(raw)
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise UrlError(scheme)
    host = (parts.hostname or "").rstrip(".")
    if not host:
        raise UrlError("empty-host")
    try:
        port = parts.port
    except ValueError as e:
        raise UrlError("bad-port") from e
    unicode_host = host
    try:
        ascii_host = host.encode("idna").decode("ascii").lower() if not host.isascii() else host.lower()
    except UnicodeError:
        ascii_host = host.lower()
    if ascii_host.isascii() and "xn--" in ascii_host:
        try:
            unicode_host = ascii_host.encode("ascii").decode("idna")
        except UnicodeError:
            unicode_host = ascii_host
    raw_host = ascii_host
    is_ip = False
    try:
        ipaddress.ip_address(ascii_host)
        is_ip = True
    except ValueError:
        canonical = _numeric_ipv4(ascii_host)
        if canonical:
            ascii_host = unicode_host = canonical
            is_ip = True
    if not is_ip and (not _HOST_OK.match(ascii_host) or ".." in ascii_host or len(ascii_host) > 253):
        raise UrlError("invalid-host")
    if any(ch.isspace() for ch in raw):
        raise UrlError("whitespace")
    host_part = f"[{ascii_host}]" if ":" in ascii_host else ascii_host
    normalized = f"{scheme}://{host_part}{':' + str(port) if port else ''}{parts.path or '/'}"
    if parts.query:
        normalized += "?" + parts.query
    return ParsedUrl(
        original=raw, normalized=normalized, scheme=scheme, host=ascii_host, raw_host=raw_host, unicode_host=unicode_host,
        registrable=ascii_host if is_ip else registrable_domain(ascii_host), port=port,
        path=(parts.path or "") + ("?" + parts.query if parts.query else ""), is_ip=is_ip,
        official=(not is_ip) and is_official(ascii_host),
    )


def _levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


_LEET = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a"})


def _scripts(label: str) -> set[str]:
    out = set()
    for ch in label:
        if ch.isalpha():
            n = unicodedata.name(ch, "")
            out.add("CYRILLIC" if "CYRILLIC" in n else "LATIN" if "LATIN" in n else "OTHER")
    return out


def analyze_url_static(raw: str, lang: str) -> tuple[ParsedUrl | None, list[Indicator]]:
    ind: list[Indicator] = []
    lowered = raw.strip().lower()
    m = DANGEROUS_SCHEME.match(lowered)
    if m:
        return None, [make_indicator("dangerous_scheme", lang, m.group(1) + ":")]
    try:
        p = parse_url(raw)
    except UrlError:
        return None, []

    if "@" in urlsplit(p.original).netloc:
        ind.append(make_indicator("userinfo_trick", lang, p.host))
    if p.official:
        ind.append(make_indicator("official_domain", lang, p.registrable))
        return p, ind

    if p.is_ip:
        ind.append(make_indicator("ip_host", lang, p.raw_host))
        if not is_public_ip(p.host):
            ind.append(make_indicator("internal_target", lang, p.raw_host))
    elif p.host == "localhost" or p.host.endswith((".localhost", ".local", ".internal", ".lan", ".home")):
        ind.append(make_indicator("internal_target", lang, p.raw_host))
    if "xn--" in p.host:
        ind.append(make_indicator("punycode", lang, next((lbl for lbl in p.host.split(".") if lbl.startswith("xn--")), p.host)))
    for label in p.unicode_host.split("."):
        if {"LATIN", "CYRILLIC"} <= _scripts(label):
            ind.append(make_indicator("homograph", lang, label))
            break
    if p.registrable in SHORTENERS:
        ind.append(make_indicator("shortener", lang, p.registrable))

    if not p.is_ip:
        sld = p.registrable.split(".")[0]
        tld = p.host.rsplit(".", 1)[-1]
        labels = p.host.split(".")
        # Brand token embedded in a non-official host (kaspi-bonus.top, kaspi.kz.secure-pay.com)
        hit = next((t for t in BRAND_TOKENS if (len(t) >= 5 and t != "forte" and t in p.host.replace("-", ""))
                    or re.search(rf"(^|[.-]){t}([.-]|\d|$)", p.host)), None)
        if hit:
            ind.append(make_indicator("brand_lookalike", lang, hit, official=BRAND_TOKENS[hit]))
        else:
            norm_sld = sld.translate(_LEET)
            for token, official in BRAND_TOKENS.items():
                if len(token) >= 4 and sld != token and 0 < _levenshtein(norm_sld, token) <= (1 if len(token) <= 5 else 2):
                    ind.append(make_indicator("typosquat", lang, sld, official=official))
                    break
                if norm_sld == token and sld != token:
                    ind.append(make_indicator("typosquat", lang, sld, official=official))
                    break
        if tld in SUSPICIOUS_TLDS:
            ind.append(make_indicator("suspicious_tld", lang, tld))
        if len(labels) - len(p.registrable.split(".")) >= 3:
            ind.append(make_indicator("many_subdomains", lang, p.host))
        if sld.count("-") >= 2:
            ind.append(make_indicator("hyphenated", lang, p.registrable))

    km = PATH_KEYWORDS.search(p.path) or (PATH_KEYWORDS.search(p.host) if not p.is_ip else None)
    if km:
        ind.append(make_indicator("path_keywords", lang, km.group(0)))
    if p.port and p.port not in (80, 443):
        ind.append(make_indicator("odd_port", lang, str(p.port)))
    if re.match(r"^\s*http://", raw, re.I):  # only when the link explicitly uses http — an omitted scheme is not evidence
        ind.append(make_indicator("no_https", lang, raw.strip()[:7]))
    ids = {i.id for i in ind}
    if ids & {"brand_lookalike", "typosquat", "homograph"} and ids & {"path_keywords", "suspicious_tld", "ip_host"}:
        combo = " + ".join(i.evidence or "" for i in ind if i.id in ("brand_lookalike", "typosquat", "homograph", "path_keywords", "suspicious_tld", "ip_host"))
        ind.append(make_indicator("phishing_url_combo", lang, combo, evidence_type="derived"))
    if len(p.normalized) > 120:
        ind.append(make_indicator("long_url", lang, raw.strip()[:60]))
    return p, ind


DANGEROUS_SCHEME = re.compile(r"^\s*(javascript|data|file|vbscript|ftp|blob|about|chrome|ms-\w+):", re.I)


def validate_url_input(raw: str) -> str | None:
    """Error message for input that is neither a parseable web address nor a recognisable dangerous-scheme link."""
    if DANGEROUS_SCHEME.match(raw):
        return None
    try:
        parse_url(raw)
    except UrlError as e:
        return {"whitespace": "The address contains spaces.", "bad-port": "The port number is invalid.",
                "empty-host": "The address has no domain name."}.get(str(e), "This is not a valid web address.")
    return None


def extract_urls(text: str, limit: int = 5) -> list[str]:
    seen: list[str] = []
    for m in URL_IN_TEXT.finditer(text):
        u = m.group(0).rstrip(".,;:!?)»")
        if u not in seen:
            seen.append(u)
        if len(seen) >= limit:
            break
    return seen
