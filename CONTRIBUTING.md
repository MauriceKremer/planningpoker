# Contributing to Planning Poker

Thank you for considering a contribution! This is a privacy-first, no-ads passion project —
read the short ground rules below and you'll fit right in.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## 🧭 Ground rules (non-negotiable)

The privacy stance **is the product**. Contributions must not:

- Add analytics, trackers, cookies, ads, or third-party requests
- Introduce persistent storage of user data (the in-memory, ephemeral-by-design store is a feature)
- Log IP addresses or any personally identifying information

If in doubt, ask first in an issue before building it.

## 🚀 Development setup

Prerequisites: Node.js 18+ and npm. For tests, Node 20 is recommended
(`react-scripts`' test runner breaks on Node 24).

Quick way:

```bash
./dev-setup.sh
```

Manual way:

```bash
# Backend (Terminal 1) — http://localhost:8081/api
cd server
npm install
npm run dev

# Frontend (Terminal 2) — http://localhost:3000
cd ../client
npm install
npm start
```

## ✅ Running the tests

```bash
# Server (in-memory, no external services needed)
cd server && npm test

# Client
cd client && npm test
```

Behavior changes should come with tests. The server's domain logic is deliberately
split into pure modules so it stays trivially testable — keep it that way (see below).

## 🏗️ Architecture principles

- **Ephemeral by design** — the session store is a process-local `Map`. No Redis, no SQLite,
  no disk. Everything vanishes on restart or after 24 hours.
- **Pure domain logic / I/O orchestration split** — decision logic lives in
  `server/src/socket/` (`cleanupPolicy.js`, `voteOut.js`, `moderator.js`, `rateLimiter.js`,
  `validation.js`) as pure, unit-testable functions; `server/src/services/socketHandler.js`
  owns the I/O and broadcasting.
- **Minimal event payloads** — clients receive deltas via `eventPayloads.js`, and other
  participants' votes are never broadcast until the round is revealed (`sanitizeSession()`).
- **Authorization is server-side** — moderator checks happen against server state, never the client.
- **Privacy-safe ops** — nginx access logs contain no IP addresses.

When in doubt, match the existing style of the module you're touching.

## 📝 Commit & PR style

- Commit messages use short conventional prefixes: `feat:`, `fix:`, `docs:`, `security:`,
  `perf:`, `cleanup:` (optionally with a scope, e.g. `fix(ui):`)
- Keep PRs small and focused; one logical change per PR
- Update documentation (`README.md`, `PRIVACY.md`, the in-app manual in `client/src/pages/About.js`)
  when behavior changes — these docs are verified against the code, and drift is treated as a bug
- Describe **what** and **why**; the diff shows how

## 🐛 Found a bug or a security issue?

- Security issues: see [SECURITY.md](SECURITY.md) — do **not** open a public issue
- Regular bugs and feature ideas: open a GitHub issue using the templates

## 📄 License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers the project.