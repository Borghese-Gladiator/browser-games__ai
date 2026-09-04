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
- **Partially done:** the lobby was redesigned so **Play now** is the single
  dominant CTA (bots fill empty seats), with Create/Join demoted (see F5).
  Still lobby-first: the portal card lands on the lobby rather than skipping
  straight into a bot-filled game. Full instant-play (card → game) is the
  remaining step if desired.

### F2. Lobby room list is stale — never pushed — ✅ FIXED

- **Status:** Resolved. Lobby watchers now get live pushes.
- **Fix (done):** The gateway tracks lobby watchers per `gameId` (registered on
  `lobby:list`) and pushes a fresh `rooms` frame to all of them on any
  membership change (create/join/leave/kick/lock) via an `onLobbyChange` hook
  (`gateway.js`). Required the client send-before-open fix (robustness #2) so the
  initial `lobby:list` actually registers the watcher. Verified in-browser:
  a room created in one tab appears in another's list with no Refresh.

### F3. Selected name is not remembered — ✅ FIXED

- **Status:** Resolved.
- **Fix (done):** `useIdentity` now persists the last-used display name in
  localStorage (`browser-games:playerName`) via a `setName` setter; `Lobby.jsx`
  reads/writes it, so the name prefills on every mount. Verified in-browser.

### F4. No user-initiated "leave room" — ✅ FIXED (protocol + client)

- **Status:** Protocol + client action done. A "Leave" button still needs
  wiring into each game's in-room UI (the hook exposes `leaveRoom`).
- **Fix (done):** Added `lobby:leave` to the protocol — unlike a socket close
  (which holds the seat for the reconnect grace window), it frees the seat
  immediately, deletes the room if it was the last member, acks with `left`, and
  re-sends the fresh room list. The client `useGameSocket` exposes `leaveRoom()`
  and clears local room state on `left` (dropping the rejoin intent so a later
  reconnect doesn't pull the player back in). Name is preserved via F3.
- **Remaining:** each game's board should render a "Leave / back to lobby"
  button calling `leaveRoom`.

### F5. No single obvious primary action per page — ✅ FIXED (lobby)

- **Status:** Resolved for the lobby.
- **Fix (done):** `Lobby.jsx` + `lobby.css` rebuilt around one dominant CTA — a
  glowing **Play now** hero card — with "Private Table" (Create room /
  join-by-code) and the live "Public Tables" list demoted to quiet secondary
  cards, matching the "Find a Match" mockup. Accessible button names
  ("Create room", "Join by code", "Play now") were preserved so e2e specs pass.

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

## 2. Actions dropped during the reconnect window — ✅ FIXED

- **Status:** Resolved.
- **Fix (done):** `useGameSocket` now has an outbound queue (`outbox`): `rawSend`
  sends immediately when the socket is OPEN, otherwise buffers the frame
  (de-duped) and flushes on `open`, after the rejoin replay. This also fixed F2 —
  the lobby's initial `lobby:list` was itself a send-before-open casualty, so the
  watcher never registered until this landed.

## 3. E2E suite is not hermetic — cross-spec gateway-state contention — ⚠️ MITIGATED

- **Status:** Two of the three contention sources removed; the suite now passes
  9/9. One long-lived gateway is still shared, so this isn't fully closed.
- **Fixes (done):** (a) Persistence points at a throwaway `.state/e2e` dir wiped
  each run (`playwright.config.js` env + `test:e2e` script), so outcomes /
  achievements / snapshots start empty. (b) The per-IP rate-limit capacity is
  overridable via `RATE_LIMIT_CAPACITY` and the test webServer widens it, so the
  suite's combined load on the one shared bucket no longer trips false
  "rate limit exceeded" failures. (This mattered more after F2's live broadcasts
  raised per-connection message volume.)
- **Remaining:** rooms / held seats still accumulate in the one gateway process.
  A fresh gateway per spec file (or a test-only reset endpoint) would fully
  close it.

## 4. Runtime-cruft hygiene during tests — ✅ FIXED

- **Status:** Resolved.
- **Fix (done):** `bin/dev-server.js` reads `OUTCOMES_PATH` / `ACHIEVEMENTS_PATH`
  / `SNAPSHOTS_PATH` from env; the Playwright webServer points them at
  `.state/e2e/*`, and `npm run test:e2e` wipes that dir before each run, so every
  run starts from empty state. `snapshots/` was also added to `.gitignore` and a
  stray leftover `snapshots/` + botched `${QA_SPEC_DIR}` dir were removed from the
  tree. `npm run clean:state` wipes all runtime state on demand.

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
