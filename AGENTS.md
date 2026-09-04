# AGENTS.md

Orientation for AI agents (and humans) working in this repo. Read this first.

## What this is

An npm-workspaces monorepo hosting a browser-games portal. One landing page lists
games; each game is its own Vite page. Multiplayer games share **one** WebSocket
gateway process with a built-in lobby, rooms, matchmaking, bots, and presence.
Local games (tic-tac-toe, FPS) run entirely client-side with no server.

## Golden rules

1. **The registry is the single source of truth.** `packages/shared/src/registry.js`
   drives the portal grid, the Vite multi-page build, and gateway routing. Never
   hand-edit `vite.config.js` to add a page — add a registry entry.
2. **Engines are pure.** Code in `packages/engines/*` has no sockets and no I/O —
   just game state in, new state out. All transport lives in `game-core`.
3. **One gateway, many games.** `packages/game-core` is generic. A game plugs in
   via an *adapter* (`game-core/src/games.js`); the gateway never knows game rules.
4. **Don't commit runtime state.** `snapshots/`, `outcomes.json`, `achievements.json`,
   and `.state/` are generated at runtime and gitignored. `npm run clean:state`
   wipes them.
5. **No code comments unless asked** (see the surrounding code's low comment density).

## Where things live

| Path | Responsibility |
|---|---|
| `packages/shared/src/registry.js` | Game list — source of truth. |
| `packages/shared/src/` | Cross-cutting pure helpers: validate, sanitize, rateLimit, leaderboard, identity, metrics, theme. |
| `packages/game-core/src/gateway.js` | The single WS + HTTP server. Routes by `gameId` + room code; serves `dist/` in prod. |
| `packages/game-core/src/rooms.js` | `Room` + `RoomManager` — per-room engine state, seats, membership. |
| `packages/game-core/src/games.js` | Adapter registry: `gameId -> { engine, hooks }`. |
| `packages/game-core/src/store.js` | File-backed persistence (outcomes, achievements, room snapshots). |
| `packages/game-core/src/{matchmaking,bots,timers,observability}.js` | Platform features. |
| `packages/engines/<id>/src/engine.js` | Pure game logic + its unit tests. |
| `packages/game-client/src/useGameSocket.js` | Client hook: connect, lobby actions, send moves, reconnect. |
| `packages/game-client/src/Lobby.jsx` | Shared create/join/quick-match UI. |
| `games/<id>/` | Per-game page (`index.html` + `src/`). Thin UI. |
| `portal/src/Portal.jsx` | The landing page. |
| `bin/dev-server.js` | Boots the gateway. Reads `PORT`, `STATIC_DIR`, `*_PATH` state env vars. |

## How to validate a change

- **Fast loop:** `npm run check` (Vitest, ~250 tests, ~2s). Run this after any
  logic change. Engine/adapter/gateway/shared code all has unit coverage.
- **Full loop:** `npm run check:all` — also runs Playwright, which boots the
  gateway + Vite and plays full multiplayer games across several browser contexts
  (`e2e/*.spec.js`). E2E starts from clean state (`.state/e2e`), wiped each run.
- **By hand:** `npm run dev`, open the Vite URL, exercise the game.

Tests live next to the code they cover (`*.test.js` / `*.test.jsx`).

## Adding a game

See **[docs/adding-a-game.md](docs/adding-a-game.md)**. Short version: registry
entry (+ for multiplayer, a pure engine in `packages/engines/` and an adapter in
`game-core/src/games.js`). The gateway, lobby, matchmaking, bots, presence, and
per-room options are all provided — you write the engine, the adapter, the board.

## Protocol cheat-sheet (client ↔ gateway)

Messages are JSON frames with a `t` (type) tag. Client → server lobby frames:
`lobby:list`, `lobby:create`, `lobby:join`, `lobby:quickmatch` ("Play now",
fills with bots), `lobby:spectate`, `lobby:leave` (free the seat, back to
lobby). In-room: `{ t: 'game', ... }` routed to the adapter's `onMessage`; host
controls `host:kick` / `host:lock` / `host:start`; `restart` for a new
hand/deal; `pong` replies to the heartbeat. Server → client: `hello` (carries
`protocolVersion` — a mismatch triggers the client refresh banner), `rooms`
(lobby list, **pushed live** to lobby watchers on any membership change, not just
on request), `joined` (`seat: -1` = spectator), `left` (ack of `lobby:leave`),
`state` (per-seat `publicState` + `presence` + `isHost`), `ping`, `error`.

The client hook (`useGameSocket`) buffers outbound frames while the socket isn't
OPEN and flushes them on connect, so a send that races the connection isn't lost.

The authoritative list is the comment header of `packages/game-core/src/gateway.js`.

## Known gaps

`docs/TODO.md` lists remaining work, each item verified against a `file:line`
reference (deployment blockers, lobby friction, robustness). Consult it before
assuming something is broken by accident vs. known.
