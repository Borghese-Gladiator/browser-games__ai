import type { Tile } from '../tiles/tile.js';
import { tileToKind } from '../tiles/tile-kind.js';
import type { Meld } from '../tiles/meld.js';
import type { TaiwaneseRules } from '../rules/taiwanese.js';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.js';
import type { TileCounts } from './counts.js';
import { toTileCounts } from './counts.js';
import type { DecomposedMeld, HandDecomposition, WinningHandResult } from './decomposition.js';
import { decomposeStandard } from './winning-patterns/standard.js';
import { decomposeSevenPairs } from './winning-patterns/seven-pairs.js';

const TOTAL_MELDS = 5;

export interface HandInput {
  readonly concealed: readonly Tile[];
  readonly exposedMelds: readonly Meld[];
}

export function toExposedMelds(melds: readonly Meld[]): DecomposedMeld[] {
  return melds.map((meld) => ({
    kind: meld.kind,
    tiles: meld.tiles.map(tileToKind),
    concealed: false,
  }));
}

export function winningDecompositionsFromCounts(
  counts: TileCounts,
  exposed: readonly DecomposedMeld[],
  rules: TaiwaneseRules,
): HandDecomposition[] {
  const decompositions: HandDecomposition[] = [];
  const meldsNeeded = TOTAL_MELDS - exposed.length;
  for (const decomposition of decomposeStandard(counts, meldsNeeded)) {
    decompositions.push({
      ...decomposition,
      melds: [...exposed, ...decomposition.melds],
    });
  }
  if (exposed.length === 0) {
    decompositions.push(...decomposeSevenPairs(counts, rules));
  }
  return decompositions;
}

export function findWinningDecompositions(
  input: HandInput,
  rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): HandDecomposition[] {
  const counts = toTileCounts(input.concealed);
  const exposed = toExposedMelds(input.exposedMelds);
  return winningDecompositionsFromCounts(counts, exposed, rules);
}

export function isWinningHand(
  input: HandInput,
  rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): WinningHandResult {
  const decompositions = findWinningDecompositions(input, rules);
  if (decompositions.length === 0) {
    return { winning: false, pattern: null, decompositions: [] };
  }
  const hasStandard = decompositions.some((decomposition) => decomposition.pattern === 'STANDARD');
  return {
    winning: true,
    pattern: hasStandard ? 'STANDARD' : 'SEVEN_PAIRS',
    decompositions,
  };
}
