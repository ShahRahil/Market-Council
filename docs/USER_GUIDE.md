# Quick operator guide — v0.3

1. Login with `ADMIN_TOKEN`.
2. Research: pick **one of 20 securities**, choose amount in USD, choose requesting agent, click **Request review**.
3. Activity: select the request, read **Policy decision**. If `Awaiting approval`, click **Approve paper order**. Check **Timeline** for `ORDER_AUTHORIZED` and `BROKER_ORDER_VERIFIED`.
4. Governance: change the maximum order amount, concentration cap, or the permissions of any agent. Every save writes an audit event. Disabling an agent stops its research participation; removing proposal permission blocks that actor's order requests.
5. Emergency stop: activate in Governance while an approved order is pending. Pending paper execution is stopped. Reset before your next request. Already-submitted orders need explicit cancellation.
6. Activity: the **Agent messages** tab displays structured market/news/quant/risk/portfolio handoffs and distinguishes `SAMPLE_DATA` from `FINNHUB` when configured.

All requests use the same real policy workflow, not hard-coded scenario identifiers. Transactions go only to a paper broker simulator. No real money or securities change hands.

7. Research now shows up to three Finnhub company news headlines with source links; the agent trace keeps up to five. Quotes display the provider last-trade timestamp, not an unqualified real-time guarantee.
