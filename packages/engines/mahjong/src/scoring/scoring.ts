import type { Tile, FlowerKind } from '../tiles/tile.ts';
import type { TileKind } from '../tiles/tile-kind.ts';
import type { Wind } from '../game/state.ts';
import type { TaiwaneseRules } from '../rules/taiwanese.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import type { HandDecomposition } from '../hand/decomposition.ts';
import type { HandInput } from '../hand/winning.ts';
import { findWinningDecompositions } from '../hand/winning.ts';
import { TAI_VALUES as PATTERN_CATALOGUE } from '@browser-games/engine-mahjong-analysis';

// A pattern the scorer matched, carrying its identity straight from the
// mahjong-analysis catalogue. The catalogue is the single source of the id, the
// English and Chinese names, and the base tai. Only flowers scale the tai by
// count, so the tai field can differ from the catalogue base for those.
export interface MatchedPattern {
  readonly id: string;
  readonly english: string;
  readonly chinese: string;
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

function matched(id: string, tai?: number): MatchedPattern {
  const def = PATTERN_CATALOGUE[id];
  return { id: def.id, english: def.english, chinese: def.chinese, tai: tai ?? def.tai };
}

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
): ScoreResult {
  const patterns: MatchedPattern[] = [];

  if (context.selfDraw) {
    patterns.push(matched('self_draw'));
  }
  if (context.isDealer) {
    patterns.push(matched('dealer'));
  }

  if (decomposition.pattern === 'SEVEN_PAIRS') {
    patterns.push(matched('seven_pairs'));
  } else if (isAllTriplets(decomposition)) {
    patterns.push(matched('all_triplets'));
  }

  const flush = flushKind(decomposition);
  if (flush === 'FULL') {
    patterns.push(matched('full_flush'));
  } else if (flush === 'HALF') {
    patterns.push(matched('half_flush'));
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
    patterns.push(matched('flower', flowerCount * PATTERN_CATALOGUE.flower.tai));
  }
  if (seatFlowerCount > 0) {
    patterns.push(matched('seat_flower', seatFlowerCount * PATTERN_CATALOGUE.seat_flower.tai));
  }

  const totalTai = patterns.reduce((sum, pattern) => sum + pattern.tai, 0);
  return { totalTai, patterns, decomposition };
}

export function scoreHand(context: ScoreContext): ScoreResult | null {
  const rules = context.rules ?? DEFAULT_TAIWANESE_RULES;
  const decompositions = findWinningDecompositions(context.hand, rules);
  if (decompositions.length === 0) {
    return null;
  }
  let best: ScoreResult | null = null;
  for (const decomposition of decompositions) {
    const result = scoreDecomposition(decomposition, context);
    if (best === null || result.totalTai > best.totalTai) {
      best = result;
    }
  }
  return best;
}
