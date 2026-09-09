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

## Adapter (packages/game-core/src/games.ts)

### Brief
Wire the mahjong adapter to the new engine capability. Seed and carry player
scores. Drive the next hand through the restart message. Surface per-seat deltas
and resulting scores through getOutcome. Add a reveal projection field that is
null during play and shows every final hand once the outcome is FINISHED.

### Changes
- `mahjongNextHand` (new): drive the engine NEXT_HAND action. The engine carries
  scores and the single event log forward.
- `mahjongOnMessage`: on a restart message, drive the next hand when the current
  hand is FINISHED. Else deal a fresh hand as before. This preserves scores and
  the event log across hands.
- `mahjongGetOutcome`: surface each seat's delta and resulting score. The score
  field becomes the carried score. The meta object carries delta, totalTai,
  dealtInSeat and selfDraw.
- `mahjongPublicState`: add a `reveal` field. It is null during play. It exposes
  every seat's final hand, melds and flowers once the outcome is FINISHED. Add a
  public `scores` array. The per-seat opponent projection is unchanged.

### Tests (packages/game-core/src/games.test.ts)
- Unit: reveal is null mid-hand; reveal exposes all hands when FINISHED;
  getOutcome surfaces delta and resulting score; getOutcome is null while playing.
- QA multi-hand: a real deterministic playthrough runs two hands end to end.
  Reveal is null mid-hand and populated at FINISHED. Scores carry. The event log
  spans hands. A replay reproduces the same final scores.
- QA settlement/rotation: a crafted non-dealer win rotates the dealer, carries
  scores, surfaces deltas, and reveals all hands.
