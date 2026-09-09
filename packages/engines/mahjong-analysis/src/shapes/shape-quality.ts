import { isNumberIndex, rankPosition } from '../completion/distance.ts';
import type { IdentifiedShape } from './identify-shapes.ts';
import { identifyShapes } from './identify-shapes.ts';

const PENALTY_ISOLATED_HONOR = 6;
const PENALTY_ISOLATED_NUMBER = 2;

export interface ShapeMetrics {
  readonly shapeQuality: number;
  readonly isolatedTilePenalty: number;
  readonly shapes: readonly IdentifiedShape[];
}

export function countGoodShapes(counts: readonly number[]): number {
  let score = 0;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= 2) {
      score += 1;
    }
    if (isNumberIndex(index) && rankPosition(index) <= 7 && counts[index] > 0 && counts[index + 1] > 0) {
      score += 1;
    }
  }
  return score;
}

function hasNumberNeighbor(counts: readonly number[], index: number): boolean {
  const rank = rankPosition(index);
  if (rank >= 1 && counts[index - 1] > 0) {
    return true;
  }
  if (rank >= 2 && counts[index - 2] > 0) {
    return true;
  }
  if (rank <= 7 && counts[index + 1] > 0) {
    return true;
  }
  if (rank <= 6 && counts[index + 2] > 0) {
    return true;
  }
  return false;
}

export function isolatedPenalty(counts: readonly number[]): number {
  let penalty = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count !== 1) {
      continue;
    }
    if (isNumberIndex(index)) {
      if (!hasNumberNeighbor(counts, index)) {
        penalty += PENALTY_ISOLATED_NUMBER;
      }
    } else {
      penalty += PENALTY_ISOLATED_HONOR;
    }
  }
  return penalty;
}

export function shapeMetrics(counts: readonly number[]): ShapeMetrics {
  return {
    shapeQuality: countGoodShapes(counts),
    isolatedTilePenalty: isolatedPenalty(counts),
    shapes: identifyShapes(counts),
  };
}
