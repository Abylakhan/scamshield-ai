# ScamShield AI

AI-assisted protection against online scams, phishing and digital fraud for people in Kazakhstan.
Works in **Kazakh, Russian and English**.

Paste a WhatsApp/Telegram/SMS message, a URL, an investment offer or an ad. You get back an
explainable security report: a 0–100 risk score, the threat type, weighted indicators with evidence,
the checks that ran (and the ones that couldn't run), and concrete protective steps.

## Live demo / deploy

**Open in the browser: https://abylakhan.github.io/scamshield-ai/**

This is the GitHub Pages build. The same Python engine runs inside the browser (Pyodide), and history is stored in your browser.
Live link checks (page inspection, domain age, reputation) and AI need the server version below.
The first visit downloads the engine in about 10 seconds. To update the site, run `npm run build:pages` in `frontend/` and push `dist/` to the `gh-pages` branch.

**Gemini AI on the website:** open *Gemini AI* in the sidebar (or `Ctrl/⌘ + K` → AI settings), paste your own key
from [Google AI Studio](https://aistudio.google.com/apikey) and press *Save*. The key stays in your browser and is sent only
to Google. It is never stored in this repository. Gemini adds explanations and its own opinion to each report; the risk
score is still calculated by the deterministic engine.

Full server version:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Abylakhan/scamshield-ai)

One click deploys the whole app (backend and frontend in one Docker container, defined in `render.yaml` and
`Dockerfile`) to a free HTTPS URL such as `https://scamshield-ai.onrender.com`. HTTPS is required for the microphone in Call Guard.

Notes on the free plan:
- The service sleeps after about 15 minutes without visitors; the first visit after that takes 30–60 s to wake.
- The SQLite history resets when the service restarts.
- Optional API keys can be added later under *Environment* on Render.

Run the same container locally:

```bash
docker build -t scamshield-ai . && docker run -p 8000:8000 scamshield-ai
```

## Call Guard: live phone-scam detection

The most common fraud in Kazakhstan starts with a phone call from the "bank security service": a loan was
supposedly taken in your name, don't hang up, read me the SMS code, move your money to a "safe account".

**Call Guard** (`/call-guard`) listens to a call on speaker and reacts while the call is still going on:

- the browser transcribes the call live (Web Speech API in Chrome/Edge, `kk-KZ`/`ru-RU`/`en-US`), or you can type phrases;
- **two speakers are told apart.** One microphone hears both people, so every line is attributed to *Caller* or *Me*
  from what is said (who introduces themselves as the bank/police and asks for codes vs. who answers, refuses or says
  "I didn't take a loan"; Kazakh, Russian and English), the pause before the line and, on desktop, the voice pitch
  (`backend/app/engine/speakers.py`). With AI configured (server provider, or a Gemini key in the browser build)
  `POST /api/analyze/call/speakers` re-reads the whole conversation and relabels it. Tap a speaker name to correct
  it; your own labels always win;
- only the **caller's** lines are scored — your answers never raise the risk. Scoring goes through the same
  deterministic engine (`POST /api/analyze/call` with `lines`), with no network lookups, so it is fast; frames are not stored;
- a tracker shows how far the caller has progressed through the fraud script:
  fake identity → scary pretext → pressure → theft attempt;
- the moment the caller asks for an SMS code, card details, a remote-access app or a transfer, a **full-screen "HANG UP"
  alert** fires, with sound and vibration on phones, quoting the exact phrase;
- *Save call report* stores the final transcript and analysis in history like any other scan.

**Microphone checklist**

- Use Chrome, Edge or Safari. Firefox has no speech recognition, but typing phrases and the simulation still work there.
- Open the app at `http://localhost:8000` (or 5173 in development). Browsers allow the microphone only on HTTPS or localhost.
- Allow the microphone when the browser asks. If you blocked it earlier, click the lock icon in the address bar.
- Recognition uses the browser's speech service, so it needs an internet connection.
- Pick the call language next to the mic button. If Kazakh recognition isn't available on the device, Call Guard
  switches to Russian automatically and says so.
- Every failure (blocked, no microphone, microphone busy, offline) shows a specific message on the page.
- On phones the microphone is handed to the speech recogniser alone (a second audio stream makes Android/iOS
  recognition go silent), and duplicated results from Android are merged automatically.

*Simulate a scam call* plays a fictional, clearly labelled script line by line through the real endpoint, so the
feature can be demonstrated without a phone.

Speech recognition in Chrome/Edge is performed by the browser vendor's service; the transcript text is then analysed
by your local ScamShield backend only.

## Also new

- **Scam memory**: every report shows whether near-identical wording (same campaign with different amounts or links)
  was already checked, with a link to the closest match. It uses word-bigram Jaccard similarity on redacted text.
- **Share with family**: one click copies a plain-language warning ready for WhatsApp or Telegram. Reports can also
  be printed or saved as PDF.
- **URL auto-detect**: pasting a lone link into the message box switches to URL analysis automatically.
- **Quick actions** (`Ctrl/⌘ + K`, or the button in the sidebar/header): jump to any page, check a link, start the
  scam-call simulation, run the Kaspi example or switch language from the keyboard.
- **Feedback**: animated toasts for copy, save and delete actions, and an in-app confirmation dialog (Esc or Cancel
  never deletes).
- **Live dashboard**: refreshes silently every 20 s while visible; numbers animate to their new values.
- New detection rules for phone scripts: "loan in your name" and "don't hang up" (kk / ru / en).

## Architecture

```
frontend/  React 18 + TypeScript + Vite + Tailwind + Framer Motion + Recharts + Lucide
backend/   Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2 + SQLite
  app/engine/text_rules.py   trilingual social-engineering rules (weights, severity, explanations)
  app/engine/url_analyzer.py static URL checks: punycode/homographs, typosquats, brand look-alikes, shorteners, IPs…
  app/engine/net_checks.py   SSRF-safe fetch, redirect validation, RDAP domain age, Safe Browsing, VirusTotal
  app/engine/ai.py           optional Claude analysis with schema-validated structured output
  app/engine/scoring.py      transparent risk score + classification + evidence-based confidence
  app/engine/pipeline.py     rules → URL checks → AI (bounded) → report
  app/engine/redact.py       masks card numbers, IINs, codes, passwords before storage
```

### Risk scoring engine

The deterministic engine in `app/engine/scoring.py` is the **only** place a risk score is calculated. Every
weight, severity, category and group lives in a configurable ruleset — [`app/engine/ruleset.json`](backend/app/engine/ruleset.json)
(override with `SCORING_RULESET_PATH`). Detectors only decide whether an indicator is present and quote its evidence.

Five scoring categories: **phishing**, **social engineering**, **financial fraud**, **technical**, **contextual**
(impersonation, fake delivery, giveaways, payment instructions), plus **mitigation** (verified legitimacy signals).

1. **Deduplicate**: each indicator counts once, however many times it matched.
2. **Group** related indicators (e.g. brand look-alike + typosquat). The strongest counts fully, others at `group_decay` (0.35).
3. **Category score**: `cat = min(cap, 100·(1 − Π(1 − gᵢ/100)))`. Independent signals compound; each category is capped.
4. **Raw score**: categories compound the same way: `raw = 100·(1 − Π(1 − cat/100))`.
5. **Mitigation**: an official domain or a "never share this code" notice subtracts its points.
6. **Breakdown**: the final score is split across categories in proportion to `−ln(1 − cat/100)` with
   largest-remainder rounding, so `score_breakdown` always sums exactly to `risk_score`.

Levels (used identically in backend, API, DB and UI): 0–24 low · 25–49 moderate · 50–74 high · 75–100 critical.

A check that could not run (RDAP, Safe Browsing, VirusTotal, page fetch) produces **no** indicator. It only lowers
**confidence**. Confidence measures evidence coverage (independent categories, completed checks), not the
probability of fraud. A brand mention alone never scores: impersonation is flagged only together with a sensitive request.

Every indicator returns `name`, `category`, `severity`, `weight`, `contribution` (after grouping), `evidence`,
`evidence_type` (`content` = literal excerpt, `derived` = excerpts of the indicators it combines, `external` = verified
check result, `ai` = unverified), `explanation` and `recommendation`.

### Guardrails on the AI

- The AI explains and adds context, but **never changes the score or level**. Its own opinion is returned
  separately as `ai_assessment`.
- Content is passed as untrusted data, together with the real check results. The model is told never to claim reputation hits.
- Output is validated against a Pydantic schema. AI observations are kept only if their quoted evidence appears in the
  content, and they are marked `verified: false` with zero contribution.
- If the provider is missing, rate-limited or down, the heuristic engine runs alone and the report says so.

### Security

- **SSRF protection**: http/https only; ports 80/443/8080/8443; every hostname resolved and *all*
  addresses must be public (loopback, RFC1918, link-local/cloud metadata, CGNAT, multicast, reserved
  are blocked); redirects followed manually (max 5) with each hop re-validated; 5 s timeout, 256 KB
  response cap; page content is only pattern-matched, never rendered or executed.
- Submitted URLs are never opened in the user's browser; domains are displayed defanged (`evil[.]top`).
- Strict input validation (length limits, control-character stripping), per-IP rate limiting on
  analysis endpoints, generic error messages, security headers, CORS allow-list.
- Sensitive data (card numbers, IINs, SMS codes, passwords, phone numbers, e-mail local parts) is
  masked before it is written to the database. All user content is rendered as text, never as HTML.
- Secrets only come from environment variables; nothing secret is shipped to the frontend.
- Obfuscated IPv4 forms (`2130706433`, `0x7f000001`, `0177.0.0.1`, `127.1`) and IPv6 literals are
  normalised and flagged as internal targets before any request is made.
- Malformed addresses are rejected with HTTP 422. `javascript:`/`data:`/`file:` links are analysed (flagged as
  dangerous) but never fetched.
- Content-Security-Policy (`script-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer` and `Permissions-Policy` are set on every app response.
- Database failures return a generic 503 without internal details. SQLite runs in WAL mode with a busy timeout
  for concurrent requests.
- Text sent to the AI (content, evidence, fetched page titles) has angle brackets neutralised, so it cannot
  break out of its data block. The AI's output never changes the score.
- Residual risk: DNS rebinding between validation and connection is mitigated by validating every hop
  and short timeouts, but not fully eliminated. Disable fetching with `ENABLE_URL_FETCH=false` for
  high-assurance deployments.

### Known limitations

- No authentication: this is a single-user local MVP, so anyone who can reach the server can read and delete history.
  Put it behind authentication before exposing it on a network.
- The rate limiter is in-memory and per process. Use a shared store if you run several workers.
- react-router 6.x still has moderate advisories that are fixed only in v7 (open redirects with untrusted paths, SSR
  hydration). The app navigates only to fixed internal paths and doesn't use SSR, but upgrade when convenient.
- A successful AI response has not been verified without a real `ANTHROPIC_API_KEY`. All failure paths are tested.

## Run locally

Requirements: Python 3.12+, Node 18+.

### One command

```bash
./start.sh
```

Open http://localhost:8000 (UI) — API docs at http://localhost:8000/docs.

### Development (hot reload)

Backend:

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cp .env.example backend/.env
```

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

Frontend (in a second terminal; proxies `/api` to port 8000):

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173.

### Tests and checks

Backend (offline: network checks and AI are disabled in tests):

```bash
cd backend && .venv/bin/python -m pytest -q
```

Frontend:

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

- `tests/test_engine.py` covers every demo scenario in three languages, false positives, URL indicators and redaction.
- `tests/test_scoring.py` covers the required scoring scenarios and invariants: 0–100 bounds, level thresholds,
  breakdown sums to the score, no inflation from duplicates, grouping, missing intelligence, traceable evidence,
  reproducibility, AI independence, and ruleset configuration.
- `tests/test_audit.py` covers malformed, empty, oversized and invalid requests; Unicode and Kazakh; malicious HTML; SQL
  payloads; security headers; CORS; SSRF (private, loopback, metadata, obfuscated IPv4, IPv6-mapped, redirect to
  private, scheme-switch redirects, redirect loops, response cap); database unavailable (503); 24 concurrent analyses;
  dashboard vs. database consistency; prompt injection; and malformed or failed AI responses.
- `frontend/src/__tests__` covers evidence highlighting, error mapping, and that all three translations are complete.

## Optional API keys

| Variable | What it adds | Without it |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini contextual analysis (`GEMINI_MODEL`, default `gemini-3.8-flash`) | Heuristic engine only (fully functional) |
| `ANTHROPIC_API_KEY` | Claude contextual analysis (used when no Gemini key, or `AI_PROVIDER=anthropic`) | Heuristic engine only |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Google Safe Browsing reputation | Check shown as “skipped” |
| `VIRUSTOTAL_API_KEY` | VirusTotal URL verdicts | Check shown as “skipped” |

Domain age uses public RDAP (rdap.org) and needs no key; some registries (including `.kz`) may not
publish RDAP data, in which case the check is shown as “unavailable”.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/analyze/text` | Message or advertisement (`input_type`: `message` / `advertisement`) |
| POST | `/api/analyze/url` | URL analysis |
| POST | `/api/analyze/investment` | Investment offer |
| POST | `/api/analyze/call` | Call Guard: live call as `lines` (speakers separated, only the caller scored) or legacy `transcript`; `save: true` stores the report; separate 5× rate budget |
| POST | `/api/analyze/call/speakers` | Call Guard: AI speaker separation (falls back to the engine without AI) |
| GET | `/api/demo/call-script` | Fictional scam call for the Call Guard simulation |
| GET | `/api/history` | Paginated history (`risk_level`, `input_type`, `limit`, `offset`) |
| GET | `/api/history/{id}` | Full report |
| DELETE | `/api/history/{id}` | Delete one scan |
| DELETE | `/api/history` | Clear history |
| GET | `/api/dashboard/stats` | Aggregated statistics from the database |
| GET | `/api/threats` | Threat intelligence: categories, rule catalog, observed domains/indicators |
| GET | `/api/demo/scenarios` | Predefined test scenarios |
| GET | `/api/health` | Health and enabled integrations |

All analysis endpoints accept `lang` = `kk` | `ru` | `en` and return `risk_score`, `risk_level`, `confidence`,
`threat_type`, `score_breakdown`, `score_details`, `indicators`, `summary`, `recommendations`, `checks`,
`ai_assessment`. The full schema is in Swagger at `/docs`.

## Five-minute hackathon demo

Before you start: History → *Clear history*, so the dashboard starts at zero.

1. **Problem (30 s)**: open the landing page. "Fraud in Kazakhstan arrives through messengers and phone calls."
2. **Message analysis (60 s)**: Analyzer → test example *Fake Kaspi account suspension* → Analyze. Show the score,
   the highlighted evidence in the text, and the category breakdown that sums to the score.
3. **No false alarms (20 s)**: run *Legitimate everyday message*. It scores Low even though it mentions Kaspi.
4. **Call Guard (90 s)**: open *Защита звонков / Call Guard* → *Simulate a scam call*. Narrate as the
   risk climbs and the scam-script tracker lights up. When the caller asks for the SMS code, the full-screen
   **HANG UP** alert fires. Click *Save call report*.
5. **Scam memory (30 s)**: in the Analyzer, run *Fake eGov fine* twice. The second report says "Seen before".
6. **Dashboard (30 s)**: totals, risk distribution and risk points by category, straight from the database.
7. **Share and finish (20 s)**: *Copy warning for family*, then switch to Қазақша to show the trilingual UI.

Demo Mode (`/demo`) offers the same flow as a guided stepper and links directly to the Call Guard simulation.

## Test scenarios

Fictional and clearly labelled; demo domains are invented: fake Kaspi suspension (critical),
5%-per-day investment pyramid (critical), Halyk look-alike phishing URL (critical), fake KazPost customs
fee (high+), legitimate everyday message (low), “Mom, it’s me” emergency (high), fake eGov fine (high+).

## Disclaimer

ScamShield AI gives a second opinion; it does not replace your bank or the police. Dashboard and
landing-page “demonstration data” are labelled as such. Reference patterns on the Threat Intelligence
page are detection rules, not confirmed real-world incidents.
