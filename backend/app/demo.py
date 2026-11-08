"""Predefined, clearly-labelled TEST scenarios. They are fictional and run through the normal pipeline.

Demo domains use reserved/fictional names so that no real third party is accused.
"""

SCENARIOS = [
    {
        "id": "kaspi-suspension",
        "input_type": "message",
        "expected": "critical",
        "title": {"en": "Fake Kaspi account suspension", "ru": "Фейковая блокировка Kaspi", "kk": "Жалған Kaspi бұғаттауы"},
        "content": {
            "ru": "Kaspi Bank: Ваш счёт будет заблокирован в течение 24 часов из-за подозрительной операции. "
                  "Срочно подтвердите личность по ссылке kaspi-kz-verify.top/login и сообщите код из СМС сотруднику службы безопасности.",
            "en": "Kaspi Bank: Your account will be suspended within 24 hours due to a suspicious transaction. "
                  "Confirm your identity immediately at kaspi-kz-verify.top/login and tell the security officer the code from the SMS.",
            "kk": "Kaspi Bank: Күдікті операцияға байланысты шотыңыз 24 сағат ішінде бұғатталады. "
                  "Дереу kaspi-kz-verify.top/login сілтемесі арқылы жеке басыңызды растаңыз және қауіпсіздік қызметінің қызметкеріне SMS кодты айтыңыз.",
        },
    },
    {
        "id": "investment-pyramid",
        "input_type": "investment",
        "expected": "critical",
        "title": {"en": "Investment pyramid, 5% per day", "ru": "Инвестпирамида, 5% в день", "kk": "Инвестпирамида, күніне 5%"},
        "content": {
            "ru": "Инвестиционная платформа CryptoKZ Profit! Гарантированный доход 5% в день, без риска. Вступительный взнос всего 50 000 ₸. "
                  "Пригласи друзей и получай реферальный бонус 20% за каждого приглашённого. Переведи на карту 4400 4301 2345 6789 сегодня — места ограничены!",
            "en": "CryptoKZ Profit investment platform! Guaranteed profit 5% per day, risk-free. Entry fee only 50,000 KZT. "
                  "Invite your friends and get a 20% referral bonus for every friend you invite. Transfer to the card 4400 4301 2345 6789 today — last chance!",
            "kk": "CryptoKZ Profit инвестициялық платформасы! Кепілді табыс күніне 5%, тәуекелсіз. Кіру жарнасы небәрі 50 000 ₸. "
                  "Достарыңызды шақырыңыз және әр шақырылған үшін 20% реферал бонус алыңыз. Бүгін 4400 4301 2345 6789 картаға аударыңыз!",
        },
    },
    {
        "id": "phishing-bank-site",
        "input_type": "url",
        "expected": "critical",
        "title": {"en": "Phishing site imitating Halyk", "ru": "Фишинговый сайт под Halyk", "kk": "Halyk-ке еліктейтін фишинг сайт"},
        "content": {
            "en": "http://halyk-bank-secure.online/homebank/login/verify",
            "ru": "http://halyk-bank-secure.online/homebank/login/verify",
            "kk": "http://halyk-bank-secure.online/homebank/login/verify",
        },
    },
    {
        "id": "fake-delivery",
        "input_type": "message",
        "expected": "high",
        "title": {"en": "Fake delivery payment", "ru": "Фейковая оплата доставки", "kk": "Жалған жеткізу төлемі"},
        "content": {
            "ru": "KazPost: Ваша посылка задержана на таможне. Оплатите пошлину 490 ₸ в течение 12 часов, иначе посылка будет возвращена: kazpost-delivery.click/pay",
            "en": "KazPost: Your parcel is held at customs. Pay the 490 KZT fee within 12 hours or the package will be returned: kazpost-delivery.click/pay",
            "kk": "KazPost: Сәлемдемеңіз кеденде тұр. 12 сағат ішінде 490 ₸ баж төлеңіз, әйтпесе сәлемдеме қайтарылады: kazpost-delivery.click/pay",
        },
    },
    {
        "id": "legit-message",
        "input_type": "message",
        "expected": "low",
        "title": {"en": "Legitimate everyday message", "ru": "Обычное безопасное сообщение", "kk": "Қарапайым қауіпсіз хабарлама"},
        "content": {
            "ru": "Привет! Завтра встречаемся в 18:00 у входа в Mega Silk Way. Я уже оплатил билеты в кино через Kaspi, вернёшь потом при встрече :)",
            "en": "Hi! Let's meet tomorrow at 6 pm at the Mega Silk Way entrance. I already paid for the movie tickets through Kaspi, you can pay me back when we meet :)",
            "kk": "Сәлем! Ертең сағат 18:00-де Mega Silk Way кіреберісінде кездесейік. Кино билеттерін Kaspi арқылы төлеп қойдым, кездескенде қайтарарсың :)",
        },
    },
    {
        "id": "relative-emergency",
        "input_type": "message",
        "expected": "high",
        "title": {"en": "'Mom, it's me' emergency", "ru": "«Мама, это я» — срочная помощь", "kk": "«Апа, бұл мен» — шұғыл көмек"},
        "content": {
            "ru": "Мама, это я, пишу с чужого номера. Попал в аварию, срочно нужны деньги, переведи 150 000 ₸ на карту по номеру телефона +7 701 555 12 34. Никому не говори, папе тоже!",
            "en": "Mom, it's me, writing from a friend's phone. I had an accident and need money urgently, transfer 150,000 KZT to this card number by phone +7 701 555 12 34. Don't tell anyone, not even dad!",
            "kk": "Апа, бұл мен, басқа нөмірден жазып тұрмын. Жол апатына түстім, ақша керек, +7 701 555 12 34 нөміріне 150 000 ₸ аударыңыз. Ешкімге айтпа!",
        },
    },
    {
        "id": "egov-fine",
        "input_type": "message",
        "expected": "high",
        "title": {"en": "Fake eGov fine notice", "ru": "Фейковый штраф eGov", "kk": "Жалған eGov айыппұлы"},
        "content": {
            "ru": "eGov.kz: на вас оформлен штраф 25 000 ₸. Оплатите сегодня до 23:59, иначе будет возбуждено уголовное дело: egov-kz.site/oplata",
            "en": "eGov.kz: a fine of 25,000 KZT has been issued to you. Pay today before 23:59 or a criminal case will be opened: egov-kz.site/oplata",
            "kk": "eGov.kz: сізге 25 000 ₸ айыппұл салынды. Бүгін 23:59-ға дейін төлеңіз, әйтпесе қылмыстық іс қозғалады: egov-kz.site/oplata",
        },
    },
]


def list_scenarios(lang: str) -> list[dict]:
    return [
        {"id": s["id"], "input_type": s["input_type"], "expected_level": s["expected"], "title": s["title"][lang],
         "content": s["content"][lang], "is_test_example": True}
        for s in SCENARIOS
    ]


# Fictional "bank security service" call for Call Guard's simulation mode: (speaker, line).
CALL_SCRIPT = {
    "ru": [
        ("caller", "Здравствуйте, вас беспокоит служба безопасности Halyk Bank."),
        ("caller", "На ваше имя только что оформлен кредит на 2 миллиона тенге. Это были вы?"),
        ("you", "Нет, я ничего не оформлял."),
        ("caller", "Значит, это мошенники. Срочно нужно отменить заявку, пожалуйста, не кладите трубку."),
        ("caller", "Сейчас вам придёт СМС. Продиктуйте код из СМС, чтобы мы заблокировали операцию."),
        ("caller", "И для защиты средств переведите деньги на безопасный счёт. Никому не говорите об этом разговоре."),
    ],
    "en": [
        ("caller", "Hello, this is the Halyk Bank security service."),
        ("caller", "A loan of 2 million tenge has just been taken in your name. Was that you?"),
        ("you", "No, I didn't apply for anything."),
        ("caller", "Then it's fraud. We need to cancel it urgently, please don't hang up."),
        ("caller", "You will receive an SMS now. Read me the code from the SMS so we can block the operation."),
        ("caller", "To protect your money, transfer it to a safe account. Don't tell anyone about this call."),
    ],
    "kk": [
        ("caller", "Сәлеметсіз бе, Halyk Bank қауіпсіздік қызметінен хабарласып тұрмын."),
        ("caller", "Сіздің атыңызға жаңа ғана 2 миллион теңге несие рәсімделді. Бұл сіз бе?"),
        ("you", "Жоқ, мен ештеңе рәсімдеген жоқпын."),
        ("caller", "Онда бұл алаяқтар. Өтінімді тез арада тоқтату керек, тұтқаны қоймаңыз."),
        ("caller", "Қазір SMS келеді. Операцияны бұғаттау үшін SMS кодты айтыңыз."),
        ("caller", "Ақшаңызды қорғау үшін қауіпсіз шотқа аударыңыз. Бұл әңгіме туралы ешкімге айтпа."),
    ],
}


def call_script(lang: str) -> dict:
    return {"is_test_example": True, "lines": [{"speaker": sp, "text": tx} for sp, tx in CALL_SCRIPT[lang]]}
