# Plan: point settlement and multi-hand play (mahjong engine)

## Brief
Add persistent per-seat scores, a zero-sum settlement rule, a richer end-of-hand
outcome, and a NEXT_HAND action/event that starts the next hand. Keep one event
log across hands. Do not change `dealerRepeatsOnWin` or `dealerContinues`.

## Changes
- `scoring/settlement.ts` (new): `settle`, `taiwaneseSettlement`, `SeatDeltas`,
  `SettlementContext`, `SettlementRule`. Discarder pays the full amount on a
  discard win. All three losers pay on a self-draw. Nobody pays on a draw.
  Deltas assert sum-to-zero. Amount = `totalTai * POINTS_PER_TAI` (2).
- `rules/taiwanese.ts`: add `startingScore` (default 500) and `settlement`.
- `game/state.ts`: add `score` to `PlayerState`. Add `SeatOutcome`. Extend
  `GameOutcome` with `dealtInSeat`, `winningTile`, `selfDraw`, `patterns`,
  `totalTai`, `seats`. Keep `kind`, `winner`, `dealerRepeats`.
- `game/outcome.ts` (new): `seatWindOf`, `seatWindsFor`, `scoreWinner`,
  `buildOutcome`. Reuse `scoreHand` for itemized patterns and total tai.
- `game/deal.ts`: seed `score` from `rules.startingScore`. Route
  `finishAsDraw` through `buildOutcome` (zero deltas).
- `game/claim.ts`: `finishWin` scores the winner, builds the outcome, applies
  deltas to scores. Remove dealer rotation and DEALER_CHANGED from `finishWin`.
- `game/turn.ts`: unchanged (`dealerContinues`, `advanceDealer` stay).
- `game/actions.ts`: add `NextHandAction` to the union.
- `game/events.ts`: add `deltas` to `HandWonEvent`. Add `NextHandEvent`.
- `game/nextHand.ts` (new): rotate dealer unless `dealerRepeats`, advance the
  prevailing wind on a full circuit, set seat winds, carry scores, deal a fresh
  hand, keep one event log. Also `replayScores` helper.
- `game/validate.ts`: allow NEXT_HAND only after a finished hand.
- `game/reducer.ts`: dispatch NEXT_HAND to `nextHand`.
- `game/index.ts`, `src/index.ts`: export new modules.

## Tests
### Unit (vitest, scoped to packages/engines/mahjong)
- `scoring/settlement.test.ts`: sum-to-zero for discard win, self-draw, draw;
  2 tai discard win yields winner +4, discarder -4, others 0.
- `game/claim.test.ts`: discard-win outcome carries dealtInSeat, winningTile,
  patterns, deltas. Update outcome assertions to `toMatchObject`. Add `score`.
- `game/reducer.test.ts`: dealer rotation on NEXT_HAND, wind advance on a full
  circuit, score carry across hands, event-log replay reproduces final scores.
  Update outcome assertions and PlayerState literals.
- Add `score` to PlayerState literals in other test files that build one.

### Manual
- `npx vitest run packages/engines/mahjong` (all green).
- `npx tsc --noEmit` at repo root (typecheck).
