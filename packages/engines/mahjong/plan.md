# plan: standard mahjong AI

## brief
Add a heuristic "Standard" AI for the 16-tile Taiwanese hand. The AI uses a
factored distance-to-completion evaluator. It declares a win when available,
takes a clearly-improving pong, declines a non-improving pong, and otherwise
discards the best-ranked tile. Reuse `runSimulation` with four Standard AIs and
report the observed statistics against the random baseline.

## changes
- `src/ai/standard.ts`
  - `standardShanten(concealed, exposedMeldCount, rules)` — pure shanten metric
    over tile counts (memoized recursion).
  - `evaluateDiscards(input, rules)` — simulate each candidate discard, score by
    `completionDistance*-1000 + improvementCount*20 + shapeQuality*10 +
    waitQuality*15 - isolatedTilePenalty`. Returns evaluations sorted best-first.
  - `shouldClaimPong(input, discard, rules)` — true when pong lowers shanten.
  - `createStandardAi(seed?)` — reads actions, declares win, decides pong/pass,
    else discards best-ranked tile.
- `src/simulation.ts` — thread an optional AI factory through `runSimulation`
  and `playOneGame`. Default stays random. CLI accepts a `standard` argument.
- `src/index.ts` — re-export `./ai/standard.js`. Leave `createRandomAi` intact.

## tests
### unit (`src/ai/standard.test.ts`)
- always returns a legal action (drive real games, assert membership).
- declares a win when a `DECLARE_WIN` action exists.
- pong accept for a clearly-improving hand, decline for a non-improving hand.
- `evaluateDiscards` ranks an isolated honor above a connected tile.

### manual (node script)
- Run `runSimulation` with four Standard AIs. Confirm crashes 0 and
  invalidStates 0. Record completion rate, averageTurns, selfDrawRate,
  discardWinRate, exhaustiveDrawRate next to the random baseline.
