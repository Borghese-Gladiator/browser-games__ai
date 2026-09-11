import type { TileKind } from '../../tiles/tile-kind.ts';
import type { TaiwaneseRules } from '../../rules/taiwanese.ts';
import { winningHandSize } from '../../rules/taiwanese.ts';
import type { TileCounts } from '../counts.ts';
import { ALL_TILE_KINDS } from '../counts.ts';
import type { DecomposedMeld, HandDecomposition } from '../decomposition.ts';

const TRIPLET_SIZE = 3;

export function isSevenPairs(counts: TileCounts, rules: TaiwaneseRules): boolean {
  if (!rules.sevenPairsEnabled) {
    return false;
  }
  let total = 0;
  let triplets = 0;
  for (const count of counts.values()) {
    total += count;
    if (count % 2 !== 0) {
      if (count !== TRIPLET_SIZE) {
        return false;
      }
      triplets += 1;
    }
  }
  return total === winningHandSize(rules) && triplets === 1;
}

export function decomposeSevenPairs(
  counts: TileCounts,
  rules: TaiwaneseRules,
): HandDecomposition[] {
  if (!isSevenPairs(counts, rules)) {
    return [];
  }
  const melds: DecomposedMeld[] = [];
  const pairKinds: TileKind[] = [];
  for (const kind of ALL_TILE_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count === TRIPLET_SIZE) {
      melds.push({ kind: 'pong', tiles: [kind, kind, kind], concealed: true });
      continue;
    }
    for (let i = 0; i < count / 2; i++) {
      pairKinds.push(kind);
    }
  }
  const lastKind = pairKinds[pairKinds.length - 1];
  for (const kind of pairKinds.slice(0, -1)) {
    melds.push({ kind: 'pair', tiles: [kind, kind], concealed: true });
  }
  return [
    {
      pattern: 'SEVEN_PAIRS',
      melds,
      pair: [lastKind, lastKind],
    },
  ];
}
