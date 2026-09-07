# Plan: mahjong browser page

## Brief
Build the browser page at `games/mahjong/` on the `games/sheng-ji` template.
Render the player hand, the player discard area, three opponent areas, a centre
table with wall count and last discard, and an action bar. The action bar and
tile enablement come only from the engine `availableActions`; React never
re-derives legality. Tile selection is by click. Add a Playwright spec that
starts a game, makes a legal discard, completes a turn, and resolves one claim
window.

## Changes
- `packages/engines/mahjong/src/**`: rewrite the internal import specifiers from
  `.js` to `.ts` (270 across 50 files). The gateway runs `.ts` directly through
  Node type-stripping, which needs the specifier to match the real file, like
  the poker engine (`./handEval.ts`). Without this the server fails to boot the
  mahjong adapter (`ERR_MODULE_NOT_FOUND` on `./random/rng.js`). Content is
  otherwise unchanged.
- `packages/game-core/src/games.ts`: add `myDiscards` (the requesting seat own
  discards) to `mahjongPublicState`, so the page can render the player discard
  area. This reveals only the seat own discards; opponent hiding is unchanged.
- `games/mahjong/src/Mahjong.tsx`: rewrite the table page.
  - Components: `TileButton`, `OpponentArea`, `ActionBar`, plus helpers
    `statusText`, `tileLabel`, `tileShort`.
  - Partition `availableActions` into per-tile discard actions and the rest.
  - The hand renders one clickable `TileButton` per tile. A tile is enabled only
    when the engine offers a discard action for it. A click sends that discard.
  - `ActionBar` renders every non-discard engine action (draw, pass, chow, pong,
    kong, win) verbatim.
  - Layout: three opponent areas across the top, a centre table (wall + last
    discard) below, then the player discard area, the hand, and the action bar.
- `games/mahjong/src/mahjong.css`: table grid, opponent areas, discard rows,
  hand, and action bar layout. Reuse the theme tokens (`--cell`, `--line`,
  `--accent`, `--muted`).
- `e2e/mahjong.spec.js`: Playwright spec. Four browser contexts join one room,
  the server auto-starts the hand, and a driver clicks Draw, a discard tile, or
  Pass each tick until a result. The spec asserts a legal discard advanced a
  turn and that at least one claim window opened and resolved.

## Note on AI seats
The gateway starts a 4-seat game only when four members are seated
(`autoStart` at 4) and `startEarly` needs `minPlayers` real members first, so a
solo human cannot start against three bots (the same limit applies to sheng-ji
and president). The spec therefore seats four browser clients, which is the
proven multiplayer e2e pattern. Idle seats are still driven by the adapter
`botMove`/`timeoutAction`, so the play is engine-legal.

## Tests
### Manual
- `npm run dev`, open `http://localhost:5173/games/mahjong/`, create a room,
  seat four clients, confirm the hand renders and a discard completes a turn.

### E2E
- `npx playwright test e2e/mahjong.spec.js`

### Unit
- `npm run check` (adapter + engine unit tests still pass after the
  `myDiscards` field addition).
