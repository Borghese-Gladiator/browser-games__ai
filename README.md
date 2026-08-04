# Browser Games

A small gaming portal: a landing page that lists games, with each game living in
its own page. Built as an npm-workspaces monorepo using Vite + React. Multiplayer
games share a single WebSocket gateway with a built-in lobby.
Note: There are currently 5 available games in the `games/` directory.

## Layout

```
.
├── index.html              # Portal entry (root page)
├── vite.config.js          # Multi-page build; inputs derived from the registry
├── package.json            # Workspaces root + scripts
├── bin/
│   └── dev-server.js       # Boots the multiplayer gateway (one process, all games)
├── packages/
│   ├── shared/             # @portal/shared — registry (source of truth) + theme
│   ├── game-core/          # @browser-games/game-core — gateway, rooms, lobby
│   │   └── src/
│   │       ├── gateway.js  # Single WS server; routes by gameId + room code
│   │       ├── rooms.js    # Room + RoomManager (per-room engine state, seats)
│   │       └── games.js    # Adapter registry: gameId -> engine + glue
│   ├── game-client/        # @browser-games/game-client — shared React client
│   │   └── src/
│   │       ├── useGameSocket.js  # Connect, lobby actions, send game messages
│   │       └── Lobby.jsx         # Shared create/join-room UI
│   └── engines/            # Pure, transport-free game engines
│       ├── poker/          # @browser-games/engine-poker
│       └── sheng-ji/       # @browser-games/engine-sheng-ji
├── portal/                 # @portal/app — the landing page (React)
└── games/
    ├── tic-tac-toe/        # Local game (no server)
    ├── poker/              # Multiplayer — uses game-client + gateway
    └── sheng-ji/           # Multiplayer — uses game-client + gateway
```

## Install

```
npm install
```

## Run (dev)

Multiplayer games need the gateway running alongside the Vite dev server (two
terminals):

```
npm run server   # multiplayer gateway on :3001
npm run dev      # portal + games on :5173
```

Open the Vite URL for the portal; click a game card to navigate to it.
Tic-Tac-Toe is local and needs only `npm run dev`.

## Build / preview (prod)

```
npm run build
npm run preview
```

## Test

```
npm test           # unit tests (engines, rooms, gateway, pure logic)
npm run test:e2e   # Playwright; boots the gateway + Vite, plays full games
```

## Adding a game

The registry (`packages/shared/src/registry.js`) is the single source of truth —
the portal grid and the Vite multi-page `input` map both derive from it.

**Local game (no server):**

1. Create `games/<id>/` with `index.html` and `src/main.jsx` (use
   `games/tic-tac-toe/` as a template). Put pure game logic in a separate,
   unit-tested module.
2. Add an entry to the registry: `id`, `title`, `description`, `emoji`, `path`,
   `multiplayer: false`.

That's it — no `vite.config.js` edit needed.

**Multiplayer game:** do the two steps above with `multiplayer: true`, then:

3. Write a **pure engine** in `packages/engines/<id>/` exporting `createGame`,
   `addPlayer(state, {id, name})`, `publicState(state, seat)`, plus your own
   start and action functions. No sockets, no I/O — see the poker/sheng-ji
   engines.
4. Register an **adapter** in `packages/game-core/src/games.js`:

   ```js
   import * as myGame from '@browser-games/engine-my-game';

   myGame: {
     id: 'my-game',
     engine: myGame,
     minPlayers: 2,
     maxPlayers: 4,
     autoStart: (s) => (s.players.length === 4 ? myGame.start(s) : null),
     onMessage: (s, playerId, msg) => myGame.applyMove(s, playerId, msg.move),

     // Optional platform hooks (rooms/lobby/matchmaking layer):
     optionsSchema: { stakes: { type: 'enum', values: ['low', 'high'], default: 'low' } },
     activeSeat: (s) => s.activeSeat,            // whose turn it is, or -1
     timeoutAction: (s, seat) => ({ move: 'pass' }), // auto-action on turn timeout
     botMove: (s, seat) => ({ move: 'pass' }),       // fill-with-AI policy
   }
   ```

   `optionsSchema` declares a per-room options bag (variants/stakes/ruleset)
   validated by the framework and passed to `engine.createGame(options)`, so one
   engine exposes variants without a new package. `activeSeat` + `timeoutAction`
   let the single gateway heartbeat auto-skip/fold a seat whose player goes dark
   (a reconnect inside the grace window resumes normally); `botMove` lets a quiet
   room fill empty seats with bots and still be played.

5. In the game's React component, use the shared client — no bespoke WebSocket
   code:

   ```jsx
   const {
     rooms, room, gameState, error,
     createRoom, joinRoom, quickMatch, spectate,   // lobby + matchmaking
     kick, lockRoom, startEarly,                    // host controls
     send, restart,
   } = useGameSocket('my-game');
   ```

   Render `<Lobby>` (pass `onQuickMatch`/`onSpectate` for "Play now" and
   watch-only) until `room` is set, then your board. Send moves with
   `send({ move })`, matching the adapter's `onMessage`. `gameState.presence`
   carries per-seat live/bot/latency for presence dots; `gameState.isHost` gates
   host controls.

The gateway, rooms, lobby, per-seat state broadcast, **heartbeat** (one ping/pong
loop driving presence, latency, dead-socket reaping, empty-room GC, and
turn-timeout enforcement), **quick-match**, **spectators** (public state only),
**bots**, **host controls**, and **per-room options** are all provided by the
framework — you only supply the engine, the adapter, and the board UI.

Shared theme tokens live in `@portal/shared/theme.css`; the lobby styling is in
`@browser-games/game-client/lobby.css`. Import both from a multiplayer game's
entry to stay visually consistent.
