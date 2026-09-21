# Security Assessment — Planning Poker

**Assessment date:** 21 September 2026  
**Scope:** Node.js/Express server + React client (in-memory session store, no persistence), nginx sidecar, Docker deployment  
**Distribution note:** The repository is now public on GitHub — all source is open for review; no security-through-obscurity assumptions apply.  
**Risk level:** **LOW** ✅

## Executive summary

The application intentionally stores **no personal data, no accounts, and no persistent state**. Sessions live in a process-local `Map` for the lifetime of the Node process. This minimal threat model keeps the risk profile low: an attacker who gained access could, at worst, disrupt or inspect active planning-poker sessions, but cannot exfiltrate meaningful user data because none is retained.

Since the previous assessment the vote-privacy model was tightened (vote **values** are no longer broadcast while a round is open — only *who has voted*), nginx now logs access without IP addresses, the reverse-proxy trust configuration was tightened to private CIDR ranges, and moderator hand-over on disconnect gained a revalidated grace window. All 138 server tests and 34 client tests pass.

## Dependency audit status

### Server
- **10 vulnerabilities (5 moderate, 5 high)** reported by `npm audit`.
- **Runtime-relevant:**
  - `socket.io-parser` 4.0.0–4.2.6 (**high**) — zero-attachment memory exhaustion. Non-breaking fix available (`npm audit fix`). This is the most important one to apply.
  - `qs` / `body-parser` (moderate, DoS). The app sets a *valid* `express.json({ limit: '10kb' })`, so the "invalid limit disables size enforcement" path does not apply, but a patch is available non-breaking.
  - `uuid` < 11.1.1 (moderate, buffer bounds check in v3/v5/v6 **when a `buf` argument is provided**). This app calls `uuidv4()` with no buffer, so it is **not exploitable as used**. The patched version (uuid@14) is a breaking major; defer to a planned upgrade.
- **Dev/build-only (not shipped):** `brace-expansion`, `browserslist`, `ip-address`, `js-yaml`, `baseline-browser-mapping` (test/lint tooling).

### Client
- **43 vulnerabilities (1 critical, 20 high, 12 moderate, 10 low)** — essentially all in the `react-scripts@5.0.1` build-time toolchain (webpack-dev-server, `websocket-driver` [the critical one], workbox, postcss, svgo, eslint, jest trees).
- These affect the **dev server and build pipeline only**, not the static bundle served to browsers. `react-scripts` is pinned at 5.0.1; forcing upgrades would break the build. Same accepted-risk class as the previous assessment.

## Active security controls

| Control | Implementation |
|---|---|
| Security headers | `helmet` with HSTS in production (CSP disabled — see risks); X-Frame-Options / X-Content-Type-Options / X-XSS-Protection in nginx |
| API rate limiting | `express-rate-limit` on `/api/`, 100 req / 5 min per IP |
| Socket rate limiting | Sliding-window per socket/event in `src/socket/rateLimiter.js`, 60 events/min, covering all mutating events |
| Reverse-proxy trust | `app.set('trust proxy', 1)`; nginx `set_real_ip_from` restricted to private ranges (10/8, 172.16/12, 192.168/16) |
| CORS | Whitelist-based; production allows only `CLIENT_URL`; fails closed with a console warning on unknown origins |
| Input validation | `express-validator` on REST; pattern/length validation on every WebSocket event via `socket/validation.js` |
| Session ID format | 8 hex chars from `crypto.randomBytes` (32 bits entropy), collision-checked, uppercase |
| User ID format | UUID v4 (validated by strict regex on every socket event) |
| Socket auth | Handshake middleware validates `sessionId`/`userId` format **and** membership against the in-memory store before accepting the connection; every event re-checks `socket.sessionId`/`socket.userId` against the payload |
| Authorization | Moderator-only actions (start/stop voting, card set, transfer, remove, close, test-sound) checked server-side against `session.moderatorId` |
| Vote privacy (values) | While a round is open, broadcasts expose only `votedUserIds` (ids, no values) — `eventPayloads.voteSubmitted`; the voter's own value is echoed back privately via targeted `vote-accepted` |
| Vote privacy (REST) | `sanitizeSession(session, requestingUserId)` returns the requester's own vote only; others' values hidden until `votingComplete === true` |
| Vote-out privacy | `publicVoteOutView()` exposes tallies and names only — never individual voter identities |
| Session isolation | Each socket bound to one session/user; conflict detection disconnects stale sockets; moderator hand-over after a 60 s disconnect grace, revalidated atomically |
| Vote-out integrity | Server-side creation/casting/pruning/expiry in `socket/voteOut.js`; 25% threshold (rounded up, min 1) computed server-side; target cannot vote; initiator-only cancel; 2-minute expiry with lazy expiry on vote; ghost votes pruned on removal |
| Identity by id | Join/restore paths key on server-issued UUIDs, never on display-name matching |
| XSS posture | User input stored verbatim (no server-side escaping/mangling); React escapes all interpolation on render |
| Request size | `express.json({ limit: '10kb' })` (a valid limit — not affected by the body-parser "invalid limit" advisory) |
| Nginx rate limiting | `limit_req` (10 r/s api, 30 r/s ws) + `limit_conn` (10) with bursts, on `/api/` and `/socket.io/` |
| No-IP logging | nginx access logs use a custom `no_ip` format (no `$remote_addr`); limit-rejection logging demoted to warn; the Express error logger also omits the client IP — PRIVACY.md claim upheld at both proxy and app layers |
| No persistence | No database, no disk writes; sessions expire with the process; heartbeat last-seen in memory only |
| Least privilege | Server container runs as non-root `nodejs` user; nginx config mounted read-only |
| Info hygiene | Socket.IO `serveClient: false`; `/health` returns no sensitive data |

## Findings from this review

| ID | Finding | Severity | Notes |
|---|---|---|---|
| F1 | `test-sound` socket event has **no `checkRateLimit`** call (all other mutating events have one) | Low | Authenticated participants only; spam causes audible notifications for the room. One-line fix. |
| F2 | Express error middleware logged `req.ip` on error events | Low | **Resolved** — the IP field was removed from the security-event log; only `path` + error message are logged. PRIVACY.md's "no IP address logging" claim now holds at both proxy and app layer. |
| F3 | Moderator-supplied `cardSet` array is validated as "non-empty array" but items are unbounded in length/count (bounded only by the 10 KB message limit) | Low | Values are broadcast to the room; recommend per-item length and max-item-count caps. |
| F4 | `X-XSS-Protection` header is deprecated and a no-op in modern browsers | Info | Harmless; keep or drop, XSS is handled by React escaping. |

None of the findings change the overall risk rating. F2 was resolved as part of this assessment cycle.

## Remaining risks (acceptable for this app)

| Risk | Severity | Rationale |
|---|---|---|
| Session IDs are only 8 hex characters (32 bits) | Low | Impersonation additionally requires a valid 128-bit user UUID; data is ephemeral and non-sensitive; brute-forcing is impractical. |
| No user authentication | Low | By design. Names are self-chosen display names, not identities. |
| Build-tool dependency vulnerabilities (client) | Low | Dev/build pipeline only; not part of the served bundle. |
| `socket.io-parser` memory-exhaustion advisory (server, high) | Medium (until patched) | Fix is non-breaking and should be applied (`npm audit fix`); nginx `limit_conn`/`limit_req` mitigate at the edge in the meantime. |
| CSP is disabled in Helmet | Low | Enabling a strict CSP in nginx would require tuning for inline scripts; X-Frame-Options / X-Content-Type-Options provide baseline protection. |
| Sessions lost on redeploy | Low | By design; a planning poker tool does not need durability. |
| Any participant can reset votes mid-round | Low | Intentional (documented in the user manual); no data disclosure involved. |
| REST GET of a session by ID reveals participants & results to anyone holding the session ID | Low | Inherent to the share-by-code design; values remain hidden while voting is open. |

## Recommended future hardening

1. **Apply non-breaking server dependency fixes** (`npm audit fix`): addresses `socket.io-parser` (high), `qs`/`body-parser` (moderate). Re-run tests afterwards.
2. Add the missing `checkRateLimit(socket.id, 'test-sound')` for consistency (F1).
3. Add per-item validation caps to `update-card-set` (F3).
4. Add a strict `Content-Security-Policy` in nginx once inline script needs are audited.
5. Remove `allowEIO3: true` from Socket.IO if all clients are modern (carried over — still present).
6. Re-run `npm audit` periodically; watch for a non-breaking path for `uuid`.

## Conclusion

For a short-lived, ephemeral collaboration tool with no PII, no accounts, and no persistence, the security posture remains **good** — and has improved since the last assessment: vote values are now redacted from all room broadcasts while a round is open, nginx no longer logs client IPs, the proxy-trust configuration was tightened, and containers run least-privilege. The architecture itself (no database, no accounts, in-memory only) is still the strongest security feature. The three new findings are all Low/Info and cheap to fix; none blocks publication.