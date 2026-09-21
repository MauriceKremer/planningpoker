# Security Policy

## Project posture

Planning Poker is **privacy-first by design**. Understanding the data model is the fastest way
to understand the threat model:

- **No accounts, no passwords, no PII** — nothing to steal
- **No persistent storage** — all session state lives in the server's process-local memory and
  disappears on restart (max lifetime: 24 hours)
- **No IP logging for analytics** — access logs are stored without client IP addresses
- **No tracking, analytics, or cookies**

A full assessment is available in [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

## Supported versions

The project ships as a rolling release: only the latest `main` branch is supported.
Self-hosters should deploy from the current main (see `deploymentInstructions.md`).

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Contact options (in order of preference):

1. **GitHub private security advisory** (if this repository is hosted on GitHub)
2. **Email**: `maurice.kremer@gmail.com` — please use a descriptive subject like
   `[planning-poker security]` and encrypt if you need to (PGP can be arranged on request)

Please include:

- A description of the vulnerability and its impact
- Step-by-step reproduction (PoC code/URLs welcome)
- Affected component(s): server (Express/Socket.IO), client (React), or the Docker/nginx setup
- Your assessment of severity, if you have one

### Response expectations

This is a passion project with no paid security team — expect a best-effort response within
a few days. You will receive an acknowledgement, and a follow-up once the issue is triaged,
fixed, and disclosed. There is **no bug bounty**, but credit is happily given in release notes
unless you prefer to stay anonymous.

### Safe harbor

Good-faith research and responsible disclosure is welcomed and will not be met with legal
action. Please:

- Avoid privacy violations, degradation of user experience, and disruption to production services
- Only test against instances you own or have explicit permission to test
- Give the maintainer a reasonable window to fix issues before public disclosure

## Scope

**In scope:**

- Server (`server/`): REST API, Socket.IO event handling, session store, validation, rate limiting
- Client (`client/`): React app, session persistence, browser storage usage
- Container setup: Dockerfiles, docker-compose, nginx configuration

**Out of scope:**

- Denial-of-service / volumetric attacks (the deployment is rate-limited; please don't stress-test it)
- Social engineering of hosting infrastructure
- Availability of the hosted instance at `planningpoker.bytecoder.nl` (best-effort hobby hosting)
- Findings in upstream dependencies without a realistic exploit path (they are tracked via `npm audit`)

## Design notes for reviewers

- Session IDs: 8-character uppercase alphanumeric codes (`crypto.randomBytes`)
- User IDs: UUID v4
- Socket.IO handshake middleware validates `sessionId`/`userId` against in-memory state
- Authorization for moderator actions is enforced **server-side**
- Votes of other participants are hidden (`sanitizeSession()`) until `votingComplete === true`
- HTTP API: rate-limited (100 req / 5 min), 10KB request cap; Socket.IO events: 60 events/min per socket