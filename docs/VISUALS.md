# Visual evidence guide (v0.6)

Market Council's diagrams are *read-only visualizations* sourced from the existing API and MongoDB Atlas records. They do not affect policy authorization, alter the agent decisions, or connect to a brokerage.

| Page | Diagram | Data origin | Important interpretation |
| --- | --- | --- | --- |
| Signals | Signal mix donut | `GET /api/recommendations/scans/:id` → `recommendations` | Count of saved BUY/HOLD/SELL/UNAVAILABLE result documents. No investment accuracy implied. |
| Signals | Research handoffs | Same scan → `messages` | Count of actual stored messages sent by the named agent functions. Not separate agent process health. |
| Activity | Request outcomes | `GET /api/runs` → 30 most recent records | Current statuses in those 30 records, not all-time conversion rates. |
| Activity | Decision path | `GET /api/runs/:id` → `auditEvents` | A stage is highlighted only if its matching event has been saved. It does not imply transactional atomicity. |
| Governance | Portfolio exposure | `GET /api/state` → `portfolio` and `policy` | Existing fictional positions + accepted paper BUY reservations; accepted is not filled. Policy limit read from Atlas. |
| Governance | Authority matrix | `GET /api/governance` → `identities` | Read-only summary of editable agent permissions saved in Atlas. |

## Verify visually

1. Run a fresh multi-stock scan on **Signals**, change the scan selector, and confirm donut and handoff counts correspond to the selected Atlas scan. Previously failed scans will still show unavailable results.
2. Open **Activity**, select a waiting approval, then approve it. The decision path should gain stages only as events are recorded. An interrupted or rejected order must not display a successful broker receipt stage.
3. In **Governance**, modify the exposure policy and save it. The policy limit marker should move after the data refresh.
4. Edit any agent's permissions, save, and confirm the authority matrix reflects the change after refresh; verify `AGENT_PERMISSIONS_CHANGED` in Governance audit.

## Known limits

- Portfolio positions are fictional USD-denominated notional balances seeded for paper-trading. Buying or selling an accepted paper order only changes *reservations*; the model does not settle fills into positions.
- Finnhub data may be delayed or unavailable. Signal mix reports missing records as `UNAVAILABLE` rather than inventing returns.
- A read-only decision path reconstructs the application event log. It is not itself a tamper-proof audit system.
- The visuals use React and native SVG/CSS; no charting service or new market-data API is needed.
