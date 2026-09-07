# Plan: mahjong adapter

## Brief
Add the `mahjong` adapter to `packages/game-core/src/games.ts`, wired to
`@browser-games/engine-mahjong`. Add the portal registry entry. Write adapter
unit tests beside the code.

## Changes
- `packages/game-core/package.json`: add `@browser-games/engine-mahjong` dep.
- `packages/game-core/src/games.ts`:
  - Import the engine namespace and its types.
  - Add a `MahjongState` wrapper: `players` (seats), `rules`, `seed`, `game`
    (engine `GameState` or null), `phase`.
  - Add a `GameEngine` object: `createGame` (rules from options), `addPlayer`,
    `removePlayer`, `publicState`.
  - Add helpers: `resolveWireTile`, `resolveWireTiles`, `mahjongActiveSeat`,
    `mahjongPendingSeats`, `mahjongResolveWindow`, `mahjongBotMove`,
    `mahjongTimeout`, `mahjongOnMessage`, `mahjongAnticheat`, `mahjongDeal`,
    `mahjongGetOutcome`, `mahjongPublicState`, `mahjongOptionsSchema`.
  - `activeSeat` returns -1 while a claim window is open.
  - `pendingSeats` returns the open claimers, empty when no window.
  - `resolveWindow` closes an expired window by engine precedence
    (`resolveClaimWindow`), not by replaying timeouts.
  - `botMove` uses `createStandardAi`.
  - `timeoutAction` passes an open claim or discards the drawn tile.
  - `onMessage` resolves wire tile ids against the actual hand and throws on a
    malformed or non-owned id.
  - `optionsSchema` derives from `DEFAULT_TAIWANESE_RULES`.
  - Register `mahjong` in the adapters map. Export the adapter and the type.
- `packages/shared/src/registry.ts`: add the `mahjong` entry
  (multiplayer: true, enabled: true).

## Tests
### Unit (`packages/game-core/src/games.test.ts`)
- `publicState` hides opponent hands (only counts/melds/flowers/discards).
- `pendingSeats` during a claim window and outside a window.
- `resolveWindow` closes a window by precedence (pong beats chow).
- `onMessage` rejects a malformed and a non-owned tile id.

### Manual
- Run `npm run test` scoped to game-core.
- Run `npm run build` / typecheck the changed packages.
