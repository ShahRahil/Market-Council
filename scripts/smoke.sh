#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3187}"
: "${ADMIN_TOKEN:?Set ADMIN_TOKEN in your shell (do not print it)}"
printf 'Health:\n'
curl -fsS "$BASE/api/health"; echo
printf 'Universe count:\n'
curl -fsS "$BASE/api/universe" -H "Authorization: Bearer $ADMIN_TOKEN" | wc -c
printf 'Start user-selected paper review (QQQ, $200):\n'
curl -fsS -X POST "$BASE/api/runs" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"symbol":"QQQ","notionalUsd":200,"proposerId":"portfolio-agent"}'
echo
