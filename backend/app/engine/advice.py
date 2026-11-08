"""Localized summaries and protective recommendations derived from detected indicators."""
from __future__ import annotations

from ..schemas import Indicator

THREAT_LABELS = {
    "phishing": {"en": "Phishing", "ru": "Фишинг", "kk": "Фишинг"},
    "bank_impersonation": {"en": "Bank impersonation", "ru": "Подделка банка", "kk": "Банк атын жамылу"},
    "government_impersonation": {"en": "Government impersonation", "ru": "Подделка госоргана", "kk": "Мемлекеттік орган атын жамылу"},
    "investment_fraud": {"en": "Investment fraud", "ru": "Инвестиционное мошенничество", "kk": "Инвестициялық алаяқтық"},
    "financial_pyramid": {"en": "Financial pyramid", "ru": "Финансовая пирамида", "kk": "Қаржы пирамидасы"},
    "delivery_scam": {"en": "Fake delivery", "ru": "Фейковая доставка", "kk": "Жалған жеткізу"},
    "prize_scam": {"en": "Prize / giveaway scam", "ru": "Мошенничество с выигрышем", "kk": "Ұтыс алаяқтығы"},
    "social_engineering": {"en": "Social engineering", "ru": "Социальная инженерия", "kk": "Әлеуметтік инженерия"},
    "job_scam": {"en": "Job scam", "ru": "Мошенничество с работой", "kk": "Жұмыс алаяқтығы"},
    "malicious_url": {"en": "Suspicious website", "ru": "Подозрительный сайт", "kk": "Күмәнді сайт"},
    "suspicious": {"en": "Needs caution", "ru": "Требует осторожности", "kk": "Сақтық қажет"},
    "safe": {"en": "No threat detected", "ru": "Угроз не обнаружено", "kk": "Қауіп анықталмады"},
}

_SUMMARY = {
    "critical": {"en": "High-confidence indicators of {t}. Treat this as a scam and do not interact with it.",
                 "ru": "Явные признаки: {t}. Считайте это мошенничеством и не взаимодействуйте.",
                 "kk": "Айқын белгілер: {t}. Мұны алаяқтық деп санап, әрекет етпеңіз."},
    "high": {"en": "Multiple strong indicators of {t} were found. Do not act on this content until it is verified independently.",
             "ru": "Найдено несколько серьёзных признаков: {t}. Не выполняйте никаких действий до независимой проверки.",
             "kk": "Бірнеше күшті белгі табылды: {t}. Тәуелсіз тексермейінше ешқандай әрекет жасамаңыз."},
    "moderate": {"en": "Some warning signs were detected ({t}). Verify the sender through an official channel before acting.",
                 "ru": "Обнаружены некоторые тревожные признаки ({t}). Проверьте отправителя через официальный канал.",
                 "kk": "Кейбір күдікті белгілер анықталды ({t}). Әрекет етпес бұрын жіберушіні ресми арна арқылы тексеріңіз."},
    "low": {"en": "No significant scam indicators were detected. Stay attentive as usual.",
            "ru": "Существенных признаков мошенничества не обнаружено. Сохраняйте обычную бдительность.",
            "kk": "Алаяқтықтың елеулі белгілері анықталмады. Әдеттегідей сақ болыңыз."},
}

_REC: dict[str, dict[str, str]] = {
    "no_link": {"en": "Do not open the link or enter any data on the page.", "ru": "Не открывайте ссылку и не вводите на странице никаких данных.", "kk": "Сілтемені ашпаңыз және бетке ешқандай дерек енгізбеңіз."},
    "no_code": {"en": "Never share SMS / verification codes with anyone — including people claiming to be bank staff.", "ru": "Никому не сообщайте SMS-коды — даже тем, кто представляется сотрудником банка.", "kk": "SMS-кодтарды ешкімге айтпаңыз — тіпті банк қызметкері деп таныстырғандарға да."},
    "no_creds": {"en": "Never enter passwords, PIN or CVV in response to a message.", "ru": "Не вводите пароль, PIN или CVV в ответ на сообщение.", "kk": "Хабарламаға жауап ретінде құпиясөз, PIN немесе CVV енгізбеңіз."},
    "call_bank": {"en": "Contact your bank yourself using the number on your card or the official app (Kaspi: 9999, Halyk: 7111).", "ru": "Свяжитесь с банком сами по номеру на карте или через официальное приложение (Kaspi: 9999, Halyk: 7111).", "kk": "Банкпен өзіңіз картадағы нөмір немесе ресми қосымша арқылы хабарласыңыз (Kaspi: 9999, Halyk: 7111)."},
    "no_transfer": {"en": "Do not transfer money to personal cards, phone numbers or 'safe accounts'.", "ru": "Не переводите деньги на личные карты, номера телефонов или «безопасные счета».", "kk": "Жеке карталарға, телефон нөмірлеріне немесе «қауіпсіз шоттарға» ақша аудармаңыз."},
    "invest_check": {"en": "Check the company in the AFR/ARDFM register of licensed organizations before investing.", "ru": "Перед инвестированием проверьте компанию в реестре лицензиатов АРРФР.", "kk": "Инвестиция салмас бұрын компанияны ҚНРДА лицензиаттар тізілімінен тексеріңіз."},
    "pyramid": {"en": "Schemes that pay for recruiting others are financial pyramids, which are illegal in Kazakhstan.", "ru": "Схемы с оплатой за привлечение участников — финансовые пирамиды, запрещённые в Казахстане.", "kk": "Қатысушы тартқаны үшін төлейтін схемалар — Қазақстанда тыйым салынған қаржы пирамидалары."},
    "delivery": {"en": "Check parcel status only in the official app or website of the delivery service.", "ru": "Проверяйте статус посылки только в официальном приложении или на сайте службы доставки.", "kk": "Сәлемдеме мәртебесін тек жеткізу қызметінің ресми қосымшасы немесе сайтынан тексеріңіз."},
    "egov": {"en": "Government fines and payments can be checked only at egov.kz or in the eGov Mobile app.", "ru": "Штрафы и госплатежи проверяйте только на egov.kz или в приложении eGov Mobile.", "kk": "Айыппұлдар мен мемлекеттік төлемдерді тек egov.kz немесе eGov Mobile қосымшасынан тексеріңіз."},
    "family": {"en": "Call your relative back on their known number before sending any money.", "ru": "Перезвоните родственнику на известный вам номер, прежде чем отправлять деньги.", "kk": "Ақша жібермес бұрын туысыңызға өзіңізге белгілі нөмір арқылы қайта қоңырау шалыңыз."},
    "remote": {"en": "Do not install apps or share your screen at a stranger's request.", "ru": "Не устанавливайте приложения и не включайте демонстрацию экрана по просьбе незнакомцев.", "kk": "Бейтаныс адамның өтініші бойынша қосымша орнатпаңыз және экранды көрсетпеңіз."},
    "report": {"en": "Report the scam to the police (102) or via the eGov / Kaspi fraud reporting form, then block the sender.", "ru": "Сообщите о мошенничестве в полицию (102) или через форму на eGov / в Kaspi, затем заблокируйте отправителя.", "kk": "Алаяқтық туралы полицияға (102) немесе eGov / Kaspi формасы арқылы хабарлаңыз, содан кейін жіберушіні бұғаттаңыз."},
    "if_shared": {"en": "If you already shared data or paid, immediately call your bank to block the card and change your passwords.", "ru": "Если вы уже передали данные или оплатили — срочно позвоните в банк, заблокируйте карту и смените пароли.", "kk": "Егер деректерді беріп немесе төлеп қойсаңыз — дереу банкке қоңырау шалып, картаны бұғаттаңыз және құпиясөздерді өзгертіңіз."},
    "verify": {"en": "Verify the sender through an official channel before acting.", "ru": "Перед действием проверьте отправителя через официальный канал.", "kk": "Әрекет етпес бұрын жіберушіні ресми арна арқылы тексеріңіз."},
    "job": {"en": "Legitimate employers never ask you to pay to start working or to 'top up' tasks.", "ru": "Настоящие работодатели не просят платить за трудоустройство или «пополнять» задания.", "kk": "Нағыз жұмыс берушілер жұмысқа кіру үшін төлем сұрамайды."},
    "2fa": {"en": "Enable two-step verification in WhatsApp and Telegram.", "ru": "Включите двухэтапную проверку в WhatsApp и Telegram.", "kk": "WhatsApp және Telegram-да екі сатылы тексеруді қосыңыз."},
    "safe": {"en": "No action needed. As always, never share codes or passwords.", "ru": "Действий не требуется. Как всегда, никому не сообщайте коды и пароли.", "kk": "Әрекет қажет емес. Әдеттегідей, кодтар мен құпиясөздерді ешкімге айтпаңыз."},
    "hang_up": {"en": "Hang up now and call your bank yourself using the number on your card.", "ru": "Положите трубку и сами позвоните в банк по номеру на карте.", "kk": "Тұтқаны қойып, банкке картадағы нөмір бойынша өзіңіз қоңырау шалыңыз."},
    "official_ok": {"en": "This is a known official domain, but always check the address bar carefully.", "ru": "Это известный официальный домен, но всегда внимательно проверяйте адресную строку.", "kk": "Бұл белгілі ресми домен, бірақ мекенжай жолағын әрқашан мұқият тексеріңіз."},
}

_TRIGGERS = [
    ({"otp_request", "vote_takeover"}, ["no_code", "2fa"]),
    ({"credential_request", "password_form", "card_form"}, ["no_creds"]),
    ({"bank_impersonation", "security_service", "account_threat"}, ["call_bank"]),
    ({"personal_transfer", "payment_request"}, ["no_transfer"]),
    ({"unrealistic_profit", "crypto_trading"}, ["invest_check"]),
    ({"pyramid_structure"}, ["pyramid"]),
    ({"delivery_fee", "delivery_scam", "delivery_fee_combo"}, ["delivery"]),
    ({"government_impersonation", "authority_pressure"}, ["egov"]),
    ({"emotional_manipulation"}, ["family"]),
    ({"remote_access"}, ["remote"]),
    ({"stay_on_line", "fake_loan"}, ["hang_up", "call_bank"]),
    ({"job_scam"}, ["job"]),
]
URL_IDS = {"brand_lookalike", "typosquat", "homograph", "punycode", "ip_host", "shortener", "suspicious_tld",
           "path_keywords", "young_domain", "phishing_url_combo", "reputation_hit", "redirect_offsite", "userinfo_trick", "dangerous_scheme"}


def build_summary(level: str, threat_type: str, lang: str) -> str:
    return _SUMMARY[level][lang].format(t=THREAT_LABELS.get(threat_type, THREAT_LABELS["suspicious"])[lang].lower())


def build_recommendations(indicators: list[Indicator], level: str, lang: str) -> list[str]:
    ids = {i.id for i in indicators if i.weight > 0}
    keys: list[str] = []
    if level == "low":
        keys = ["official_ok"] if any(i.id == "official_domain" for i in indicators) else ["safe"]
        return [_REC[k][lang] for k in keys]
    if ids & URL_IDS:
        keys.append("no_link")
    for trig, recs in _TRIGGERS:
        if ids & trig:
            keys += [r for r in recs if r not in keys]
    if level in ("high", "critical"):
        keys += ["if_shared", "report"]
    else:
        keys.append("verify")
    return [_REC[k][lang] for k in dict.fromkeys(keys)][:7]


# Protective action attached to each individual indicator.
_INDICATOR_REC = {
    "otp_request": "no_code", "vote_takeover": "no_code",
    "credential_request": "no_creds", "password_form": "no_creds", "card_form": "no_creds",
    "account_threat": "call_bank", "security_service": "call_bank", "bank_impersonation": "call_bank",
    "personal_transfer": "no_transfer", "payment_request": "no_transfer",
    "unrealistic_profit": "invest_check", "crypto_trading": "invest_check", "investment_scheme_combo": "invest_check",
    "pyramid_structure": "pyramid",
    "delivery_fee": "delivery", "delivery_scam": "delivery", "delivery_fee_combo": "delivery",
    "government_impersonation": "egov", "authority_pressure": "egov",
    "emotional_manipulation": "family", "secrecy": "family",
    "remote_access": "remote", "job_scam": "job", "stay_on_line": "hang_up", "fake_loan": "call_bank", "urgency": "verify", "prize_lure": "verify",
    "official_domain": "official_ok", "safety_warning": "safe",
}


def indicator_recommendation(indicator_id: str, lang: str) -> str:
    key = _INDICATOR_REC.get(indicator_id) or ("no_link" if indicator_id not in _INDICATOR_REC else "verify")
    return _REC[key][lang]
