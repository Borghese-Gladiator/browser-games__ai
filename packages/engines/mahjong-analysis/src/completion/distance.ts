import type { Meld, TaiwaneseRules, Tile, TileKind } from '@browser-games/engine-mahjong';
import { ALL_TILE_KINDS, tileToKind } from '@browser-games/engine-mahjong';

export interface DiscardPosition {
  readonly concealed: readonly Tile[];
  readonly exposedMelds: readonly Meld[];
  readonly rules?: TaiwaneseRules;
}

export const TOTAL_MELDS = 5;
export const MAX_COPIES = 4;
export const SUIT_COUNT = 27;
export const SUIT_WIDTH = 9;

const MEMO_CAP = 300000;

const KIND_INDEX = new Map<TileKind, number>();
ALL_TILE_KINDS.forEach((kind, index) => KIND_INDEX.set(kind, index));

export function isNumberIndex(index: number): boolean {
  return index < SUIT_COUNT;
}

export function rankPosition(index: number): number {
  return index % SUIT_WIDTH;
}

export function indexToKind(index: number): TileKind {
  return ALL_TILE_KINDS[index];
}

export function countsFromTiles(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(ALL_TILE_KINDS.length).fill(0);
  for (const tile of tiles) {
    if (tile.suit === 'flower') {
      continue;
    }
    const index = KIND_INDEX.get(tileToKind(tile));
    if (index !== undefined) {
      counts[index] += 1;
    }
  }
  return counts;
}

const structureMemo = new Map<string, number>();

function serialize(counts: readonly number[]): string {
  return counts.join('');
}

function bestStructureValue(
  counts: number[],
  start: number,
  sets: number,
  partials: number,
  hasPair: boolean,
  setsNeeded: number,
): number {
  let index = start;
  while (index < counts.length && counts[index] === 0) {
    index += 1;
  }
  if (index === counts.length) {
    return 2 * sets + partials + (hasPair ? 1 : 0);
  }

  const key = `${serialize(counts)}|${index}|${sets}|${partials}|${hasPair ? 1 : 0}|${setsNeeded}`;
  const cached = structureMemo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best = 2 * sets + partials + (hasPair ? 1 : 0);
  const count = counts[index];
  const number = isNumberIndex(index);
  const rank = rankPosition(index);

  if (sets < setsNeeded && count >= 3) {
    counts[index] -= 3;
    best = Math.max(best, bestStructureValue(counts, index, sets + 1, partials, hasPair, setsNeeded));
    counts[index] += 3;
  }

  if (sets < setsNeeded && number && rank <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    counts[index + 2] -= 1;
    best = Math.max(best, bestStructureValue(counts, index, sets + 1, partials, hasPair, setsNeeded));
    counts[index] += 1;
    counts[index + 1] += 1;
    counts[index + 2] += 1;
  }

  if (!hasPair && count >= 2) {
    counts[index] -= 2;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials, true, setsNeeded));
    counts[index] += 2;
  }

  if (sets + partials < setsNeeded && count >= 2) {
    counts[index] -= 2;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials + 1, hasPair, setsNeeded));
    counts[index] += 2;
  }

  if (sets + partials < setsNeeded && number && rank <= 7 && counts[index + 1] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials + 1, hasPair, setsNeeded));
    counts[index] += 1;
    counts[index + 1] += 1;
  }

  if (sets + partials < setsNeeded && number && rank <= 6 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 2] -= 1;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials + 1, hasPair, setsNeeded));
    counts[index] += 1;
    counts[index + 2] += 1;
  }

  counts[index] -= 1;
  best = Math.max(best, bestStructureValue(counts, index, sets, partials, hasPair, setsNeeded));
  counts[index] += 1;

  structureMemo.set(key, best);
  return best;
}

export function structureValue(counts: number[], setsNeeded: number): number {
  if (structureMemo.size > MEMO_CAP) {
    structureMemo.clear();
  }
  return bestStructureValue(counts, 0, 0, 0, false, setsNeeded);
}

export function shantenFromCounts(counts: number[], setsNeeded: number): number {
  return 2 * setsNeeded - structureValue(counts, setsNeeded);
}

export function standardShanten(
  concealed: readonly Tile[],
  exposedMeldCount: number,
  _rules?: TaiwaneseRules,
): number {
  const setsNeeded = TOTAL_MELDS - exposedMeldCount;
  if (setsNeeded < 0) {
    return 0;
  }
  return shantenFromCounts(countsFromTiles(concealed), setsNeeded);
}

export function completionDistance(position: DiscardPosition): number {
  return standardShanten(position.concealed, position.exposedMelds.length, position.rules);
}
