import type { Tile, FlowerKind } from '../tiles/tile.js';
import type { TileKind } from '../tiles/tile-kind.js';
import type { Wind } from '../game/state.js';
import type { TaiwaneseRules } from '../rules/taiwanese.js';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.js';
import type { HandDecomposition } from '../hand/decomposition.js';
import type { HandInput } from '../hand/winning.js';
import { findWinningDecompositions } from '../hand/winning.js';

export interface TaiValues {
  readonly selfDraw: number;
  readonly allTriplets: number;
  readonly allOneSuit: number;
  readonly halfFlush: number;
  readonly sevenPairs: number;
  readonly dealer: number;
  readonly flower: number;
  readonly seatFlower: number;
}

export const TAI_VALUES: TaiValues = {
  selfDraw: 1,
  allTriplets: 4,
  allOneSuit: 8,
  halfFlush: 4,
  sevenPairs: 4,
  dealer: 1,
  flower: 1,
  seatFlower: 1,
};

export type PatternName =
  | 'SELF_DRAW'
  | 'DEALER'
  | 'ALL_TRIPLETS'
  | 'ALL_ONE_SUIT'
  | 'HALF_FLUSH'
  | 'SEVEN_PAIRS'
  | 'FLOWER'
  | 'SEAT_FLOWER';

export interface MatchedPattern {
  readonly name: PatternName;
  readonly tai: number;
}

export interface ScoreResult {
  readonly totalTai: number;
  readonly patterns: readonly MatchedPattern[];
  readonly decomposition: HandDecomposition;
}

export interface ScoreContext {
  readonly hand: HandInput;
  readonly selfDraw: boolean;
  readonly isDealer: boolean;
  readonly seatWind: Wind;
  readonly flowers?: readonly Tile[];
  readonly rules?: TaiwaneseRules;
  readonly taiValues?: TaiValues;
}

const NUMBER_SUFFIXES = new Set(['m', 's', 'p']);

const FLOWER_WIND: Record<FlowerKind, Wind> = {
  plum: 'E',
  spring: 'E',
  orchid: 'S',
  summer: 'S',
  chrysanthemum: 'W',
  autumn: 'W',
  bamboo: 'N',
  winter: 'N',
};

function decompositionKinds(decomposition: HandDecomposition): TileKind[] {
  const kinds: TileKind[] = [];
  for (const meld of decomposition.melds) {
    kinds.push(...meld.tiles);
  }
  kinds.push(...decomposition.pair);
  return kinds;
}

function isAllTriplets(decomposition: HandDecomposition): boolean {
  if (decomposition.pattern !== 'STANDARD') {
    return false;
  }
  return decomposition.melds.every((meld) => meld.kind === 'pong' || meld.kind === 'kong');
}

function flushKind(decomposition: HandDecomposition): 'FULL' | 'HALF' | null {
  const suits = new Set<string>();
  let hasHonor = false;
  for (const kind of decompositionKinds(decomposition)) {
    if (kind.length === 2 && NUMBER_SUFFIXES.has(kind[1])) {
      suits.add(kind[1]);
    } else {
      hasHonor = true;
    }
  }
  if (suits.size === 1 && !hasHonor) {
    return 'FULL';
  }
  if (suits.size <= 1 && hasHonor) {
    return 'HALF';
  }
  return null;
}

function scoreDecomposition(
  decomposition: HandDecomposition,
  context: ScoreContext,
  taiValues: TaiValues,
): ScoreResult {
  const patterns: MatchedPattern[] = [];

  if (context.selfDraw) {
    patterns.push({ name: 'SELF_DRAW', tai: taiValues.selfDraw });
  }
  if (context.isDealer) {
    patterns.push({ name: 'DEALER', tai: taiValues.dealer });
  }

  if (decomposition.pattern === 'SEVEN_PAIRS') {
    patterns.push({ name: 'SEVEN_PAIRS', tai: taiValues.sevenPairs });
  } else if (isAllTriplets(decomposition)) {
    patterns.push({ name: 'ALL_TRIPLETS', tai: taiValues.allTriplets });
  }

  const flush = flushKind(decomposition);
  if (flush === 'FULL') {
    patterns.push({ name: 'ALL_ONE_SUIT', tai: taiValues.allOneSuit });
  } else if (flush === 'HALF') {
    patterns.push({ name: 'HALF_FLUSH', tai: taiValues.halfFlush });
  }

  const flowers = context.flowers ?? [];
  let flowerCount = 0;
  let seatFlowerCount = 0;
  for (const flower of flowers) {
    if (!flower.flower) {
      continue;
    }
    flowerCount += 1;
    if (FLOWER_WIND[flower.flower] === context.seatWind) {
      seatFlowerCount += 1;
    }
  }
  if (flowerCount > 0) {
    patterns.push({ name: 'FLOWER', tai: flowerCount * taiValues.flower });
  }
  if (seatFlowerCount > 0) {
    patterns.push({ name: 'SEAT_FLOWER', tai: seatFlowerCount * taiValues.seatFlower });
  }

  const totalTai = patterns.reduce((sum, pattern) => sum + pattern.tai, 0);
  return { totalTai, patterns, decomposition };
}

export function scoreHand(context: ScoreContext): ScoreResult | null {
  const rules = context.rules ?? DEFAULT_TAIWANESE_RULES;
  const taiValues = context.taiValues ?? TAI_VALUES;
  const decompositions = findWinningDecompositions(context.hand, rules);
  if (decompositions.length === 0) {
    return null;
  }
  let best: ScoreResult | null = null;
  for (const decomposition of decompositions) {
    const result = scoreDecomposition(decomposition, context, taiValues);
    if (best === null || result.totalTai > best.totalTai) {
      best = result;
    }
  }
  return best;
}
