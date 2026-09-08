# Plan: discard trainer pure logic (slice 1)

## Brief
Add the pure trainer logic for the mahjong discard trainer. Create a seeded,
reproducible puzzle generator. The generator deals a legal hand from a seed,
runs the existing `rankDiscards` analyzer, and accepts a position only when the
ranking spread is more than a named threshold. Add a reason-to-sentence renderer
that turns the structured `DiscardReason` values into readable sentences. Add a
delta helper that grades a player's choice against the best option on the same
scale that milestone 11 mistake severity will use. Place unit tests beside the
code.

## Location
The analysis package is `packages/engines/mahjong-analysis`
(`@browser-games/engine-mahjong-analysis`). It exports `rankDiscards`,
`RankedDiscard`, `DiscardReason`, `DiscardReasonCode`, and `DiscardPosition`.
`Tile`, `TileKind`, `tileToKind`, `createTaiwaneseTileSet`, and
`DEFAULT_TAIWANESE_RULES` come from `@browser-games/engine-mahjong`. The new
client-only workspace lives at `games/mahjong-trainer`.

## Changes
- `games/mahjong-trainer/package.json` — new workspace unit.
- `games/mahjong-trainer/tsconfig.json` — copied from `games/fps/tsconfig.json`.
- `games/mahjong-trainer/src/rng.ts` — mulberry32 PRNG plus `nextSeed`.
- `games/mahjong-trainer/src/puzzle.ts` — deal, spread helpers, generator,
  `MEANINGFUL_SPREAD_THRESHOLD`.
- `games/mahjong-trainer/src/reasons.ts` — render `DiscardReason` to sentences.
- `games/mahjong-trainer/src/severity.ts` — delta helper, severity scale,
  `SEVERITY_THRESHOLDS`.
- `vitest.config.js` — add aliases for the two mahjong engine packages.

## Tests
### Unit (beside the code)
- `rng.test.ts` — same seed gives same sequence; different seeds differ;
  `nextSeed` is deterministic and changes the seed.
- `puzzle.test.ts` — flat-ranking rejection; clear-spread acceptance;
  `generatePuzzle` reproduces from a seed and produces a meaningful spread.
- `reasons.test.ts` — each reason code maps to the expected sentence; an unknown
  code is dropped, not fabricated.
- `severity.test.ts` — delta equals best minus chosen; severity band
  boundaries; `scoreChoice` grades rank, best, delta, and severity.

### Manual
- `npx vitest run games/mahjong-trainer` passes.
- `npx tsc --noEmit` resolves the engine imports.
