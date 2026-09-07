import type { TileKind } from '../../tiles/tile-kind.js';
import type { TaiwaneseRules } from '../../rules/taiwanese.js';
import type { TileCounts } from '../counts.js';
import { ALL_TILE_KINDS } from '../counts.js';
import type { DecomposedMeld, HandDecomposition } from '../decomposition.js';

export function isSevenPairs(counts: TileCounts, rules: TaiwaneseRules): boolean {
  if (!rules.sevenPairsEnabled) {
    return false;
  }
  let total = 0;
  for (const count of counts.values()) {
    if (count % 2 !== 0) {
      return false;
    }
    total += count;
  }
  return total === rules.concealedHandSize;
}

export function decomposeSevenPairs(
  counts: TileCounts,
  rules: TaiwaneseRules,
): HandDecomposition[] {
  if (!isSevenPairs(counts, rules)) {
    return [];
  }
  const pairKinds: TileKind[] = [];
  for (const kind of ALL_TILE_KINDS) {
    const count = counts.get(kind) ?? 0;
    for (let i = 0; i < count / 2; i++) {
      pairKinds.push(kind);
    }
  }
  const lastKind = pairKinds[pairKinds.length - 1];
  const melds: DecomposedMeld[] = pairKinds.slice(0, -1).map((kind) => ({
    kind: 'pair',
    tiles: [kind, kind],
    concealed: true,
  }));
  return [
    {
      pattern: 'SEVEN_PAIRS',
      melds,
      pair: [lastKind, lastKind],
    },
  ];
}
