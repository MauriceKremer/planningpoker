#!/usr/bin/env bash
# E2E stack control (migration_plan.md M2).
#
# Runs the REAL production stack (docker-compose.prod.yml: nginx + server +
# copy-container) with an e2e override that points the baked client bundle at
# localhost and whitelists the local origin for CORS.
#
# Usage: bash scripts/e2e-stack.sh up|down
set -euo pipefail
cd "$(dirname "$0")/.." # client/

COMPOSE="docker compose -f ../docker-compose.prod.yml -f docker-compose.e2e.yml"

case "${1:-up}" in
  up)
    # The client copy-container merges files into the bind mount; start from a
    # clean web root so stale hashed assets from old builds can never be served.
    rm -rf ../dockerdata/client-build

    # Drift check: nginx/nginx-e2e.conf (committed) must equal the production
    # conf except for the raised rate limits and its header comment. Without
    # this check a production nginx change could silently go untested.
    if ! diff <(grep -vE 'rate=|^#' ../nginx/nginx.conf) <(grep -vE 'rate=|^#' ../nginx/nginx-e2e.conf) >/dev/null 2>&1; then
      echo "FATAL: nginx/nginx-e2e.conf has drifted from nginx/nginx.conf —" >&2
      echo "       update the committed copy with the same sed (rate=10r/s -> 100r/s, 30r/s -> 300r/s)." >&2
      exit 1
    fi

    CLIENT_URL=http://localhost:4080 $COMPOSE up -d --build --force-recreate --wait
    ;;
  down)
    $COMPOSE down --remove-orphans
    ;;
  logs)
    $COMPOSE logs --tail=50
    ;;
  *)
    echo "Usage: $0 up|down|logs" >&2
    exit 1
    ;;
esac