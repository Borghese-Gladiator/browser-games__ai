# Plan: reveal an unreplaceable flower before an exhaustive draw

## Brief
When a drawn flower cannot get a replacement because the replacement wall is
empty, the engine ends the hand as an exhaustive draw. The flower stays in the
concealed hand. This breaks the invariant that a flower never stays in hand.
Reveal the flower first, then finish as a draw.

## Changes
- `src/game/deal.ts` `replaceFlowers`: in the empty-replacement branch, move the
  flower into the player `flowers` array, record the flower event, and return
  `exhausted: true` with the new state and event.
- `src/game/events.ts`: allow `FlowerReplacedEvent.replacement` to be `null` for
  the reveal case that has no replacement tile.
- `src/game/deal.test.ts`: update the direct "replacement supply is empty" test
  to assert the reveal (flower out of hand, in flowers, one event).
- `src/game/reducer.test.ts`: extend the wall-exhaustion regression test to run
  seeds seed-1, seed-13, seed-25, s2 to a terminal draw and assert no hand holds
  a flower. Keep the draw-outcome and hand-size assertions.

## Tests
### Unit
- `bin` vitest for the mahjong package.
### Manual
- None. Pure engine change.
