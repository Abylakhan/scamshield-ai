"""Deterministic social-engineering detection rules for Kazakh, Russian and English text.

Each rule decides only whether a pattern is present (and quotes the matching text as evidence), which scam
type it points to, and its localized explanation. Weight, severity and scoring category come from the
configurable ruleset (ruleset.json). Brand names alone never trigger
a rule — impersonation is only flagged in combination with a suspicious request (see
`contextual_indicators`).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..schemas import Indicator
from .ruleset import get_ruleset, make_indicator

F = re.IGNORECASE | re.UNICODE


@dataclass
class Rule:
    id: str
    category: str  # scam/threat type this rule points to
    patterns: list[str]
    name: dict[str, str]
    desc: dict[str, str]
    compiled: list[re.Pattern] = field(default_factory=list, repr=False)

    def __post_init__(self) -> None:
        self.compiled = [re.compile(p, F) for p in self.patterns]

    def match(self, text: str) -> str | None:
        for rx in self.compiled:
            m = rx.search(text)
            if m:
                return m.group(0)
        return None


RULES: list[Rule] = [
    Rule(
        "urgency", "social_engineering",
        [r"\bсрочно", r"немедленно", r"в течение \d+\s*(час|мин)", r"сегодня до \d", r"последний шанс",
         r"\burgent", r"\bimmediately", r"within \d+\s*(hours?|minutes?)", r"\bact now", r"last chance",
         r"right now", r"шұғыл", r"дереу", r"тез арада", r"\d+\s*сағат ішінде", r"только сегодня"],
        {"en": "Urgency pressure", "ru": "Давление срочностью", "kk": "Асықтыру қысымы"},
        {"en": "The message pressures you to act immediately so you don't stop to verify it.",
         "ru": "Сообщение вынуждает действовать немедленно, чтобы вы не успели проверить информацию.",
         "kk": "Хабарлама тексеруге уақыт қалдырмау үшін дереу әрекет етуге итермелейді."},
    ),
    Rule(
        "account_threat", "phishing",
        [r"(будет|был[аио]?|будут)\s+(за)?блокирован", r"заблокирован", r"блокировк", r"приостановлен",
         r"\b(account|card)\b.{0,40}\b(suspended|locked|blocked|deactivated|disabled)",
         r"\b(suspended|locked|blocked|deactivated)\b.{0,30}\b(account|card)",
         r"бұғатта", r"тоқтатыл"],
        {"en": "Account suspension threat", "ru": "Угроза блокировки счёта", "kk": "Шотты бұғаттау қаупі"},
        {"en": "Threatens to block your account or card — a classic phishing lever.",
         "ru": "Угрожает блокировкой счёта или карты — классический приём фишинга.",
         "kk": "Шотыңызды не картаңызды бұғаттаумен қорқытады — фишингтің классикалық тәсілі."},
    ),
    Rule(
        "credential_request", "phishing",
        [r"(введите|укажите|сообщите|отправьте|подтвердите|назовите|продиктуйте|скажите)[^.\n]{0,40}(парол|пин|pin|cvv|cvc|данные карты|номер карты|логин|срок действия)",
         r"(enter|provide|confirm|send|share|verify|update|read|tell)( me| us)?[^.\n]{0,40}(password|pin\b|cvv|cvc|card number|card details|login|expiry)",
         r"(құпиясөз|пин-?код|карта нөмір|карта деректер)[^.\n]{0,40}(енгізіңіз|жіберіңіз|айтыңыз|растаңыз)",
         r"(енгізіңіз|жіберіңіз|айтыңыз|растаңыз)[^.\n]{0,40}(құпиясөз|пин|карта нөмір|cvv)"],
        {"en": "Request for credentials", "ru": "Запрос учётных данных", "kk": "Құпия деректерді сұрау"},
        {"en": "Asks for a password, PIN, CVV or card details. Legitimate banks never request these by message.",
         "ru": "Запрашивает пароль, PIN, CVV или данные карты. Настоящие банки никогда не просят их в сообщениях.",
         "kk": "Құпиясөз, PIN, CVV немесе карта деректерін сұрайды. Нағыз банктер мұны хабарламамен ешқашан сұрамайды."},
    ),
    Rule(
        "otp_request", "phishing",
        [r"(назовите|сообщите|продиктуйте|отправьте|перешлите|скажите|введите)[^.\n]{0,40}(код|смс)",
         r"(код|смс)[^.\n]{0,25}(назовите|сообщите|продиктуйте|отправьте|перешлите)",
         r"(tell|send|share|forward|give|read)( me| us)?[^.\n]{0,30}(code|otp|sms)",
         r"(кодты|смс-?кодты|растау кодын)[^.\n]{0,30}(айтыңыз|жіберіңіз|беріңіз)",
         r"(айтыңыз|жіберіңіз)[^.\n]{0,30}(кодты|кодын)"],
        {"en": "Request for verification code", "ru": "Запрос SMS-кода", "kk": "SMS-кодты сұрау"},
        {"en": "Asks you to share a one-time SMS/verification code. That code lets attackers take over your account.",
         "ru": "Просит сообщить одноразовый SMS-код. Этот код позволяет злоумышленникам захватить ваш аккаунт.",
         "kk": "Бір реттік SMS-кодты айтуды сұрайды. Бұл код алаяқтарға аккаунтыңызды басып алуға мүмкіндік береді."},
    ),
    Rule(
        "security_service", "bank_impersonation",
        [r"служб[аыу] безопасности", r"\bsecurity (department|service|team)\b", r"қауіпсіздік қызмет",
         r"сотрудник банка", r"bank (employee|officer)", r"банк қызметкері", r"финансовый мониторинг",
         r"подозрительн\w+ операци", r"suspicious (transaction|activity|login)", r"күдікті операция"],
        {"en": "\"Bank security service\" script", "ru": "Сценарий «службы безопасности банка»", "kk": "«Банк қауіпсіздік қызметі» сценарийі"},
        {"en": "Claims to be a bank security officer or reports a 'suspicious transaction' — a common impersonation script.",
         "ru": "Представляется службой безопасности банка или сообщает о «подозрительной операции» — распространённый сценарий.",
         "kk": "Банктің қауіпсіздік қызметі атынан сөйлейді немесе «күдікті операция» туралы хабарлайды — кең таралған сценарий."},
    ),
    Rule(
        "fake_loan", "bank_impersonation",
        [r"(оформ\w+|взят\w*|одобрен\w*)[^.\n]{0,25}кредит", r"кредит[^.\n]{0,30}(на ваше имя|на вас|оформлен)",
         r"(loan|credit)[^.\n]{0,50}(in your name|(has|was)( just)? been (taken|issued|approved))", r"(someone|somebody) (took|applied for) a loan",
         r"несие[^.\n]{0,30}(рәсімделді|алынды)", r"атыңызға[^.\n]{0,20}несие"],
        {"en": "\"Loan in your name\" pretext", "ru": "Сценарий «на вас оформлен кредит»", "kk": "«Сіздің атыңызға несие рәсімделді» сценарийі"},
        {"en": "Claims someone took a loan in your name — the opening line of the most common phone scam in Kazakhstan.",
         "ru": "Утверждает, что на вас оформили кредит, — стартовая фраза самой распространённой телефонной схемы в Казахстане.",
         "kk": "Сіздің атыңызға несие рәсімделді дейді — Қазақстандағы ең кең таралған телефон алаяқтығының бастапқы сөзі."},
    ),
    Rule(
        "stay_on_line", "social_engineering",
        [r"не (кладите|бросайте|отключайте)[^.\n]{0,10}трубк", r"оставайтесь на линии", r"не прерывайте (звонок|разговор)",
         r"(don'?t|do not) (hang up|end the call|disconnect)", r"stay on the (line|call)",
         r"тұтқаны (қоймаңыз|тастамаңыз)", r"байланысты үзбеңіз"],
        {"en": "Pressure to stay on the line", "ru": "Требование не класть трубку", "kk": "Тұтқаны қоймау талабы"},
        {"en": "Insists you don't hang up — scammers keep you on the call so you can't verify with the real bank.",
         "ru": "Настаивает, чтобы вы не клали трубку, — так мошенники не дают перезвонить в настоящий банк.",
         "kk": "Тұтқаны қоймауды талап етеді — алаяқтар нағыз банкке қоңырау шалуға мүмкіндік бермейді."},
    ),
    Rule(
        "authority_pressure", "government_impersonation",
        [r"уголовн\w+ (дел|ответствен)", r"criminal (case|charges|liability)", r"\barrest", r"арест",
         r"повестк", r"прокуратур", r"\bкнб\b", r"қылмыстық", r"court order", r"судебн\w+ (решен|иск)"],
        {"en": "Authority intimidation", "ru": "Запугивание от имени органов", "kk": "Мемлекеттік органдар атынан қорқыту"},
        {"en": "Uses police, court or criminal-case threats to frighten you into compliance.",
         "ru": "Использует угрозы уголовным делом, судом или полицией, чтобы запугать вас.",
         "kk": "Сізді қорқыту үшін полиция, сот немесе қылмыстық іспен қорқытады."},
    ),
    Rule(
        "unrealistic_profit", "investment_fraud",
        [r"\d+\s*%\s*(в|за)\s*(день|сутки|недел|месяц)", r"\d+\s*%\s*(daily|a day|per day|weekly|per week|a week|monthly|per month)",
         r"гарантированн\w+ (доход|прибыл)", r"guaranteed (profit|returns?|income)", r"без риска", r"risk[- ]free",
         r"удво\w+ (деньги|вложени|капитал)", r"double your (money|investment)", r"кепілді (табыс|пайда)",
         r"(тәулігіне|күніне|айына)\s*\d+\s*%", r"пассивн\w+ доход от \d", r"x[2-9]\d* (за|in) \d+"],
        {"en": "Unrealistic profit promise", "ru": "Нереалистичное обещание прибыли", "kk": "Шындыққа жанаспайтын пайда уәдесі"},
        {"en": "Promises guaranteed or extremely high returns. Real investments never guarantee profit.",
         "ru": "Обещает гарантированную или чрезвычайно высокую доходность. Реальные инвестиции не гарантируют прибыль.",
         "kk": "Кепілді немесе өте жоғары табыс уәде етеді. Нағыз инвестициялар пайданы ешқашан кепілдендірмейді."},
    ),
    Rule(
        "pyramid_structure", "financial_pyramid",
        [r"пригла\w+ (друз|знаком|партн)", r"invite (your )?(friends|people|partners)", r"реферал", r"referral (bonus|reward|program)",
         r"вступительн\w+ взнос", r"entry fee", r"за каждого (приглаш|привед)", r"for every (person|friend) you (invite|bring)",
         r"досыңды шақыр", r"достарыңызды шақыр", r"уровн\w+ партн", r"матриц", r"\bmlm\b"],
        {"en": "Pyramid / referral structure", "ru": "Пирамидальная схема с рефералами", "kk": "Пирамида / реферал құрылымы"},
        {"en": "Income depends on recruiting new participants — the defining feature of a financial pyramid.",
         "ru": "Доход зависит от привлечения новых участников — главный признак финансовой пирамиды.",
         "kk": "Табыс жаңа қатысушыларды тартуға байланысты — қаржы пирамидасының басты белгісі."},
    ),
    Rule(
        "crypto_trading", "investment_fraud",
        [r"криптовалют", r"\bcrypto", r"биткоин", r"bitcoin", r"\busdt\b", r"трейдинг", r"trading (bot|signals?)",
         r"торгов\w+ (бот|сигнал)", r"форекс", r"forex", r"инвест\w* платформ"],
        {"en": "High-risk investment context", "ru": "Высокорисковая инвестиционная тема", "kk": "Жоғары тәуекелді инвестиция тақырыбы"},
        {"en": "Mentions crypto, forex or trading bots — frequently used as a cover in investment fraud.",
         "ru": "Упоминает криптовалюту, форекс или торговых ботов — частое прикрытие инвестиционного мошенничества.",
         "kk": "Криптовалюта, форекс немесе сауда боттарын атайды — инвестициялық алаяқтықтың жиі қолданылатын жамылғысы."},
    ),
    Rule(
        "payment_request", "social_engineering",
        [r"\b(пере|от)вед(и|ите)\b", r"\bоплат(и|ите)\b", r"\bпополн(и|ите)\b", r"внес(и|ите) (сумм|платёж|оплат|депозит)",
         r"\b(transfer|send|wire)\b[^.\n]{0,20}(money|funds|\d|kzt|тг|₸|\$)", r"\bpay\b[^.\n]{0,20}(fee|now|\d|kzt|₸)",
         r"аударыңыз", r"төлеңіз", r"толтырыңыз", r"оплатить (пошлин|комисс|доставк|штраф)"],
        {"en": "Payment request", "ru": "Требование оплаты", "kk": "Төлем талабы"},
        {"en": "Asks you to transfer or pay money.",
         "ru": "Просит перевести или оплатить деньги.",
         "kk": "Ақша аударуды немесе төлеуді сұрайды."},
    ),
    Rule(
        "personal_transfer", "social_engineering",
        [r"на (мою |эту |данную |следующую )?карт[уы]\b", r"по номеру телефона", r"на номер \+?\d", r"\bkaspi gold\b",
         r"(personal|my) (card|account)", r"to (this|the following) (card|number)",
         r"картаға", r"нөмір\w*[^.\n]{0,30}аудар", r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b", r"безопасн\w+ сч[её]т", r"safe account", r"қауіпсіз шот"],
        {"en": "Transfer to a personal card / \"safe account\"", "ru": "Перевод на личную карту / «безопасный счёт»", "kk": "Жеке картаға / «қауіпсіз шотқа» аудару"},
        {"en": "Directs money to a personal card, phone number or a so-called 'safe account'. Organizations don't collect payments this way.",
         "ru": "Направляет деньги на личную карту, номер телефона или «безопасный счёт». Организации так не принимают платежи.",
         "kk": "Ақшаны жеке картаға, телефон нөміріне немесе «қауіпсіз шотқа» бағыттайды. Ұйымдар төлемді бұлай қабылдамайды."},
    ),
    Rule(
        "delivery_fee", "delivery_scam",
        [r"посылк", r"доставк", r"\bparcel", r"\bpackage\b", r"\bdelivery\b", r"сәлемдеме", r"жеткізу", r"таможен", r"customs",
         r"пошлин", r"kazpost|казпочт|cdek|сдэк|dhl|fedex"],
        {"en": "Delivery / parcel pretext", "ru": "Предлог доставки посылки", "kk": "Сәлемдеме жеткізу сылтауы"},
        {"en": "Uses a parcel, customs or delivery story — a common pretext for small-fee phishing.",
         "ru": "Использует историю о посылке, таможне или доставке — частый предлог для фишинга с «небольшой оплатой».",
         "kk": "Сәлемдеме, кеден немесе жеткізу туралы оқиғаны пайдаланады — шағын төлемді фишингтің жиі сылтауы."},
    ),
    Rule(
        "prize_lure", "prize_scam",
        [r"вы (выиграли|стали победител)", r"you('ve| have)? (won|been selected)", r"\bwinner\b", r"розыгрыш", r"giveaway",
         r"\bприз\b", r"\bprize", r"ұтып алдыңыз", r"жеңімпаз", r"сыйлық", r"подар(ок|ки) от", r"лотере", r"lottery",
         r"компенсаци\w+ (от государства|выплат)", r"government (compensation|payout)", r"өтемақы"],
        {"en": "Prize or giveaway lure", "ru": "Приманка выигрышем или подарком", "kk": "Ұтыс немесе сыйлықпен азғыру"},
        {"en": "Claims you won a prize or are owed a payout — usually followed by a 'fee' or data request.",
         "ru": "Сообщает о выигрыше или положенной выплате — обычно затем требуют «комиссию» или данные.",
         "kk": "Ұтыс немесе төлем тиесілі деп хабарлайды — әдетте кейін «комиссия» немесе деректер сұралады."},
    ),
    Rule(
        "emotional_manipulation", "social_engineering",
        [r"мам[ау],? (это я|помоги)", r"(mom|dad|mum),? (it'?s me|help)", r"попал\w* в (беду|аварию|полицию)",
         r"(had|been in) an accident", r"авари", r"срочно нужн\w+ деньги", r"need money (urgently|now)",
         r"апа,? бұл мен", r"көмектес", r"жол апаты"],
        {"en": "Emotional manipulation", "ru": "Эмоциональная манипуляция", "kk": "Эмоциялық манипуляция"},
        {"en": "Plays on fear or family emotions ('Mom, it's me, I'm in trouble') to override caution.",
         "ru": "Играет на страхе или родственных чувствах («Мама, это я, я в беде»), чтобы отключить осторожность.",
         "kk": "Сақтықты әлсірету үшін қорқыныш немесе туыстық сезімдерді пайдаланады («Апа, бұл мен, қиындыққа тап болдым»)."},
    ),
    Rule(
        "secrecy", "social_engineering",
        [r"никому не (говори|рассказыва)", r"не сообщайте (родственник|близк|в банк)", r"don'?t tell (anyone|your family|the bank)",
         r"keep (this|it) (secret|confidential)", r"ешкімге айтпа", r"конфиденциальн\w+ (операц|информац)"],
        {"en": "Demand for secrecy", "ru": "Требование секретности", "kk": "Құпия ұстау талабы"},
        {"en": "Asks you to hide the conversation from family or the bank — isolation is a manipulation tactic.",
         "ru": "Просит скрыть разговор от близких или банка — изоляция жертвы является манипуляцией.",
         "kk": "Әңгімені туыстардан немесе банктен жасыруды сұрайды — оқшаулау манипуляция тәсілі."},
    ),
    Rule(
        "remote_access", "social_engineering",
        [r"anydesk", r"teamviewer", r"rustdesk", r"rudesktop", r"демонстраци\w+ экрана", r"screen ?shar", r"удал[её]нн\w+ доступ",
         r"remote access", r"установите (приложение|программу)", r"install (this|the) app", r"қосымшаны орнатыңыз"],
        {"en": "Remote-access / app install request", "ru": "Просьба установить приложение / удалённый доступ", "kk": "Қосымша орнату / қашықтан қол жеткізу сұрауы"},
        {"en": "Asks you to install an app or share your screen, giving attackers control of your device.",
         "ru": "Просит установить приложение или включить демонстрацию экрана — это даёт злоумышленникам контроль над устройством.",
         "kk": "Қосымша орнатуды немесе экранды көрсетуді сұрайды — бұл алаяқтарға құрылғыңызды басқаруға мүмкіндік береді."},
    ),
    Rule(
        "job_scam", "job_scam",
        [r"работ\w* на дому", r"заработ\w+ от \d+", r"(work|job) from home", r"easy money", r"л[её]гки\w? деньг",
         r"оплачиваем\w+ (лайк|задани|отзыв)", r"(paid|pay) (per|for) (like|review|task)", r"без опыта[^.\n]{0,30}\d+",
         r"үйден жұмыс", r"оңай табыс"],
        {"en": "Too-good-to-be-true job offer", "ru": "Подозрительное предложение работы", "kk": "Күмәнді жұмыс ұсынысы"},
        {"en": "Offers easy, high-paying remote work for simple tasks — a common entry point to task-fraud schemes.",
         "ru": "Предлагает лёгкий высокий заработок за простые задания — частая точка входа в схемы мошенничества.",
         "kk": "Қарапайым тапсырмалар үшін оңай әрі жоғары табыс ұсынады — алаяқтық схемаларының жиі кіру нүктесі."},
    ),
    Rule(
        "vote_takeover", "social_engineering",
        [r"проголосу(й|йте)", r"vote for (me|my|our)", r"дауыс беріңіз", r"код из whatsapp", r"whatsapp code",
         r"\d-?значн\w+ код"],
        {"en": "Messenger takeover pattern", "ru": "Схема угона мессенджера", "kk": "Мессенджерді ұрлау схемасы"},
        {"en": "'Vote for me' or 'send the WhatsApp code' requests are used to hijack messenger accounts.",
         "ru": "Просьбы «проголосуй» или «пришли код из WhatsApp» используются для угона аккаунтов.",
         "kk": "«Дауыс бер» немесе «WhatsApp кодын жібер» сұраулары аккаунттарды ұрлау үшін қолданылады."},
    ),
]

# Mitigating patterns: legitimate service messages often contain explicit safety warnings.
SAFETY_WARNING = re.compile(
    r"никому не (сообщайте|говорите|передавайте)|не сообщайте (код|его)|never share|do not share (this|the) code|"
    r"ешкімге (айтпаңыз|бермеңіз|хабарламаңыз)|банк никогда не",
    F,
)

BRANDS: dict[str, list[str]] = {
    "Kaspi": [r"kaspi", r"каспи"],
    "Halyk": [r"halyk", r"халык", r"халық банк", r"homebank"],
    "eGov": [r"\begov\b", r"егов", r"электронн\w+ правительств", r"electronic government"],
    "Government": [r"налогов", r"\btax\b", r"салық", r"полици", r"police", r"акимат", r"министерств", r"ministry", r"цон", r"халыққа қызмет"],
    "Bank": [r"freedom bank|фридом", r"jusan|жусан", r"forte|форте", r"\bbcc\b|центркредит", r"нацбанк|national bank|ұлттық банк", r"\bбанк", r"\bbank\b"],
    "Delivery": [r"kazpost|казпочт|қазпошта", r"cdek|сдэк", r"\bdhl\b", r"glovo", r"wolt", r"яндекс доставк"],
    "Marketplace": [r"wildberries|вайлдберриз", r"\bozon\b|озон", r"\bolx\b", r"kolesa|колёса", r"krisha"],
}
_BRAND_RX = {b: [re.compile(p, F) for p in ps] for b, ps in BRANDS.items()}

_DANGEROUS_IDS = {"credential_request", "otp_request", "account_threat", "personal_transfer", "payment_request", "remote_access", "fake_loan"}

_IMPERSONATION_TEXT = {
    "bank_impersonation": (
        {"en": "Possible bank impersonation", "ru": "Возможное выдавание себя за банк", "kk": "Банк атын жамылу ықтималдығы"},
        {"en": "Mentions {brand} together with a sensitive request. A real bank would never ask for this by message.",
         "ru": "Упоминает {brand} вместе с запросом конфиденциальных данных или денег. Настоящий банк так не делает.",
         "kk": "{brand} атауы құпия деректер немесе ақша сұраумен бірге айтылады. Нағыз банк бұлай істемейді."},
    ),
    "government_impersonation": (
        {"en": "Possible government impersonation", "ru": "Возможное выдавание себя за госорган", "kk": "Мемлекеттік орган атын жамылу ықтималдығы"},
        {"en": "References {brand} while demanding payment or data. Government services don't collect money via messenger links.",
         "ru": "Ссылается на {brand}, требуя оплату или данные. Госорганы не собирают деньги через ссылки в мессенджерах.",
         "kk": "{brand} атынан төлем немесе деректер талап етеді. Мемлекеттік органдар мессенджер сілтемелері арқылы ақша жинамайды."},
    ),
    "delivery_scam": (
        {"en": "Possible delivery-service impersonation", "ru": "Возможная подделка службы доставки", "kk": "Жеткізу қызметін жалған пайдалану ықтималдығы"},
        {"en": "Uses the {brand} name with a payment request. Check the parcel status only in the official app or website.",
         "ru": "Использует название {brand} с требованием оплаты. Проверяйте статус посылки только в официальном приложении.",
         "kk": "{brand} атауын төлем талабымен пайдаланады. Сәлемдеме мәртебесін тек ресми қосымшадан тексеріңіз."},
    ),
}


def detect_brands(text: str) -> list[tuple[str, str]]:
    """(brand family, exact matched text) for every brand family mentioned."""
    out = []
    for b, rxs in _BRAND_RX.items():
        for rx in rxs:
            m = rx.search(text)
            if m:
                out.append((b, m.group(0)))
                break
    return out


def detect_language(text: str) -> str:
    if re.search(r"[әғқңөұүһі]", text, F):
        return "kk"
    if re.search(r"[а-яё]", text, F):
        return "ru"
    return "en"


def analyze_text(text: str, lang: str) -> tuple[list[Indicator], list[tuple[str, str]]]:
    """Run all rules. Returns (indicators, brands_mentioned)."""
    indicators: list[Indicator] = []
    for rule in RULES:
        ev = rule.match(text)
        if ev:
            indicators.append(make_indicator(rule.id, rule.name[lang], rule.desc[lang], evidence=ev[:80], source="heuristic"))
    brands = detect_brands(text)
    indicators += contextual_indicators(indicators, brands, lang)

    if SAFETY_WARNING.search(text) and not {"otp_request", "credential_request", "personal_transfer"} & {i.id for i in indicators}:
        indicators.append(make_indicator(
            "safety_warning", source="heuristic",
            name={"en": "Contains a safety warning", "ru": "Содержит предупреждение о безопасности", "kk": "Қауіпсіздік ескертуі бар"}[lang],
            description={"en": "Includes a 'never share this code' warning typical of legitimate service notifications.",
                         "ru": "Содержит предупреждение «никому не сообщайте код», характерное для настоящих уведомлений.",
                         "kk": "Нағыз хабарламаларға тән «кодты ешкімге айтпаңыз» ескертуі бар."}[lang],
            evidence=SAFETY_WARNING.search(text).group(0),
        ))
    return indicators, brands


def _derived(found: list[Indicator], *ids: str) -> str:
    """Evidence for a combination indicator: the literal excerpts of the indicators it is built from."""
    by_id = {i.id: i for i in found}
    return " + ".join(by_id[i].evidence or "" for i in ids if i in by_id)


def contextual_indicators(found: list[Indicator], brands: list[tuple[str, str]], lang: str) -> list[Indicator]:
    ids = {i.id for i in found}
    out: list[Indicator] = []
    if "unrealistic_profit" in ids and ids & {"pyramid_structure", "personal_transfer", "payment_request"}:
        partner = next(i for i in ("pyramid_structure", "personal_transfer", "payment_request") if i in ids)
        out.append(make_indicator(
            "investment_scheme_combo", source="heuristic", evidence_type="derived",
            evidence=_derived(found, "unrealistic_profit", partner),
            name={"en": "Guaranteed returns + money collection", "ru": "Гарантированный доход + сбор денег", "kk": "Кепілді табыс + ақша жинау"}[lang],
            description={"en": "Promises guaranteed returns while collecting money or recruiting others — a hallmark of investment fraud and pyramids.",
                         "ru": "Обещает гарантированный доход, одновременно собирая деньги или привлекая людей — признак мошенничества и пирамиды.",
                         "kk": "Кепілді табыс уәде етіп, бір мезгілде ақша жинайды немесе адам тартады — алаяқтық пен пирамиданың белгісі."}[lang],
        ))
    if not (ids & _DANGEROUS_IDS):
        return out  # a brand mention on its own is not suspicious
    for brand, matched in brands:
        if brand in ("Kaspi", "Halyk", "Bank"):
            kind = "bank_impersonation"
        elif brand in ("eGov", "Government"):
            kind = "government_impersonation"
        elif brand == "Delivery" or (brand == "Marketplace" and "delivery_fee" in ids):
            kind = "delivery_scam"
        else:
            continue
        if any(i.id == kind for i in out):
            continue
        name, desc = _IMPERSONATION_TEXT[kind]
        out.append(make_indicator(kind, name[lang], desc[lang].format(brand=matched), evidence=matched, source="heuristic"))
    if "delivery_fee" in ids and ("payment_request" in ids or "personal_transfer" in ids):
        out.append(make_indicator(
            "delivery_fee_combo", source="heuristic", evidence_type="derived",
            evidence=_derived(found, "delivery_fee", "payment_request" if "payment_request" in ids else "personal_transfer"),
            name={"en": "Parcel fee request", "ru": "Требование оплаты за посылку", "kk": "Сәлемдеме үшін төлем талабы"}[lang],
            description={"en": "Combines a delivery story with a payment demand — the core pattern of fake delivery notifications.",
                         "ru": "Сочетает историю о доставке с требованием оплаты — основа фейковых уведомлений о доставке.",
                         "kk": "Жеткізу оқиғасын төлем талабымен біріктіреді — жалған жеткізу хабарламаларының негізі."}[lang],
        ))
    return out


CATEGORY_OF = {r.id: r.category for r in RULES} | {
    "bank_impersonation": "bank_impersonation",
    "government_impersonation": "government_impersonation",
    "delivery_scam": "delivery_scam",
    "delivery_fee_combo": "delivery_scam",
    "investment_scheme_combo": "investment_fraud",
}


def rule_catalog(lang: str) -> list[dict]:
    """Public, read-only description of the detection rules (used by the Threat Intelligence page)."""
    rs = get_ruleset()
    return [
        {"id": r.id, "category": r.category, "score_category": rs.spec(r.id).category, "severity": rs.spec(r.id).severity,
         "weight": rs.spec(r.id).weight, "name": r.name[lang], "description": r.desc[lang]}
        for r in RULES
    ]
