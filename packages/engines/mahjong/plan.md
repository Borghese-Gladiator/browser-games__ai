# Plan: winning-hand solver for mahjong engine

## brief
Add a pure, gameplay-agnostic winning-hand solver to `packages/engines/mahjong`.
The solver accepts concealed tiles plus already-exposed melds. It reports if the
hand wins under the Taiwanese standard pattern (5 melds + 1 pair) or the
16-tile seven-pairs pattern (8 pairs). It returns every valid decomposition and
the waits for an incomplete hand.

## changes
- `src/tiles/meld.ts`: new `MeldKind` and `Meld` types (exposed meld context).
- `src/hand/counts.ts`: `TileCounts`, `toTileCounts`, `ALL_TILE_KINDS`.
- `src/hand/decomposition.ts`: `WinningPattern`, `DecomposedMeld`,
  `HandDecomposition`, `WinningHandResult`.
- `src/hand/winning-patterns/standard.ts`: `decomposeStandard`, a recursive
  memoized search over triplets, sequences and one pair.
- `src/hand/winning-patterns/seven-pairs.ts`: `isSevenPairs`,
  `decomposeSevenPairs` for the 16-tile Taiwanese form (8 pairs).
- `src/hand/winning.ts`: `HandInput`, `isWinningHand`,
  `findWinningDecompositions`.
- `src/hand/waits.ts`: `findWaits` for both patterns.
- `src/index.ts`: re-export the public API.

## tests
### unit
- counts: flat list maps to correct kind counts.
- standard: known hand recognized; multiple decompositions all returned;
  exposed melds reduce the melds needed; invalid hand rejected.
- seven pairs: 8-pairs detected; odd counts rejected; disabled by rule.
- winning: standard vs seven-pairs pattern; seven pairs never STANDARD;
  invalid hand not winning.
- waits: standard wait and seven-pairs wait.

### manual
Node script that builds a known winning hand and prints `isWinningHand`.
