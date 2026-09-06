# Plan: mahjong engine invariants, random AI, and simulation harness

## brief
Add a `GameState` invariant checker, a random-legal AI, and a simulation harness to
the pure Taiwanese mahjong engine. Use the harness to stress the engine over many
random games and confirm no invariant fails.

## changes
- `src/assertValidGameState.ts`: `assertValidGameState(state, options?)` throws
  `InvalidGameStateError` when a required invariant fails. Checks: tile conservation
  over the live wall slice plus hands, melds, flowers, discards (exactly 144 distinct,
  each once); no discarded tile held; no tile in two melds; valid current player; hand
  size within `[concealedHandSize - 3*melds, +1]`; no flower in a concealed hand;
  non-negative wall counts; phase/turn consistency; strictly increasing event seq.
- `src/ai/random.ts`: `createRandomAi(seed?)` returns a `RandomAi` that picks uniformly
  from the supplied legal actions. It never inspects state or builds actions. Also
  `createRng(seed)` for a deterministic float source.
- `src/simulation.ts`: `runSimulation(gameCount, baseSeed)` plays four random AIs per
  game through `applyAction`, asserts after every transition, detects stalls, prints
  failing seeds, and returns a plain `SimulationStats`. A script guard runs `main`.
- `src/index.ts`: re-export the three modules.
- `package.json`: add a `simulate` script.

## interpretation
- A "turn" is one applied state transition (one `applyAction`), including the deal.
- Win/loss rates are fractions of games played.
- A claimed meld that completes a hand and is then declared on the claimer's own
  discard turn is labelled a self-draw; the invariants still hold.

## tests
### unit
- `src/assertValidGameState.test.ts`: fast-check property tests (144-tile count holds
  across a whole game; no tile in two places after any legal action sequence) plus
  focused positive/negative unit tests for the checker.
- `src/simulation.test.ts`: bounded `runSimulation` of a few hundred games; assert zero
  crashes, zero invalid states, no failing seed, all games complete.

### manual
- `npx vitest run packages/engines/mahjong`
- `npm run typecheck`
- `npm run simulate -w @browser-games/engine-mahjong -- 10000 1`
