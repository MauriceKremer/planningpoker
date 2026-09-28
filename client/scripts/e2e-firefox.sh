#!/usr/bin/env bash
# Dockerized Firefox E2E runner.
#
# WHY THIS EXISTS: Firefox cannot be command-line-launched on macOS 27 — its
# process sandbox cannot issue the sandbox extension to plugin-container
# ("sandbox_extension_issue_file_to_process ... Operation not permitted",
# child killed with signal 9). Upstream: playwright#42082; reproduced with
# stock Firefox 156 too. Chromium and WebKit are unaffected on macOS 27, so
# only the firefox project runs here, inside a Linux container where Firefox
# works. Linux CI is unaffected and uses the normal host runner.
#
# The E2E client bundle bakes http://localhost:4080 (VITE_API_URL /
# VITE_SOCKET_URL), so the browser must reach that exact origin. Inside the
# container "localhost" is the container itself; a tiny TCP proxy
# (localhost:4080 → nginx:80, inside the stack's network) gives the browser
# the origin the bundle expects without touching nginx, the E2E override or
# the baked bundle.
#
# Usage:
#   bash scripts/e2e-firefox.sh                    # firefox project, stack auto-started
#   bash scripts/e2e-firefox.sh --grep "vote-out"  # extra playwright args (word-split)
set -euo pipefail
cd "$(dirname "$0")/.." # client/

PW_VERSION="1.63.0"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-jammy"

export E2E_FF_ARGS="${*:-}"

# 1. The prod E2E stack must be running (same stack the host runner uses).
if ! curl -fsS http://localhost:4080/health >/dev/null 2>&1; then
  echo "E2E stack not reachable on :4080 — starting it (scripts/e2e-stack.sh up)..." >&2
  bash scripts/e2e-stack.sh up >&2
fi

# 2. Join the stack's network (name resolved from the live nginx container, so
#    it stays correct even if the compose project name ever changes).
NET=$(docker inspect planningpoker-nginx --format '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}}{{end}}')

# 3. The image version must match @playwright/test so the browser revision
#    (firefox-1543 for 1.63.0) matches what the host runner uses.
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE" >&2

docker run --rm --init \
  --network "$NET" \
  -e HOME=/tmp/pw \
  -e E2E_FF_ARGS \
  -v "$(pwd):/work" \
  -w /work \
  "$IMAGE" \
  bash -c '
    set -euo pipefail
    mkdir -p "$HOME" /work/test-results /work/playwright-report

    # TCP tunnel localhost:4080 -> nginx:80 FIRST — the health check below
    # goes through it (localhost inside the container is the container).
    # Raw socket pipe: HTTP and WebSocket upgrades pass through untouched
    # (transport-agnostic).
    node -e "
      const net = require(\"net\");
      net.createServer((down) => {
        const up = net.connect(80, \"nginx\");
        down.pipe(up); up.pipe(down);
        down.on(\"error\", () => up.destroy());
        up.on(\"error\", () => down.destroy());
      }).listen(4080, \"0.0.0.0\", () => console.log(\"[e2e-firefox] localhost:4080 -> nginx:80\"));
    " &
    PROXY_PID=$!
    trap "kill $PROXY_PID 2>/dev/null || true" EXIT
    sleep 0.5

    if ! curl -fsS http://localhost:4080/health >/dev/null 2>&1; then
      echo "FATAL: stack not reachable from container even via proxy" >&2
      exit 1
    fi

    # webServer: playwright checks /health first and reuses the stack
    # (reuseExistingServer: true), so no docker access is needed in-container.
    # shellcheck disable=SC2086 — playwright args are intentionally word-split
    E2E_SKIP_STACK=1 npx playwright test --project=firefox $E2E_FF_ARGS
  '

# The bind-mounted result dirs end up root-owned; hand them back to the host user.
docker run --rm -v "$(pwd)/test-results:/x" alpine sh -c "chown -R $(id -u):$(id -g) /x 2>/dev/null || true"
docker run --rm -v "$(pwd)/playwright-report:/x" alpine sh -c "chown -R $(id -u):$(id -g) /x 2>/dev/null || true"