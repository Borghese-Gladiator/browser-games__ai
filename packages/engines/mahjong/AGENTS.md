# Mahjong engine

A pure, event-sourced Taiwanese mahjong engine. `applyAction(state, action)` returns
an `ApplyResult` with the next `GameState` and the new events. The engine never mutates
state.

## Claim mechanics

After a `DISCARD`, the engine opens a claim window instead of advancing the turn at once.

- `openClaimWindow(state, discard)` computes the eligible seats with `eligibleClaims`. If
  no seat is eligible, it advances play to the next player. If at least one seat is
  eligible, it stores a `ClaimWindow` in `state.pendingClaim` and sets the turn phase to
  `CLAIM_RESOLUTION`.
- A `ClaimWindow` records the discard, the eligible seats and their claim kinds, the
  declarations so far, and the seats that are still outstanding (`pending`).
- Each eligible seat responds with `CLAIM_CHOW`, `CLAIM_PONG`, `CLAIM_KONG`,
  `DECLARE_WIN`, or `PASS_CLAIM`. When no seat remains outstanding, the engine resolves
  the window.

### Precedence

`rules/claims.ts` holds the precedence in one place through `resolveClaims`.

- `WIN` beats `KONG`/`PONG`; `KONG`/`PONG` beat `CHOW`.
- A `CHOW` is valid only for the seat to the left of the discarder (`isChowSeat`).
- A `PONG` or `KONG` is valid for any seat.
- Ties resolve deterministically to the seat nearest to the discarder in play order.

### Kong replacement

`CLAIM_KONG` supports an exposed kong from the discard and a concealed kong from the hand
on the seat's own turn. Both draw a replacement tile through `drawKongReplacement`, which
routes through the existing flower-replacement and wall-exhaustion path. A kong at wall
exhaustion ends the hand as an exhaustive draw.

### Dealer continuation

`DECLARE_WIN` finishes the hand with `winningHandSize(rules)` as the winning hand size.
`dealerContinues` computes `outcome.dealerRepeats`. The dealer repeats on a dealer win
when `rules.dealerRepeatsOnWin` is set, and on any exhaustive draw. The finished hand does
not rotate the dealer; `NEXT_HAND` does.

### Scoring and settlement

`finishWin` scores the winner with the scoring catalogue (`scoreHand`) and records the
itemized patterns and total tai in the `GameOutcome`. `rules.settlement` (default
`taiwaneseSettlement`) turns the tai total into a zero-sum per-seat point transfer: the
discarder pays the full amount on a discard win, all three losers pay on a self-draw, and
nobody pays on an exhaustive draw. The engine applies the deltas to each seat's persistent
`score`. `settlement` is optional so the ruleset stays JSON-serializable for replay; the
engine falls back to `taiwaneseSettlement` when it is absent.

### Next hand

`NEXT_HAND` starts the next hand once a hand is `FINISHED`. It rotates the dealer with
`advanceDealer` unless `outcome.dealerRepeats`, advances the prevailing wind after a full
dealer circuit, sets each seat's wind from the dealer, carries the scores forward, and
deals a fresh hand. The event log is a single stream that spans hands.

## Available actions

`getAvailableActions(state, player)` enumerates the legal actions for a seat given the
phase, the turn, and any open claim window.
