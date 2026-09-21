# Deployment Instructions — Planning Poker

The single source of truth for deploying and operating this app. Accurate as of the
in-memory / no-Redis / no-SQLite architecture (commit `e687d9d` and later).

> This is a **deployment template** — replace `your-domain.tld` and `<user>@<your-host>`
> placeholders with your own values. If you keep personal infrastructure notes, store them
> in a file like `deployment.homelab.md` that is listed in `.gitignore` (never commit
> hostnames, usernames, or network topology).

## Architecture (what's actually running)

Three Docker containers, started by `docker-compose.prod.yml`:

| Container             | Image                  | Role                                      | Port            |
|-----------------------|------------------------|-------------------------------------------|-----------------|
| `planningpoker-server` | built from `server/`   | Node.js API + Socket.IO (in-memory session store) | 8081 (internal) |
| `planningpoker-nginx`  | `nginx:alpine`         | Serves the built client + reverse-proxies `/api` and `/socket.io` to the server | 4080 → 80 |
| `planningpoker-client` | built from `client/`   | Build-only: produces static files copied into the nginx volume | — |

- **No Redis, no SQLite, no native modules.** Sessions live in a process-local `Map` in the
  Node server for the life of the process. The `better-sqlite3` dependency and its native
  build toolchain were removed. The server boots cleanly on modern Node (verified on 24).
- **Persistence:** none. A redeploy drops in-flight sessions; clients reconnect and rejoin
  automatically (the socket hook re-emits `join-session` on reconnect).
- **Transports:** WebSocket-first (`['websocket', 'polling']`) on both client and server;
  polling is only a fallback.

### Request path (typical setup)

```
Internet → your reverse proxy / tunnel (:80/:443, SSL termination)
            → planningpoker-nginx (:4080)
              → planningpoker-server (:8081, internal docker net)
```

The domain is configured in your reverse proxy to forward to
`planningpoker-nginx` on host port **4080**. SSL terminates at your reverse proxy
(any proxy that passes WebSocket upgrade headers works — nginx, nginx-proxy-manager,
Traefik, Caddy, or a Cloudflare tunnel).

## Prerequisites (server)

- Docker + Docker Compose v2 (`docker compose`) installed and running.
- SSH access: `ssh <user>@<your-host>`
- Repo checked out at `~/planningpoker`, on branch `main`.
- A reverse proxy already forwarding `your-domain.tld` → host port `4080`, with
  the WebSocket upgrade headers passed through (see Troubleshooting if WS won't connect).

## First-time setup (fresh server)

```bash
ssh <user>@<your-host>
cd ~
git clone <repo-url> planningpoker      # or your existing checkout
cd planningpoker
chmod +x deploy.sh
./deploy.sh
```

## Standard deploy (already set up)

```bash
ssh <user>@<your-host>
cd planningpoker
git pull origin main
./deploy.sh
```

`deploy.sh` does, in order:

1. `docker compose -f docker-compose.prod.yml down --remove-orphans` — stops the stack and
   removes orphaned containers from previous configs (this is what removed the old
   `planningpoker-redis` container after Redis was dropped).
2. `docker compose -f docker-compose.prod.yml build --no-cache` — rebuilds server + client.
3. `docker compose -f docker-compose.prod.yml up -d` — starts the stack.
4. Waits ~20s, then health-checks `http://localhost:4080/health` and `/api/health` for up to
   6 attempts.

A clean run ends with `🚀 All services are healthy and ready!` and exit 0.

## Verify after deploy

```bash
# Containers (expect 3: nginx, server, client — NO redis)
docker ps --filter name=planningpoker --format '{{.Names}}\t{{.Status}}'

# Health + version
curl -s http://localhost:4080/api/health
curl -s http://localhost:4080/api/version

# Removed analytics/admin/feedback/auth routes should all be 404
for p in /api/stats /api/feedback /api/analytics/events /api/auth/admin; do
  printf '%s -> ' $p; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4080$p
done

# Smoke: create a session
curl -s -X POST http://localhost:4080/api/sessions/create \
  -H 'Content-Type: application/json' -d '{"moderatorName":"Smoke"}'
```

Then open `https://your-domain.tld` and do a real create-session / join / vote.

## Local checks before pushing a deploy

Run these locally so a bad build never reaches the server:

```bash
# Server tests (in-memory, no external services needed)
cd server && npx jest --forceExit

# Server dependency audit — fix runtime vulnerabilities before deploying
# (dev-only transitive issues can be addressed separately)
cd server && npm audit

# Client tests — the `react-scripts` bin wrapper can be broken on some setups
# (e.g. Node 24: "Cannot find module '../scripts/test'"); in that case invoke the
# script directly:
cd client && CI=true node node_modules/react-scripts/scripts/test.js --watchAll=false

# Client production build (the step that runs inside Docker)
cd client && node node_modules/react-scripts/scripts/build.js
```

All three must pass before `git push`.

## Known gotchas

1. **Client source must be ESM.** CRA/webpack resolves named imports statically. A module
   written as CommonJS (`module.exports = { foo }`) imported via `import { foo }` fails the
   production build with `'foo' is not exported from '...'`. Every file under `client/src`
   must use `export const` / `export { }`. (Hit once with `utils/sessionDelta.js` — commit
   `e687d9d`.)

2. **`react-scripts` bin wrapper is broken on this dev machine** under Node 24, but
   `node_modules/react-scripts/scripts/{test,build}.js` work fine when invoked directly via
   `node` (see commands above). On the server (Docker, Node 20) the wrapper works normally.

3. **Native modules:** if a dependency requiring compilation is ever re-added, the
   `python3 make g++` build toolchain must be restored to `server/Dockerfile.prod`
   (it was removed when `better-sqlite3` left).

4. **In-memory sessions drop on redeploy.** Users in an active session during a deploy get
   "Session not found" once and reconnect. Schedule deploys between sessions, or accept the
   blip — it's a planning poker tool, not a database.

## Operations

```bash
# Tail logs (server is the useful one)
docker compose -f docker-compose.prod.yml logs -f server

# Restart just the server (e.g. after an env change) — no rebuild
docker compose -f docker-compose.prod.yml restart server

# Stop the whole stack
docker compose -f docker-compose.prod.yml down --remove-orphans

# Reset everything (removes volumes too) and redeploy from scratch
docker compose -f docker-compose.prod.yml down -v
./deploy.sh

# Roll back to a previous commit
git pull && git checkout <previous-commit>
./deploy.sh
# then: git checkout main   # to return to the branch tip
```

## Environment variables (`docker-compose.prod.yml`, server service)

Currently used by the server:
- `NODE_ENV=production`
- `PORT=8081`
- `CLIENT_URL=https://planningpoker.bytecoder.nl` (Socket.IO CORS origin)

No `ADMIN_PASSWORD`, `RATE_LIMIT_RESET_SECRET`, `REDIS_*` or `SQLITE_DB_PATH` vars anymore —
those subsystems and endpoints are gone.

## Security

- **Helmet** headers; CSP disabled (Socket.IO needs inline); HSTS in production.
- **Rate limiting:** API 100 req / 5 min per IP (global limiter) + per-socket event limiter.
  `trust proxy: 1` is set so the limiter sees the real client IP behind nginx.
- **Input validation:** session IDs are 8-char uppercase alphanumeric; user IDs are UUID v4;
  request body limited to 10 KB.
- **Socket.IO auth:** handshake middleware validates `sessionId`/`userId` against the
  in-memory session before a connection is accepted; one active socket per user slot
  (connection-conflict detection disconnects the older connection).
- **CORS:** production allows only `CLIENT_URL`.
- **Vote privacy:** while a voting round is open, `GET /api/sessions/:id` and the
  `session-joined` event only reveal a user's own vote. The full vote map is sent only
  after the moderator stops the round (`votingComplete === true`).
- **Session lifecycle:** in-memory; the 60s cleanup sweep marks idle users offline, runs a
  240s/300s inactivity countdown, and deletes sessions with no active users after 24h.
- **No persisted user data** — nothing is written to disk.

## Performance / caching (nginx)

- Static assets: images cached 1 day; JS/CSS/fonts cached 1 year (content-hashed filenames,
  `immutable`).
- HTML: no cache (always fresh).
- gzip enabled for JS/JSON/CSS/text.
- Socket.IO broadcasts use minimal delta payloads (not the full session), so voting bursts
  are cheap.

## Troubleshooting

1. **A service won't start / is unhealthy:**
   ```bash
   docker compose -f docker-compose.prod.yml logs server   # or nginx
   ```
   The server has no external dependencies now, so a startup failure is almost always a code
   or env issue (check the logs for the first stack trace).

2. **Can't reach the app at the domain:**
   - `curl http://localhost:4080/api/health` on the server — if this works, the app is up and
     the problem is upstream (reverse proxy, tunnel, or DNS).
   - `docker ps --filter name=planningpoker` — confirm all 3 containers are `Up`.
   - In your reverse proxy, confirm the `your-domain.tld` proxy host points at
     host port `4080` and the custom locations are correct.

3. **WebSocket / real-time issues (votes not updating):**
   - The app is WebSocket-first; polling is only a fallback. Open the browser console and
     check the Socket.IO transport (it should show `websocket`, not stuck on `polling`).
   - Your reverse proxy must pass the `Upgrade` / `Connection` headers for `/socket.io/`.
     The planningpoker-nginx config already sets these when proxying to the server; the
     upstream proxy must also pass them end-to-end.
   - Check `docker compose -f docker-compose.prod.yml logs server` for connection errors.

4. **Socket.IO "Authentication required" / "Session not found":**
   - Stale local state: clear the site's localStorage (`planningpoker_user_sessions`) and
     reload. This is expected after a redeploy (in-memory sessions were lost).
   - Confirm the client is setting `socket.auth = { sessionId, userId }` before connecting.

5. **Client Docker build fails with `'<name>' is not exported from '...'`:**
   - A `client/src` file was written in CommonJS. See gotcha #1 — convert it to ESM
     (`export const` / `export { }`), then rebuild.

## Reset / clean slate

```bash
docker compose -f docker-compose.prod.yml down -v   # stop + remove volumes
./deploy.sh                                          # rebuild from scratch
```
## Search engine submissions (SEO)

The site is privacy-first: **no site-side analytics**. Search visibility is measured purely via
Google Search Console and Bing Webmaster Tools (search metrics, not user tracking).

### One-time setup
- **Google Search Console**: already verified via `client/public/google7f798fbc8b2324be.html`.
- **Bing Webmaster Tools**: sign in at <https://www.bing.com/webmasters> and use
  "Import from Google Search Console" — no extra site verification needed.
- **IndexNow** (Bing/Seznam instant indexing): the key file
  `client/public/bfa87b38920120de07dac246e7b3f69d.txt` is already deployed.

### After each deploy that changes public pages
Ping IndexNow so Bing picks up changed URLs immediately:

```bash
curl -s "https://api.indexnow.org/indexnow?url=https://planningpoker.bytecoder.nl/&key=bfa87b38920120de07dac246e7b3f69d&urlFormat=text"
```

Or submit the full sitemap: `https://api.indexnow.org/indexnow?url=https://planningpoker.bytecoder.nl/sitemap.xml&key=bfa87b38920120de07dac246e7b3f69d&urlFormat=text`

Google is updated automatically via the sitemap (`client/public/sitemap.xml`) — keep the
`<lastmod>` dates honest when public pages change.
