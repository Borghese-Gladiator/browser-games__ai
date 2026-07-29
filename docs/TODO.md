# TODO — Known remaining work

Each item below was verified against the code (file:line references), not
speculative.

## Deployment (blockers)

### D1. Client hardcodes `localhost:3001` for the gateway

- **Status:** Multiplayer + leaderboard are broken in any real deployment.
- **Detail:** `packages/game-client/src/useGameSocket.js:12` falls back to
  `ws://localhost:3001` and `packages/game-client/src/leaderboard.js:7-9` to
  `http://localhost:3001`. These are **build-time** Vite env vars, and the
  `Dockerfile` build (`Dockerfile:15`) runs `npm run build` without setting
  `VITE_GATEWAY_URL`, so the shipped client bakes in `localhost`. A deployed
  browser connects to the *user's own machine*, not the server, and fails.
- **Fix:** Derive the gateway URL from `window.location` at runtime
  (same-origin `wss://<host>` / `https://<host>`). The gateway already serves
  the client on one origin, so this needs no env var and also fixes D2.

### D2. `ws://` breaks under HTTPS

- **Status:** Blocks HTTPS deployment even if `VITE_GATEWAY_URL` is injected.
- **Detail:** A `ws://` URL on an `https://` page is blocked as mixed content;
  needs `wss://`. The runtime origin-derivation in D1 handles this.

### D3. Persistence is ephemeral and single-replica

- **Status:** Leaderboards, achievements, and room snapshots lost on restart.
- **Detail:** `packages/game-core/src/store.js:20,41,64` default to relative
  paths (`./outcomes.json`, `./achievements.json`, `./snapshots`) resolved
  against the container CWD (`/app`). `bin/dev-server.js:16-19` does not
  override them. In a container these live on the ephemeral writable layer —
  **lost on every restart/redeploy** — and are not shared across replicas.
- **Fix:** Mount a volume (PVC) or use an external store; parameterize the
  paths via env and point them at the mount.

### D4. No horizontal scaling path

- **Status:** Must run as exactly one replica.
- **Detail:** Rooms, seats, presence, and the per-IP rate-limit bucket are all
  in-process memory (`packages/game-core/src/rooms.js`, `gateway.js`).
  WebSocket sessions are sticky to one process with no shared backplane.
- **Fix:** Document the single-replica constraint, or add sticky sessions +
  shared state (e.g. Redis) before scaling.

### D5. No Kubernetes / Compose / Helm / CI config

- **Status:** Repo ships only a `Dockerfile` + `.dockerignore`.
- **Detail:** No `.github/`, `.buildkite/`, `*.yaml`/`*.yml`, `Chart.yaml`, or
  `docker-compose.yml` anywhere. "Do we handle kubernetes?" → no.
- **Fix:** Add k8s Deployment + Service + Ingress (or Compose), a readiness
  probe endpoint, resource limits, `PORT`/volume wiring, and
  `terminationGracePeriodSeconds` ≥ the 5s drain in `bin/dev-server.js:23`.

## User flow / lobby

### F1. Multiplayer games dump you into a lobby, not the game

- **Status:** Core friction — unlike FPS/tic-tac-toe which load straight into
  play.
- **Detail:** Portal cards are plain `<a href={game.path}>`
  (`portal/src/Portal.jsx:13`). FPS boots gameplay on page load
  (`games/fps/src/main.ts:11-22`, no socket/identity/room). Multiplayer games
  render `<Lobby>` first (`games/poker/src/Poker.jsx:36-52`) — name entry +
  room create/join gate every session.
- **Fix:** Make the primary action instant — card click → auto "Play now"
  (quick-match, fills with bots), with create/join-specific-room demoted to
  secondary.

### F2. Lobby room list is stale — never pushed

- **Status:** The "lobby not showing an up-to-date list of people" complaint.
- **Detail:** The `{ t: 'rooms' }` frame is sent **only** in reply to an
  explicit `lobby:list` request (`gateway.js:214-217`) — a pull model with one
  recipient. `joinRoom`, host actions, `game`, and `leave` all call
  `broadcastRoom(room)` (state to that room's members only), **never** a
  `rooms` re-broadcast to other lobby watchers. Client only updates on mount
  (`Lobby.jsx:14-16`) or the manual "Refresh" button (`Lobby.jsx:81`).
- **Fix:** Broadcast an updated `rooms` frame to all lobby watchers of a game
  on any room membership change (create/join/leave/lock).

### F3. Selected name is not remembered

- **Status:** User must retype their name on every leave/rejoin or reload.
- **Detail:** `Lobby.jsx:9` inits `name` to `""` every mount. `useIdentity.js`
  persists only the `playerId` UUID and color (`useIdentity.js:9,13,16`) —
  never the display name. No other `localStorage` name usage exists.
- **Fix:** Persist the last-used name in localStorage and prefill the input.

### F4. No user-initiated "leave room"

- **Status:** Rejoin loop is not smoothed.
- **Detail:** No `leaveRoom` action client-side and no `lobby:leave` in the
  protocol (`useGameSocket.js:178-198`, `gateway.js:5-16`). Leaving only
  happens on socket `close`/`error` (`gateway.js:531-532`), which for a seated
  player holds the seat (`gateway.js:630`) and only reaps it after `DEAD_MS`
  (15s). The only way back to the lobby is navigating away / reloading.
- **Fix:** Add an explicit "Leave / back to lobby" action that frees the seat
  and returns to the lobby, preserving the name (F3).

### F5. No single obvious primary action per page

- **Status:** Violates the "always an obvious primary action" goal.
- **Detail:** The lobby gives "Create room", "Play now", "Join by code", the
  room list, and "Player code" roughly equal visual weight (`Lobby.jsx`).
- **Fix:** Pick one dominant CTA (Play now) per page; demote the rest.

## Correctness / robustness

### C1. Per-IP rate-limit map leaks

- **Status:** Unbounded memory growth over the process lifetime.
- **Detail:** `gateway.js:383` — `rateLimitMap` entries are never GC'd.
- **Fix:** Evict stale IP buckets on the heartbeat.

---

## Session notes (multiplayer "not in a room" seating bug, commit `318a3ca`)

The items below were observed during that session.

## 1. infra.spec AC2 — version-mismatch refresh banner (pre-existing failure)

- **Status:** Fails on baseline *and* with the seating fix. Not a product bug.
- **Detail:** The product path is correct — the gateway sends a `hello` frame
  with `protocolVersion`; the client sets `needsRefresh` when it differs from
  `PROTOCOL_VERSION`, and `RefreshBanner` renders "Server updated — please
  refresh to continue." The test (`e2e/infra.spec.js:74`) tries to force a
  mismatch by intercepting the socket with `page.routeWebSocket(...)` and
  `ws.connectToServer()` to rewrite the `hello` frame to `99.99.99`, but the
  rewritten frame never reaches the client, so the banner never appears.
- **Fix options:** Repair the Playwright WS-routing interception, or inject a
  version mismatch a different way (e.g. a server-side test hook / env override
  for the advertised `protocolVersion`).

## 2. Actions dropped during the reconnect window (latent client gap)

- **Status:** Latent robustness issue; not currently failing a kept test.
- **Detail:** The fix re-joins the room on socket `open`, but a `game` message
  fired *during* the brief reconnect/StrictMode socket churn is sent on a
  transient socket and silently lost (`rawSend` = `ws.current?.send(...)`).
  The 4-player e2e specs survive because they retry actions in a loop; the
  single-shot observability action exposed the loss until the room-code parsing
  bug (item below) was also fixed. A real user clicking once during a network
  blip could still lose that action.
- **Fix:** Small outbound message queue in `useGameSocket` that buffers sends
  while the socket isn't OPEN and flushes on `open` (after the rejoin replay).

## 3. E2E suite is not hermetic — cross-spec gateway-state contention

- **Status:** Each spec passes in clean isolation; the full suite (parallel or
  serial) fails on later specs.
- **Detail:** All specs run against one long-lived gateway (`playwright.config.js`
  starts it once). Rooms, held seats, the shared per-IP rate-limit bucket, and
  the outcome store accumulate across specs, causing seating/lobby contention
  and stale leaderboard reads by the time later specs run.
- **Fix:** Make the suite hermetic — fresh gateway per spec file, or a reset
  endpoint/teardown the gateway exposes for tests.

## 4. Runtime-cruft hygiene during tests

- **Status:** Test-environment papercut that silently skewed results.
- **Detail:** `outcomes.json` / `achievements.json` (gitignored) and the
  `snapshots/` dir accumulate across runs. Stale `outcomes.json` made the
  leaderboard spec fail ("winner missing from all-time board"); restored
  `snapshots/` rooms inflate `/stats`. Both are regenerated at runtime.
- **Fix:** Clear these in a test setup/teardown hook so runs start from a clean
  store. (The gateway already restores `snapshots/` on boot by design — tests
  just need an empty starting state.)

---

## Done this session (for reference)

- **Client rejoin on reconnect** (`packages/game-client/src/useGameSocket.js`):
  record a join intent, replay it on socket `open`, and ignore closes from a
  superseded socket so the StrictMode mount/cleanup/mount cycle doesn't spawn an
  orphan connection. Fixes the repeated "not in a room" rejection.
- **Idempotent auto-start** (`packages/game-core/src/rooms.js`): `_maybeAutoStart`
  no longer re-runs once the game has started, so `startEarly` ("Start with
  bots") can't throw "hand in progress" and abort the `host:start` broadcast.
- **E2E room-code parsing**: strip the `RoomCode` "Copy" button text in poker,
  sheng-ji, leaderboard, and observability specs (observability used the raw
  code in a `/stats` lookup that silently missed).
- **chrome.spec reconnect assertion**: close the live socket directly instead of
  relying on `context.setOffline`, which does not sever an already-open loopback
  WebSocket.

Verified: 224 unit tests pass; poker, sheng-ji, chrome, identity, leaderboard,
and observability each pass in clean isolation.
