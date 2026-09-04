# Adding a game

The registry (`packages/shared/src/registry.js`) is the single source of truth —
the portal grid and the Vite multi-page `input` map both derive from it. You never
edit `vite.config.js`.

## Local game (no server)

1. Create `games/<id>/` with `index.html` and `src/main.jsx` (use
   `games/tic-tac-toe/` as a template). Put pure game logic in a separate,
   unit-tested module.
2. Add an entry to the registry: `id`, `title`, `description`, `emoji`, `path`,
   `multiplayer: false`, `enabled: true`.

That's it.

## Multiplayer game

Do the two steps above with `multiplayer: true`, then:

### 3. Write a pure engine

In `packages/engines/<id>/`, export `createGame`, `addPlayer(state, {id, name})`,
`publicState(state, seat)`, plus your own start and action functions. No sockets,
no I/O — see the poker / sheng-ji / reversi engines.

### 4. Register an adapter

In `packages/game-core/src/games.js`:

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
  activeSeat: (s) => s.activeSeat,                // whose turn it is, or -1
  timeoutAction: (s, seat) => ({ move: 'pass' }), // auto-action on turn timeout
  botMove: (s, seat) => ({ move: 'pass' }),       // fill-with-AI policy
}
```

- **`optionsSchema`** declares a per-room options bag (variants / stakes /
  ruleset), validated by the framework and passed to `engine.createGame(options)`,
  so one engine exposes variants without a new package.
- **`activeSeat` + `timeoutAction`** let the single gateway heartbeat auto-skip /
  fold a seat whose player goes dark (a reconnect inside the grace window resumes
  normally).
- **`botMove`** lets a quiet room fill empty seats with bots and still be played.

### 5. Use the shared client in the game's React component

No bespoke WebSocket code:

```jsx
const {
  rooms, room, gameState, error,
  createRoom, joinRoom, quickMatch, spectate,   // lobby + matchmaking
  kick, lockRoom, startEarly,                    // host controls
  send, restart,
} = useGameSocket('my-game');
```

Render `<Lobby>` (pass `onQuickMatch` / `onSpectate` for "Play now" and
watch-only) until `room` is set, then your board. Send moves with `send({ move })`,
matching the adapter's `onMessage`. `gameState.presence` carries per-seat
live / bot / latency for presence dots; `gameState.isHost` gates host controls.

## What the framework gives you for free

The gateway, rooms, lobby, per-seat state broadcast, **heartbeat** (one ping/pong
loop driving presence, latency, dead-socket reaping, empty-room GC, and
turn-timeout enforcement), **quick-match**, **spectators** (public state only),
**bots**, **host controls**, and **per-room options** are all provided. You supply
only the engine, the adapter, and the board UI.

Shared theme tokens live in `@portal/shared/theme.css`; the lobby styling is in
`@browser-games/game-client/lobby.css`. Import both from a multiplayer game's entry
to stay visually consistent.
