import type { TileKind } from '@browser-games/engine-mahjong';
import type { DiscardPosition } from '../completion/distance.ts';
import {
  MAX_COPIES,
  TOTAL_MELDS,
  countsFromTiles,
  indexToKind,
  isNumberIndex,
  rankPosition,
  shantenFromCounts,
} from '../completion/distance.ts';

export interface ImprovingTiles {
  readonly kinds: readonly TileKind[];
  readonly count: number;
}

export function candidateIndices(counts: readonly number[]): number[] {
  const seen = new Set<number>();
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] === 0) {
      continue;
    }
    seen.add(index);
    if (!isNumberIndex(index)) {
      continue;
    }
    const rank = rankPosition(index);
    if (rank >= 1) {
      seen.add(index - 1);
    }
    if (rank >= 2) {
      seen.add(index - 2);
    }
    if (rank <= 7) {
      seen.add(index + 1);
    }
    if (rank <= 6) {
      seen.add(index + 2);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function improvingKindsFromCounts(
  counts: number[],
  setsNeeded: number,
  base: number,
): TileKind[] {
  const kinds: TileKind[] = [];
  for (const index of candidateIndices(counts)) {
    if (counts[index] >= MAX_COPIES) {
      continue;
    }
    counts[index] += 1;
    const shanten = shantenFromCounts(counts, setsNeeded);
    counts[index] -= 1;
    if (shanten < base) {
      kinds.push(indexToKind(index));
    }
  }
  return kinds;
}

export function improvingTiles(position: DiscardPosition): ImprovingTiles {
  const setsNeeded = TOTAL_MELDS - position.exposedMelds.length;
  if (setsNeeded < 0) {
    return { kinds: [], count: 0 };
  }
  const counts = countsFromTiles(position.concealed);
  const base = shantenFromCounts(counts, setsNeeded);
  const kinds = improvingKindsFromCounts(counts, setsNeeded, base);
  return { kinds, count: kinds.length };
}
