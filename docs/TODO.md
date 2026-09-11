# TODO — Known remaining work

Each item is verified against the code with a `file:line` reference, not
speculative. Items that are done are deleted, not ticked: the git history is the
record of what shipped.

**Scope note.** The Taiwanese mahjong game (engine, analysis, trainer, review,
and the platform rewrite onto Fastify + Socket.IO) landed across PRs #16–#43.
Items that work closed are removed below. Items those PRs *created* are listed
under "From the mahjong build".

---

## Validation gaps (highest priority)

### V1. The e2e suite has never been run

- **Status:** 12 Playwright specs exist. None has been executed.
- **Detail:** `vitest.config.js:65` excludes `e2e/**`, so `npm run check` never
  touches them, and `npm run test:e2e` was not run during the mahjong build.
  Four specs were written during that work and have never executed at all:
  `e2e/mahjong.spec.js`, `e2e/discard-trainer.spec.js`,
  `e2e/history-review.spec.js`, `e2e/reload-mid-game.spec.js`.
- **Consequence:** no browser-level validation of the mahjong board, the fan
  guide, the trainer, the review screen, or reconnect. Every claim about those
  screens currently rests on unit tests and hand-written probes.
- **Fix:** run `npm run test:e2e` and fix what falls out. Treat the four new
  specs as unproven until they pass once.

### V2. The e2e suite cannot run alongside another Vite project

- **Status:** blocks V1 on any machine doing other front-end work.
- **Detail:** the specs hardcode `http://localhost:5173` in 16 places and
  `http://localhost:3001` in 4, and `playwright.config.js:17,32` set
  `reuseExistingServer: false`. If any other project holds 5173, the run aborts
  with "http://localhost:5173 is already used".
- **Fix:** read the base URL from an env var with the current values as
  defaults, and thread it through the specs.

### V3. The Postgres path is never exercised

- **Status:** 4 store-contract tests skip unless `DATABASE_URL` is set, and
  nothing sets it.
- **Detail:** PR #32/#33 added `packages/game-core/src/postgresStore.ts` and two
  migrations. Keeping the file stores as the default is right — `npm run check`
  must not need a database — but it means the SQL path, the migrations, and the
  SQL leaderboard aggregation have never run.
- **Fix:** add a CI job (or a documented local command) that starts Postgres,
  sets `DATABASE_URL`, and runs the same contract suite.

---

## Deployment (blockers)

### D1. Client hardcodes `localhost:3001` for the gateway

- **Status:** multiplayer and leaderboard are broken in any real deployment.
- **Detail:** `packages/game-client/src/useGameSocket.ts:25` still falls back to
  `http://localhost:3001`. This is a **build-time** Vite env var, so a shipped
  client bakes in `localhost` unless `VITE_GATEWAY_URL` is set at build.
- **Fix:** derive the gateway URL from `window.location` at runtime
  (same-origin), which also fixes D2. Keep `VITE_GATEWAY_URL` as an override for
  a split deploy.

### D2. `ws://` breaks under HTTPS

- **Status:** blocks HTTPS deployment.
- **Detail:** a `ws://` URL on an `https://` page is blocked as mixed content.
  The runtime origin-derivation in D1 handles this.

### D3. Persistence paths default to the container CWD

- **Status:** leaderboards, achievements, snapshots and the event log are lost on
  restart unless paths are set.
- **Detail:** `store.ts` defaults resolve against the process CWD. In a container
  these land on the ephemeral layer. Note the *durability* half of this is now
  fixed — writes are atomic and torn reads fail loudly (PR #32/#33) — but the
  default location is still wrong for a deployment.
- **Fix:** mount a volume and point the `*_PATH` env vars at it, or use Postgres.

### D4. No horizontal scaling path

- **Status:** must run as exactly one replica.
- **Detail:** rooms, seats, presence and the per-IP rate bucket are all in
  process memory (`rooms.ts`, `gateway.ts`). WebSocket sessions are sticky to one
  process with no shared backplane.
- **Fix:** document the single-replica constraint, or add sticky sessions plus
  shared state before scaling.

### D5. No CI, and no Kubernetes / Compose / Helm config

- **Status:** there is no `.github/`, no pipeline, and no orchestration config.
- **Detail:** nothing runs `npm run check` or `npm run test:e2e` on a push. This
  is why V1 and V3 went unnoticed.
- **Fix:** add a CI workflow running typecheck, unit tests, and e2e. That single
  step would have caught most of what is in this file.

### D7. `OutcomeStore` rewrites the whole file on every finished game

- **Status:** correctness fixed, performance not.
- **Detail:** writes are now atomic (`atomicWriteJson`, temp + fsync + rename)
  and a torn read throws rather than silently returning `[]` (PR #33). But
  `record` still serialises the entire in-memory history per game, so cost stays
  O(total games) and the array never shrinks.
- **Fix:** append JSONL, or move outcomes to Postgres and aggregate in SQL.

### D9. No documented env-var contract

- **Detail:** the server reads `PORT`, `STATIC_DIR`, `NODE_ENV`,
  `OUTCOMES_PATH`, `ACHIEVEMENTS_PATH`, `SNAPSHOTS_PATH`, `EVENTS_PATH`,
  `RATE_LIMIT_CAPACITY` and now `DATABASE_URL`. The client reads
  `VITE_GATEWAY_URL` at **build** time. No file lists them together.
- **Fix:** add `.env.example` and a table marking which are build-time.

### D10. `bin/dev-server.js` is the production entrypoint

- **Detail:** `Dockerfile` runs it; the name says otherwise.
- **Fix:** rename to `bin/server.js` and update `Dockerfile`, `package.json` and
  `playwright.config.js`.

### D11. Container runs as root with no healthcheck

- **Detail:** no `USER`, no `HEALTHCHECK`. A `/healthz` endpoint now exists
  (PR #27) and is side-effect-free, so a healthcheck has something to point at.
- **Fix:** add `USER node`, `chown` the state mount, and a `HEALTHCHECK`
  against `/healthz`.

### D12. Up to 60s of in-flight game state is lost on a hard crash

- **Status:** narrowed, not closed.
- **Detail:** rooms snapshot on a 60s timer
  (`gateway.ts:37 SNAPSHOT_INTERVAL_MS`). A graceful restart loses nothing, and
  room reaping now flushes the event log before deleting the room and keeps the
  room if that flush fails (PR #38). A hard crash still loses everything since
  the last tick.
- **Fix:** also snapshot on a phase change, or lower the interval. Decide whether
  it matters before building for it.

---

## Deployment shape B — split frontend / backend / database

### B1. Wildcard CORS

- **Detail:** `handleHttp` sets `Access-Control-Allow-Origin: *` on every
  response. Harmless while same-origin; once the frontend is a separate origin,
  any site can read the leaderboard, history, head-to-head and `/stats` APIs.
- **Fix:** read `ALLOWED_ORIGIN` and echo only that. Also gate `/admin` and
  `/stats`, which are unauthenticated and expose room codes and player counts.

### B2. Gateway URL becomes build-time again in a split deploy

- **Detail:** follows from D1. Keep the `window.location` default and let
  `VITE_GATEWAY_URL` override it, so both shapes work from one code path.

### B4. Static frontend has no serving story

- **Detail:** in shape B the gateway must not serve `dist/`, so unknown paths
  return JSON 404s.
- **Fix:** publish `dist/` to a static host with an SPA-style fallback.

---

## User flow

### F1. Multiplayer games land on a lobby, not in a game

- **Status:** partially addressed. "Play now" is the dominant CTA and fills with
  bots, but a portal card still lands on the lobby rather than starting a
  bot-filled game directly.
- **Fix:** make the card click go straight to quick-match.

### F4. "Leave" is only wired into the mahjong board

- **Detail:** `useGameSocket` exposes `leaveRoom`, and PR #31 added a Leave
  control to `games/mahjong`. Poker, president, reversi and sheng-ji still have
  no way to leave a room from the board.
- **Fix:** add the same control to the other four boards.

---

## Correctness / robustness

### C1. Per-IP rate-limit map leaks

- **Detail:** `gateway.ts:114` creates `rateLimitMap` and entries are never
  evicted, so it grows for the process lifetime.
- **Fix:** evict stale IP buckets on the heartbeat.

### C2. `infra.spec` version-mismatch banner test fails on baseline

- **Status:** pre-existing, not a product bug.
- **Detail:** the product path is correct — the gateway sends `protocolVersion`
  in `hello` and the client shows a refresh banner on mismatch. The test tries to
  force a mismatch with `page.routeWebSocket(...)`, and the rewritten frame never
  reaches the client.
- **Fix:** repair the interception, or add a server-side test hook for the
  advertised `protocolVersion`.

### C3. The e2e suite is not hermetic

- **Status:** mitigated, not closed.
- **Detail:** persistence points at a throwaway `.state/e2e` dir and the rate
  limit is widened for tests, but one long-lived gateway process is shared across
  spec files, so rooms and held seats accumulate.
- **Fix:** a fresh gateway per spec file, or a test-only reset endpoint.

---

## From the mahjong build

### M1. Tai values and severity thresholds are uncalibrated

- **Detail:** the 13-pattern catalogue in
  `packages/engines/mahjong-analysis/src/analysis/ruleset.ts` and the mistake
  thresholds in `packages/shared/src/severity.ts:8`
  (`{minor: 1, moderate: 20, severe: 1000}`) are defensible starting values, not
  a calibrated Taiwanese table. Tai values vary by table.
- **Fix:** play real hands, compare against a reference table, and tune. Keep the
  values in the ruleset object so tuning stays configuration.

### M2. Settlement scale is a starting point

- **Detail:** a 2 tai discard win pays winner +4 / discarder −4, and a self-draw
  splits across all three losers. Transfers sum to zero at every tai value
  tested. The *scale* has not been checked against a real table.
- **Fix:** confirm against the intended house rules; the rule is injectable via
  `state.rules.settlement`.

### M3. The end-of-hand reveal is a new trust boundary

- **Detail:** `mahjongReveal` exposes every player's hand once the hand is over,
  gated on `game && phase === 'FINISHED' && outcome`. Verified: mid-hand it is
  null for every seat and no opponent tile appears in any view.
- **Fix:** keep it that way. Any future change to `publicState` or to the reveal
  gate should re-run that check, since this is the one place concealed tiles can
  reach a client.

### M4. Multi-hand rotation is only unit-tested

- **Detail:** dealer rotation, prevailing-wind advance on a completed circuit,
  and carrying scores across hands are covered by unit tests, but no full
  multi-hand game has been played end to end in a browser.
- **Fix:** covered once V1 runs, if a spec plays two consecutive hands.

### M5. The Standard AI is ~96× slower than the random AI

- **Detail:** about 632 ms per game, roughly 3.7 ms per decision. Fine for
  interactive play; it makes a 10,000-game sweep take ~105 minutes versus ~63
  seconds. The `runSimulation` acceptance gate should keep using the random AI.
- **Fix:** none needed unless large Standard-AI sweeps become routine.
