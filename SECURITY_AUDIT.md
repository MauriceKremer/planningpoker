# Security Assessment — Planning Poker

**Assessment date:** 26 June 2026  
**Scope:** Node.js/Express server + React client (in-memory session store, no persistence)  
**Risk level:** **LOW** ✅

## Executive summary

The application intentionally stores **no personal data, no accounts, and no persistent state**. Sessions live in a process-local `Map` for the lifetime of the Node process. This minimal threat model keeps the risk profile low: an attacker who gained access could, at worst, disrupt or inspect active planning-poker sessions, but cannot exfiltrate meaningful user data because none is retained.

Current controls are proportionate and in place, including new participant vote-out controls.

## Dependency audit status

### Server
- **19 moderate severity vulnerabilities** remain after `npm audit`.
- All are in **dev-only transitive dependencies** (`jest`, `js-yaml`, and `uuid` v3/v5/v6 buffer path — the app itself uses `uuidv4` only).
- Runtime dependencies (`express`, `socket.io`, `helmet`, `cors`, `express-rate-limit`, `express-validator`) are clean.

### Client
- **41 vulnerabilities** remain after `npm audit`.
- Almost all come from `react-scripts@5.0.1` and its build-time dependency tree (`webpack-dev-server`, `workbox`, `postcss`, `serialize-javascript`, etc.).
- These affect the **build pipeline**, not the runtime app served to browsers. `react-scripts` is pinned to 5.0.1; forcing an update would break the build, so these are accepted as low-risk for a static site.

## Active security controls

| Control | Implementation |
|---|---|
| Security headers | `helmet` with HSTS in production; X-Frame-Options / X-Content-Type-Options / X-XSS-Protection in nginx |
| API rate limiting | `express-rate-limit` on `/api/`, 100 req / 5 min per IP |
| Socket rate limiting | Sliding-window per socket in `src/socket/rateLimiter.js` covering all mutating events |
| Reverse-proxy trust | `app.set('trust proxy', 1)` so rate limits see real client IP |
| CORS | Whitelist-based; production allows only `CLIENT_URL` |
| Input validation | `express-validator` on REST; `socket/validation.js` on WebSocket events |
| Session ID format | 8-char uppercase alphanumeric, generated with `crypto.randomBytes` |
| User ID format | UUID v4 |
| Socket auth | Handshake middleware validates `sessionId`/`userId` against the in-memory session before accepting the connection |
| Authorization | Moderator-only actions checked server-side against `session.moderatorId` |
| Vote privacy | `sanitizeSession()` hides other users' votes until `votingComplete === true` |
| Session isolation | Each socket is bound to one session/user; connection conflicts disconnect stale sockets |
| Participant vote-out | Server-side validation; only one vote-out per session; target cannot vote; 25% threshold (rounded up) calculated server-side; initiator can cancel |
| Request size | `express.json({ limit: '10kb' })` |
| Nginx rate limiting | `limit_req` + `limit_conn` on `/api/` and `/socket.io/` |
| No persistence | No database, no logs of user data; sessions expire with the process |

## Remaining risks (acceptable for this app)

| Risk | Severity | Rationale |
|---|---|---|
| Session IDs are only 8 characters | Low | Brute-forcing is impractical given the short lifetime and no valuable data. |
| No user authentication | Low | By design. Names are self-chosen display names, not identities. |
| Build-tool dependency vulnerabilities | Low | Affect development/build only, not the deployed static bundle. |
| CSP is disabled in Helmet | Low | Enabling a strict CSP in nginx would require tuning for inline scripts; current X-Frame-Options / X-Content-Type-Options provide baseline protection. |
| Sessions lost on redeploy | Low | By design; a planning poker tool does not need durability. |
| Participant vote-out could be abused | Low | Threshold requires at least 25% of participants (minimum 1 vote), but only active session participants can vote; target is notified and removed immediately on success. |

## Recommended future hardening (not required)

1. Add a strict `Content-Security-Policy` in nginx once inline script needs are audited.
2. Restrict nginx `set_real_ip_from` to actual upstream proxy ranges instead of `0.0.0.0/0`.
3. Remove `allowEIO3: true` from Socket.IO if all clients are modern.
4. Periodically re-run `npm audit` and update runtime dependencies.
5. Consider a higher minimum vote-out threshold for very small sessions (currently 1 of 4 is sufficient).

## Conclusion

For a short-lived, ephemeral collaboration tool with no PII and no persistence, the current security posture is **good enough**. The architecture itself (no database, no accounts, in-memory only) remains the strongest security feature. The new vote-out feature is implemented with appropriate server-side controls and does not materially increase risk.
