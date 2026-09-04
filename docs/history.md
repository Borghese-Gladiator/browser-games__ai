# Planning history

Superseded planning notes, kept for context. Current plan lives in `plan.md` at
the repo root; known remaining work in `docs/TODO.md`.

---

## Plan: Framework + Lobby for browser-games

### Brief
Scale the repo from 3 games to ~13 by removing two structural bottlenecks:
1. Each multiplayer game shipped a near-identical copy-pasted WS server on its own port.
2. There was one global game per server process — no rooms, no lobby, no concurrent games.

Target: a single **gateway** WS server that hosts every game, routed by `gameId`,
with a shared **room-aware** core and a built-in **lobby** (create / list / join
rooms by code). Each game contributes only a pure engine + a tiny adapter.

### Architecture (delivered)
```
packages/
  shared/                  # registry (source of truth) + theme
  game-core/               # generic room-aware server + lobby + gateway
    src/
      rooms.js             # Room + RoomManager (per-room engine state, seats, clients)
      gateway.js           # single WS server, routes by gameId, dispatches lobby vs game msgs
      games.js             # adapter registry: gameId -> { engine, adapter }
  engines/                 # pure engines (poker, sheng-ji, reversi)
  game-client/             # shared React client (useGameSocket, Lobby)
games/
  poker/  sheng-ji/  reversi/  # thin UI; use game-client + lobby
  tic-tac-toe/                 # local game, no server
  fps/                         # local game, no server
bin/dev-server.js          # boots the single gateway
```

### The adapter contract
Each multiplayer game registers an adapter so the generic gateway can drive it:
```js
{
  id: 'poker',
  engine,                              // the pure module
  minPlayers, maxPlayers,
  autoStart(state) -> state|null,      // called after each join; null = not ready
  onMessage(state, playerId, msg) -> state,
}
```

---

## Plan: Deploy-readiness polish pass

1. Declared `@browser-games/engine-reversi` in game-core deps.
2. Added `/public/favicon.svg`.
3. Added favicon/meta links to all six `index.html` files.
4. Added MIT LICENSE.
5. Added `/public/404.html`.

---

## Plan: Single-deployment Docker (gateway serves the built client)

Ship as one Node container that serves the static `dist/` client and runs the
WebSocket gateway on the same port — removes the cross-origin `VITE_GATEWAY_URL`
problem (browser connects back to the same host it loaded from).

1. `gateway.js` — optional `staticDir`; HTTP handler serves `dist/` after the
   `/admin`, `/stats`, `/api/*` routes (index + 404.html fallback, traversal guard).
2. `bin/dev-server.js` — pass `staticDir` only in production or when `STATIC_DIR` set.
3. `Dockerfile` — multi-stage: build `dist/`, run gateway with prod deps only.
