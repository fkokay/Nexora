#!/usr/bin/env bash
set -euo pipefail

API_URL="${AIERP_API_HEALTH_URL:-http://127.0.0.1:5080/health}"
AI_URL="${AIERP_AI_HEALTH_URL:-http://127.0.0.1:5081/health}"
WAIT_SECONDS="${1:-0}"

if [[ ! "$WAIT_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "Usage: health-check.sh [wait-seconds]" >&2
  exit 2
fi

deadline=$((SECONDS + WAIT_SECONDS))
while :; do
  if curl --fail --silent --show-error --max-time 5 "$API_URL" >/dev/null 2>&1 \
    && curl --fail --silent --show-error --max-time 5 "$AI_URL" >/dev/null 2>&1; then
    echo "Platform API and AI Service health checks passed."
    exit 0
  fi
  if (( SECONDS >= deadline )); then
    echo "A service health check failed (API: $API_URL, AI: $AI_URL)." >&2
    exit 1
  fi
  sleep 2
done
