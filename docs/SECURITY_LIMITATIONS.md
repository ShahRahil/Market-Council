# Security and accuracy boundaries — v0.3

1. **Simulated broker only.** The broker is a separate running service that accepts, persists, retrieves, and cancels paper orders. It cannot submit live orders. An `ACCEPTED` receipt is not a fill.
2. **User-driven research.** Reviews support 20 curated securities and arbitrary requested USD amounts, rather than fixed scenarios. The app is not an automated stock-picking or execution engine.
3. **Data provenance.** `DATA_MODE=sample` shows labelled illustrative snapshots and no fabricated headlines. `DATA_MODE=finnhub` uses Finnhub provider quotes and company headlines subject to plan coverage; a quote failure does not silently generate fake live data. USD order amount is not FX converted for CAD instruments.
4. **Authentication.** Operator API uses one shared admin bearer token. The recorded `operator` identity is not tied to individually authenticated employees. Agent identities are application-controlled, not cryptographically attested.
5. **Authority.** Admin can edit enabled flags and allowed actions. Permission changes are audited; only execution gateway can hold the execute permission. The policy evaluator is deterministic JavaScript reading Atlas, not LLM logic.
6. **Reservation state.** The paper account uses compare-and-swap revisions to reserve cash and concentration exposure before broker submission. This is virtual bookkeeping of pending accepted orders, not position settlement or a brokerage reconciliation engine.
7. **Revoke/rollback.** Kill switch stops pending work, but cannot undo already submitted orders. The broker cancel endpoint is an explicit best-effort compensation for accepted paper orders. A small race still exists between last Atlas authorization and broker submission.
8. **Audit integrity.** MongoDB schema-validation protects the required event shape. Application API only inserts audit events, but an Atlas admin may mutate history; not WORM or cryptographically tamper-proof.
9. **Crash behavior.** On restart, active nonterminal workflows are interrupted and ambiguous broker outcomes are reconciled without resubmitting. Pending paper-account reservations may require manual cleanup after a confirmed missing broker order.
10. **Public network.** The service binds to localhost. Do not expose it publicly without a proper identity/authentication layer and rate limiting.
11. **Competition rules.** Check hackathon restrictions around reusing code produced before the allowed hacking period; disclose any reused material.

8. **Finnhub license and coverage.** Finnhub website plans are published as personal-use only and prohibit redistribution without permission. Seek permission before publicly displaying provider data to hackathon judges or third parties. Free access is commonly limited to US instruments; do not imply TSX prices or news are available without entitlement. The quote is not guaranteed to be a streaming tick. Provider timestamps and failures remain visible.
