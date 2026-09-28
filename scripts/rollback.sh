#!/usr/bin/env bash
#
# Roll back to the previous deployment.
#
# deploy.sh tags the running images as :previous before every rebuild, so
# rolling back is a retag + restart — no rebuild, no git dance. The nginx
# image contains the full static build (nginx + baked client bundle), so
# the retag alone restores both the app and the assets. Roll back the
# server too: its state is in-memory, so there is nothing to migrate.
#
# The :previous tag survives the rollback, so re-running this script is a
# no-op instead of flip-flopping versions.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

for image in planningpoker-nginx planningpoker-server; do
    if ! docker image inspect "${image}:previous" >/dev/null 2>&1; then
        echo "❌ ${image}:previous does not exist — nothing to roll back to." >&2
        echo "   Run deploy.sh first; it creates the :previous tag." >&2
        exit 1
    fi
done

echo "🔄 Rolling back to the previous deployment (no rebuild)…"
$COMPOSE down --remove-orphans
docker tag planningpoker-nginx:previous planningpoker-nginx:current
docker tag planningpoker-server:previous planningpoker-server:current
$COMPOSE up -d --no-build --wait

echo "✅ Rolled back. Verify: curl -f http://localhost:4080/health"