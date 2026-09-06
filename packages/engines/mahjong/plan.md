# Plan: mahjong game state machine

## Brief
Add a pure, immutable game state machine to `packages/engines/mahjong/src/game`.
The machine covers the no-claims path: deal, draw, discard, self-draw win.
It reuses the tile model, hand solver, `RandomSource`, and `winningHandSize(rules)`.

## Key adaptation
The existing `RandomSource` is a mutable, non-serializable RNG. All randomness
is consumed once when `createGame` builds and shuffles the immutable wall.
After that, every draw reads the immutable `wall.tiles` array through
`drawIndex` (live front) and `replacementIndex` (dead tail). So `applyAction`
stays pure and deterministic without a live RNG in `GameState`.
The rules type is `TaiwaneseRules`; `concealedHandSize` is a rules field and
`winningHandSize(rules)` is the existing helper. Never hardcode 16/17.

## Changes
- + game/state.ts — GameState model, seat/wall/phase types, state helpers.
- + game/turn.ts — TurnState, initialTurn, nextTurn, dealerContinues.
- + game/actions.ts — GameAction discriminated union.
- + game/events.ts — GameEvent union, recordEvent/recordEvents.
- + game/errors.ts — GameError union and gameError constructor.
- + game/validate.ts — validateAction guard, requireTurn.
- + game/deal.ts — createGame, dealHand, buildWall, wall draws, flower replace.
- + game/reducer.ts — applyAction dispatch and per-action handlers.
- + game/index.ts — game barrel.
- ~ src/index.ts — re-export the game barrel.

## Tests
### Unit (game/__tests__/game.test.ts)
- createGame builds a full shuffled wall and DEALING phase.
- dealHand deals winning-size dealer hand, leaves dealer NEEDS_DISCARD.
- flower replacement moves flowers aside and draws replacements; terminates.
- validateAction returns typed errors: WRONG_TURN, WRONG_PHASE,
  TILE_NOT_IN_HAND, GAME_OVER.
- event seq numbers are strictly monotonic across actions.
- wall exhaustion produces a DRAW outcome and WALL_EXHAUSTED event.
- DECLARE_WIN accepts a winning hand and rejects a non-winning one.

### e2e (game/__tests__/scripted-hand.e2e.test.ts)
- Scenario mahjong-full-hand-e2e: play a scripted no-claims hand from deal to a
  terminal outcome; assert monotonic seq and a valid terminal state.

## Manual test (node script)
Run vitest scoped to the package; grep the sources for 16/17, Math.random,
comments, and confirm winningHandSize usage.
