# Security Assessment — Planning Poker

**Assessment date:** 21 September 2026  
**Scope:** Node.js/Express server + React client (in-memory session store, no persistence), nginx sidecar, Docker deployment  
**Distribution note:** The repository is now public on GitHub — all source is open for review; no security-through-obscurity assumptions apply.  
**Risk level:** **LOW** ✅

## Executive summary

The application intentionally stores **no personal data, no accounts, and no persistent state**. Sessions live in a process-local `Map` for the lifetime of the Node process. This minimal threat model keeps the risk profile low: an attacker who gained access could, at worst, disrupt or inspect active planning-poker sessions, but cannot exfiltrate meaningful user data because none is retained.

Since the previous assessment the vote-privacy model was tightened (vote **values** are no longer broadcast while a round is open — only *who has voted*), nginx now logs access without IP addresses, the reverse-proxy trust configuration was tightened to private CIDR ranges, and moderator hand-over on disconnect gained a revalidated grace window. All 146 server tests and 34 client tests pass.

GitHub code scanning (CodeQL) was enabled and flagged 4 high + 7 medium alerts in the pre-render pipeline and user-map mutation paths (F5/F6 below). None were exploitable — the build scripts only process our own Vite output and every socket path already enforces strict UUID validation — but all 11 were resolved in the same cycle: the build-gate regexes are now case-correct, and the mutation paths are hardened with own-property guards so they no longer depend solely on upstream validation.

During this assessment cycle three findings were raised (F1–F3, all Low/Info) — **all three were resolved during the cycle**: F2 (client IP in the app-layer error log) removed, F1 (missing rate limit on `test-sound`) added, F3 (unbounded card-set items) bounded server-side at both the REST and socket paths. All non-breaking dependency fixes were then applied (server 10 → 1, client 43 → 30, zero critical; both test suites and both builds verified green).

## Dependency audit status

### Server
- **1 moderate vulnerability** remains after applying all non-breaking `npm audit fix` updates (down from 10: 5 moderate, 5 high at assessment time).
- **Remaining:** `uuid` < 11.1.1 (moderate, buffer bounds check in v3/v5/v6 **when a `buf` argument is provided**). This app calls `uuidv4()` with no buffer, so it is **not exploitable as used**. The patched version (uuid@14) is a breaking major; deferred to a planned upgrade.
- **Resolved by `npm audit fix`:** `socket.io-parser` zero-attachment memory exhaustion (high), `qs`/`body-parser` DoS (moderate), and the dev-only `brace-expansion`, `browserslist`, `ip-address`, `js-yaml`, `baseline-browser-mapping` findings. All 138 server tests pass with the updated lockfile.

### Client
- **30 vulnerabilities (14 high, 7 moderate, 9 low)** after non-breaking `npm audit fix` (down from 43 incl. 1 critical at assessment time; the critical `websocket-driver` finding is resolved).
- Essentially all remaining findings live in the `react-scripts@5.0.1` build-time toolchain (webpack-dev-server, workbox, postcss, svgo, eslint, jest trees).
- These affect the **dev server and build pipeline only**, not the static bundle served to browsers. `react-scripts` is pinned at 5.0.1; forcing upgrades would break the build. Same accepted-risk class as the previous assessment. Build and 34 client tests pass with the updated lockfile.

## Active security controls

| Control | Implementation |
|---|---|
| Security headers | `helmet` (HSTS in production) **and a strict Content-Security-Policy** in Helmet plus both nginx configs; X-Frame-Options / X-Content-Type-Options / X-XSS-Protection in nginx |
| API rate limiting | `express-rate-limit` on `/api/`, 100 req / 5 min per IP |
| Socket rate limiting | Sliding-window per socket/event in `src/socket/rateLimiter.js`, 60 events/min, covering **every** room-broadcasting/mutating event (including `test-sound`) |
| Reverse-proxy trust | `app.set('trust proxy', 1)`; nginx `set_real_ip_from` restricted to private ranges (10/8, 172.16/12, 192.168/16) |
| CORS | Whitelist-based; production allows only `CLIENT_URL`; fails closed with a console warning on unknown origins |
| Input validation | `express-validator` on REST (incl. per-item card-set bounds); pattern/length validation on every WebSocket event via `socket/validation.js`; card sets bounded server-side via `sanitizeCardSet` (≤ 24 items, 1–16 chars per value, trimmed) at both the REST create and socket update paths |
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
| F1 | `test-sound` socket event had **no `checkRateLimit`** call (all other mutating events have one) | Low | **Resolved** — rate limit added; covered by an integration test. |
| F2 | Express error middleware logged `req.ip` on error events | Low | **Resolved** — the IP field was removed from the security-event log; only `path` + error message are logged. PRIVACY.md's "no IP address logging" claim now holds at both proxy and app layer. |
| F3 | Moderator-supplied `cardSet` array validated only as "non-empty array" — items unbounded in length/count | Low | **Resolved** — `sanitizeCardSet()` (≤ 24 items, 1–16 chars per value, trimmed, string-only) enforced in `createSession` (REST, 400 via express-validator wildcard rules) and `update-card-set` (socket); validated before mutation; unit + integration tests added. |
| F4 | `X-XSS-Protection` header is deprecated and a no-op in modern browsers | Info | Harmless; keep or drop, XSS is handled by React escaping. |
| F5 | GitHub CodeQL (4 × high): `js/bad-tag-filter` + `js/incomplete-multi-character-sanitization` — the `<script` regexes in the pre-render pipeline (`prerender.mjs` tag marker, `verify-build.mjs` inline-script gate, `entry-server.jsx` head hoist) were case-sensitive, so a hypothetical `<SCRIPT>` variant would slip past the build's own security gate | High | **Resolved** — the gate regexes now match every valid tag spelling (case-insensitive; whitespace- and attribute-bearing end tags), and the verify-build inline-script check asserts on each matched block in place (JSON-LD-attributed or empty-bodied, block count = opening-tag count) instead of strip-then-check, so no sanitizer-bypass reasoning applies. Validated against injected attack variants (uppercase tags, whitespace end tags, unclosed tags, `</script>` inside a JSON-LD string) — all caught. Build-time code operating on our own Vite output, so no exploitable path existed — but the gate is now case/spelling-correct. |
| F6 | GitHub CodeQL (7 × medium): `js/prototype-polluting-assignment` — user-map writes guarded by truthiness checks (`session.users[userId].lastSeen = …` etc.) and a localStorage-sessions read-modify-write; a `__proto__`-shaped key would pass the guard and pollute `Object.prototype` | Medium | **Resolved (defense-in-depth)** — every socket path already rejects such keys via strict UUID validation, so no exploitable path existed. Hardened anyway: own-property lookup helper (`Object.hasOwn`) at all four server mutation sites, and the client `sessionStorage` util now enforces the server's 8-char session-ID pattern and uses an own-property lookup before writing. |

None of the findings change the overall risk rating. All three were resolved as part of this assessment cycle.

## Remaining risks (acceptable for this app)

| Risk | Severity | Rationale |
|---|---|---|
| Session IDs are only 8 hex characters (32 bits) | Low | Impersonation additionally requires a valid 128-bit user UUID; data is ephemeral and non-sensitive; brute-forcing is impractical. |
| No user authentication | Low | By design. Names are self-chosen display names, not identities. |
| Build-tool dependency vulnerabilities (client) | Low | 30 findings, dev/build pipeline only; not part of the served bundle. |
| `uuid` buffer-bounds advisory (server, moderate) | Low | Not exploitable as the app uses it (no `buf` argument); fix requires a breaking major upgrade. |
| CSP is disabled in Helmet | Low | **Resolved.** Strict CSP now enforced in Helmet (`server/src/index.js`) and both nginx configs (`nginx/nginx.conf`, `client/nginx.conf`), tuned to the verified build inventory: no executable inline scripts (JSON-LD is CSP-exempt), same-origin API/WebSocket, `style-src 'unsafe-inline'` only for React style attributes. |
| Sessions lost on redeploy | Low | By design; a planning poker tool does not need durability. |
| Any participant can reset votes mid-round | Low | Intentional (documented in the user manual); no data disclosure involved. |
| REST GET of a session by ID reveals participants & results to anyone holding the session ID | Low | Inherent to the share-by-code design; values remain hidden while voting is open. |

## Recommended future hardening

1. ~~Add a strict `Content-Security-Policy` in nginx once inline script needs are audited.~~ **Done.** Inline script needs were audited (CRA build emits external bundles only); strict CSP enforced in Helmet and both nginx configs. Keep the three CSP strings in sync. Also remove the now-redundant weak CSP from any manually deployed copies of `client/nginx.conf`.
2. Remove `allowEIO3: true` from Socket.IO if all clients are modern (carried over — still present).
3. Re-run `npm audit` periodically; watch for a non-breaking path for `uuid`.

## Conclusion

For a short-lived, ephemeral collaboration tool with no PII, no accounts, and no persistence, the security posture remains **good** — and has improved since the last assessment: vote values are now redacted from all room broadcasts while a round is open, nginx no longer logs client IPs, the proxy-trust configuration was tightened, containers run least-privilege, and all three assessment findings (plus all non-breaking dependency advisories) were resolved within the cycle. The architecture itself (no database, no accounts, in-memory only) is still the strongest security feature. Nothing remains open except hardening items that require separate tuning (`allowEIO3`, the breaking `uuid` major). The CSP hardening item is resolved: strict CSP is enforced in Helmet and both nginx configs.