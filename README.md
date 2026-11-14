# Market Council v0.6 — Data-Driven Visuals + Governed Investment Signals

A MongoDB Atlas-powered, **paper-only**, multi-agent investment research prototype. The new **Signals** page scans a user-selected watchlist of 2–10 US/Canadian stocks and ETFs, ranks them using a transparent **unvalidated research heuristic**, and shows **BUY / HOLD / SELL** signals with evidence and handoffs. Stock orders are **never** placed automatically. BUY/SELL can be turned into a separate paper order review only after policy and human authorization.

> This is not a trained prediction system or personalized investment advice. A score of 70/100 is a **screening score, not a 70% success probability**. Quotes can be delayed, inaccurate or unavailable depending on your Finnhub plan. In `sample` mode all prices are synthetic. No real brokerage integration exists.

## v0.6 visual upgrade

The new charts are built with **native React and SVG** — no charting library, extra API keys or new backend services. They read existing MongoDB Atlas API responses and refresh when the underlying data changes. All numerical charts are based on saved records; they do not simulate returns or investment performance.

- **Signals → Signal mix:** donut displays counts of BUY / HOLD / SELL / UNAVAILABLE records for the selected scan. Incomplete scans only show results already saved.
- **Signals → Research handoffs:** five connected agent stages show counts of actual `agent_messages` sent by each specialist. Empty counts do not imply an agent completed work.
- **Activity → Request outcomes:** segmented chart summarizing the **latest 30 loaded runs**, not every historical Atlas record.
- **Activity → Decision path:** each completed stage is backed by a corresponding stored `audit_events` event. Gray stages were not confirmed; denied/stopped runs are identified.
- **Governance → Exposure by security:** reads virtual paper-account positions and reserved BUY orders; shows the current Atlas maximum-position policy as a vertical limit. It does not treat accepted orders as fills or reduce holdings for unsettled SELL reservations.
- **Governance → Authority matrix:** live read-only map of each Atlas identity’s enabled status and proposal/execution permissions. Editable controls remain underneath.
- **Database fix:** adds the required `symbol` when saving a successful recommendation, fixing the prior MongoDB schema validation (`code 121`) error. Prior failed scans remain in history; start a new scan.

## v0.5 features retained

- **New first page, Signals:** choose 2–10 securities and click **Analyze watchlist**. Scan results arrive incrementally, saved in Atlas (`recommendation_scans` and `recommendations`). Partial provider failures are reported per symbol without artificial substitute prices.
- **BUY/HOLD/SELL suggestions:** fully explainable calculations using provider day-change and simple patterns in up to five genuine news headlines. SELL is suggested **only for paper account holdings**; HOLD is informational. Keyword signals are deliberately limited and non-predictive.
- **Agent-to-agent messages:** each scanned security produces market → news → quant → risk → portfolio handoffs, plus its own stored recommendation and audit trail. Unavailable or disabled agents produce explicit per-symbol failures.
- **Paper BUY and SELL requests:** use **Create review** from a recent BUY/SELL signal. The existing Atlas-backed proposer permissions, concentration rules (for BUY), available holding checks (for SELL), max-order rule, mandatory human approval, emergency stop and broker gateway apply.
- **Sell reservations:** accepted paper SELL orders reserve the sellable notional to prevent over-selling across simultaneous proposals. Accepted paper BUY orders reserve cash and concentration. Cancellation releases reservations. **Accepted ≠ filled, settled or reflected as an actual holding change.**
- **Freshness check:** recommendations older than 30 minutes cannot be used to create a paper review; scan again to get newer evidence.
- **Fail-closed scanning on restart:** interrupted scans are marked `INTERRUPTED`, rather than silently re-running or duplicating results.
- **Source-labels:** show provider and trade timestamp; Canadian symbol entitlement is uncertain on Finnhub free plans. CAD quotes are reference-only; this simplified paper risk model uses USD notional with **no FX conversion**.
- The existing **Research**, **Activity**, and **Governance** pages and broker simulator remain, as do editable Atlas identities and versioned policies.

## Technical architecture

```text
Browser / React app (http://localhost:3187)
    └── Node.js / Express API (private Docker network)
          ├── Market source: Finnhub REST (optional) / labelled synthetic sample
          ├── Watchlist scanner (2–10 symbols, sequential requests)
          │      ├── Market specialist → News specialist
          │      ├── Quant screen → Risk reviewer → Portfolio signal
          │      └── MongoDB Atlas recommendations, messages and audit events
          ├── MongoDB Atlas: agent_identities, policies, control,
          │      recommendation_scans, recommendations, runs,
          │      agent_messages, audit_events, paper_accounts, broker_receipts
          └── Policy-authorized paper-order workflow
                 └── separate private mock broker service
```

Research specialists are **coordinated backend functions**, not separate agent containers. LLM-generated commentary for the original user-driven research workflow can optionally be enabled; the new multi-stock screening is deliberately deterministic and auditable. The LLM never approves orders. This starter is more of a governed agent workflow than a production stock-picking product.

## Install on your hackathon Windows laptop (do NOT overwrite old folder)

1. Make sure **Docker Desktop is running** (`docker info` must have a `Server` section).
2. Download `market-council-audit-lab-v0.6.zip` to your existing project directory.
3. In PowerShell, extract it into a **new `market-council-audit-lab-v0.6` directory**, and copy your existing private `.env` into it:

```powershell
$root = "D:\Other files\projects\Udemy\Web Development Bootcamp"
$zip = Join-Path $root "market-council-audit-lab-v0.6.zip"
Expand-Archive -LiteralPath $zip -DestinationPath $root -Force
$new = Join-Path $root "market-council-audit-lab-v0.6"
$oldPaths = @(
  (Join-Path $root "market-council-audit-lab-v0.5\.env"),
  (Join-Path $root "market-council-audit-lab-v0.4\.env"),
  (Join-Path $root "market-council-v0.3\market-council-audit-lab\.env"),
  (Join-Path $root "market-council-audit-lab\.env")
)
$old = $oldPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($old) {
  Copy-Item -LiteralPath $old -Destination (Join-Path $new ".env")
} else {
  Copy-Item -LiteralPath (Join-Path $new ".env.example") -Destination (Join-Path $new ".env")
  Write-Host "No old .env found. Enter Atlas connection and new secrets in .env."
}
cd $new
notepad .env
```

**Always check `.env` before starting**. Its `MONGODB_URI`, `ADMIN_TOKEN`, and `BROKER_SHARED_SECRET` must be set. Generate different secrets with PowerShell or OpenSSL. The ZIP **does not contain a `.env` file**, only `.env.example`. Do not post it in chat or GitHub.

4. Set Finnhub data source if you have an eligible account:

```dotenv
DATA_MODE=finnhub
FINNHUB_API_KEY=YOUR_OWN_KEY
```

Alternatively choose `DATA_MODE=sample` to test the workflow **without real quotes or headlines**. No fake real-time data will be shown.

5. Start/rebuild:

```powershell
docker compose up -d --build
docker compose ps
```

The Compose project name is `market-council-audit-lab`, so running v0.6 replaces containers from previous versions using that same Compose project. It does **not** erase Atlas collections or the broker's persistent volume. If a custom project name was used before, stop it first to free port 3187. Open **http://localhost:3187** and enter your existing `ADMIN_TOKEN`.

## User guide — from signal to audit

1. Go to **Signals** (new default landing page). Select 2–10 stocks or ETFs from the curated 20-security universe. Defaults are AAPL, MSFT, NVDA, JPM, QQQ and SPY.
2. Click **Analyze watchlist**. Watch the progress bar. The backend requests a quote and any available news sequentially, then passes findings between agents and persists the result. A provider outage produces `UNAVAILABLE` on that security, not a fake price.
3. Click any result. Review BUY/HOLD/SELL, the **screen score (not a confidence probability)**, exact quote source/timestamp, score factors, publisher-attributed news, caveats and **Agent collaboration and evidence**.
4. **BUY / SELL:** Enter a USD paper amount and click **Create review**. **HOLD:** no order is suggested. If the signal is older than 30 minutes, rescan before review. A SELL is only possible for an account holding and within available, unreserved notional.
5. The app opens **Activity**. A completed research and preflight gate should result in `WAITING_APPROVAL` or a `DENIED` with reasons. Click **Approve paper order** if eligible. After the configured delay, Atlas policy is rechecked and a separate simulated broker receives the order. The API retrieves and verifies a receipt before `COMPLETE`.
6. In **Activity**, open Timeline, Agent messages and Policy decision. The new scan itself also has a stored timeline in Atlas. In **Governance**, disable the portfolio agent or tighten maximum order limits and repeat a review to demonstrate real pre-action policy enforcement. Reset the kill switch after testing.
7. In MongoDB Atlas Data Explorer, view `recommendation_scans`, `recommendations`, `agent_messages`, `audit_events`, `agent_identities`, `policies`, `runs`, `paper_accounts`, and `broker_receipts`.

### Simple demonstration with no market-data key

Use `DATA_MODE=sample`, scan the default six. Example synthetic data produces directional screens (e.g., NVDA may show BUY and an AAPL holding may show SELL); these are **not genuine stock forecasts**. Click the result → **Create review**, approve if policy permits, then show the broker receipt and audit history. Disable the portfolio agent to prove the next order is refused. For the strongest pitch, use real Finnhub quotes/news **only when permitted by your Finnhub plan and usage terms**.

## MongoDB policy & audit

- `agent_identities` — editable `enabled` / `allowedActions`; the separate gateway must hold `EXECUTE_AUTHORIZED_PAPER_ORDER`.
- `policies` — versioned single-security concentration (BUY), max order size, mandatory approval.
- `control` — emergency stop; a MongoDB Change Stream observes changes, with polling/final checks as fallback.
- `recommendation_scans` and `recommendations` — persisted stock-by-stock research results, source and method version. MongoDB `$jsonSchema` validators require core fields.
- `agent_messages` — message payloads between the specialist roles, including research evidence.
- `audit_events` — actor, event type, run/scan ID, details, timestamp, with Atlas schema validation. App-level append-only log (not tamper-proof).
- `paper_accounts` and `broker_receipts` — virtual cash/position reservations and independently fetched broker receipts. Broker orders have unique idempotency IDs.

**Known limitations:** No trained technical or earnings forecast, no performance backtest, no real-money orders, no completed fill/settlement model, no FX conversion, no per-user SSO, no cryptographic identity attestation, no immutable audit log. As in v0.4, a narrow revocation race remains between the final Atlas read and mock broker call; pending work can be stopped but submitted orders are not retroactively undone.

## API routes added

All require `Authorization: Bearer <ADMIN_TOKEN>`:

- `POST /api/recommendations/scans` — `{ "symbols": ["AAPL", "MSFT", "QQQ"] }`; returns scan ID.
- `GET /api/recommendations/scans` — recent scans.
- `GET /api/recommendations/scans/:id` — scan state, recommendations, agent handoffs, audit events.
- `POST /api/recommendations/:id/create-review` — `{ "notionalUsd": 200 }`; opens a BUY or SELL paper review from a fresh stored signal.

`/api/health` remains public and should return `ok: true`, `atlasConnected: true`, `liveTradingEnabled: false`. Other v0.4 API endpoints remain.

## Run tests / troubleshoot

```powershell
# From market-council-audit-lab-v0.6:
docker compose ps
docker compose logs --tail=100 api broker web
docker compose exec api npm test
Invoke-RestMethod http://localhost:3187/api/health
```

Source validation (in the generation environment): **33 Node policy/provider/signal tests passed**, Node syntax checks, TypeScript JSX transpilation checks and PostCSS parsing passed, and Compose YAML parsed. A complete frontend `npm install` timed out in the generation environment; Docker/Atlas integration was **not tested** here, so you must confirm `docker compose up -d --build` and an actual scan/review locally.

## Hackathon rules and provider licensing

The event requires qualifying submission work to be created during the hackathon. **Do not present earlier generated or existing source as newly authored during the event** without explicit organizer authorization; disclose reused portions and follow the public repository rules. `.env` must stay private. Finnhub may restrict public exhibition/redistribution of API data on personal/free terms — check those terms before showing third-party prices/headlines to judges. For a public demo without data-display permissions, choose `DATA_MODE=sample` and label it honestly.

### Frontend visual tests

The visual data-transformation functions have their own small, dependency-free tests:

```powershell
node --test web/test/visualMetrics.test.js
```

Run these from the extracted project folder. These verify signal counts, Atlas message counts, portfolio exposure and reservation math, and recent-run status totals. The browser UI still needs an end-to-end check on your laptop.

### Where to find the new diagrams

1. **Signals:** choose stocks and click **Analyze watchlist**. The signal donut and agent flow appear above the results list. Select a completed scan to compare results.
2. **Activity:** the result-status bar appears directly under the page heading. Select any run to see the evidence-backed six-stage decision path, followed by the existing timeline.
3. **Governance:** scroll past the policy and kill-switch controls for the portfolio exposure chart and permission matrix; edit rights below the matrix.

If you see an old scan marked `ERROR` with `Document failed validation`, do **not** reuse it as proof that v0.6 failed. Run a **new** scan after rebuilding the API (the validator-safe `symbol` field is included by v0.6).
