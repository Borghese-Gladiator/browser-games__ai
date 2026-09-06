import type { TileKind } from '../../tiles/tile-kind.js';
import type { TileCounts } from '../counts.js';
import { ALL_TILE_KINDS } from '../counts.js';
import type { DecomposedMeld, HandDecomposition } from '../decomposition.js';

const NUMBER_SUFFIXES = new Set(['m', 's', 'p']);

interface NumberKind {
  readonly rank: number;
  readonly suffix: string;
}

function parseNumberKind(kind: TileKind): NumberKind | null {
  if (kind.length !== 2) {
    return null;
  }
  const suffix = kind[1];
  if (!NUMBER_SUFFIXES.has(suffix)) {
    return null;
  }
  return { rank: Number(kind[0]), suffix };
}

interface Partial {
  readonly melds: readonly DecomposedMeld[];
  readonly pair: readonly [TileKind, TileKind] | null;
}

function totalCount(counts: TileCounts): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}

function serialize(counts: TileCounts): string {
  return ALL_TILE_KINDS.map((kind) => counts.get(kind) ?? 0).join(',');
}

function lowestKind(counts: TileCounts): TileKind | null {
  for (const kind of ALL_TILE_KINDS) {
    if ((counts.get(kind) ?? 0) > 0) {
      return kind;
    }
  }
  return null;
}

function search(
  counts: TileCounts,
  meldsRemaining: number,
  pairsRemaining: number,
  memo: Map<string, Partial[]>,
): Partial[] {
  const lowest = lowestKind(counts);
  if (lowest === null) {
    if (meldsRemaining === 0 && pairsRemaining === 0) {
      return [{ melds: [], pair: null }];
    }
    return [];
  }

  const key = `${serialize(counts)}|${meldsRemaining}|${pairsRemaining}`;
  const cached = memo.get(key);
  if (cached) {
    return cached;
  }

  const results: Partial[] = [];
  const count = counts.get(lowest) ?? 0;

  if (pairsRemaining > 0 && count >= 2) {
    counts.set(lowest, count - 2);
    for (const sub of search(counts, meldsRemaining, pairsRemaining - 1, memo)) {
      results.push({ melds: sub.melds, pair: [lowest, lowest] });
    }
    counts.set(lowest, count);
  }

  if (meldsRemaining > 0 && count >= 3) {
    counts.set(lowest, count - 3);
    const meld: DecomposedMeld = {
      kind: 'pong',
      tiles: [lowest, lowest, lowest],
      concealed: true,
    };
    for (const sub of search(counts, meldsRemaining - 1, pairsRemaining, memo)) {
      results.push({ melds: [meld, ...sub.melds], pair: sub.pair });
    }
    counts.set(lowest, count);
  }

  if (meldsRemaining > 0) {
    const parsed = parseNumberKind(lowest);
    if (parsed && parsed.rank <= 7) {
      const second = `${parsed.rank + 1}${parsed.suffix}` as TileKind;
      const third = `${parsed.rank + 2}${parsed.suffix}` as TileKind;
      const secondCount = counts.get(second) ?? 0;
      const thirdCount = counts.get(third) ?? 0;
      if (count >= 1 && secondCount >= 1 && thirdCount >= 1) {
        counts.set(lowest, count - 1);
        counts.set(second, secondCount - 1);
        counts.set(third, thirdCount - 1);
        const meld: DecomposedMeld = {
          kind: 'chow',
          tiles: [lowest, second, third],
          concealed: true,
        };
        for (const sub of search(counts, meldsRemaining - 1, pairsRemaining, memo)) {
          results.push({ melds: [meld, ...sub.melds], pair: sub.pair });
        }
        counts.set(lowest, count);
        counts.set(second, secondCount);
        counts.set(third, thirdCount);
      }
    }
  }

  memo.set(key, results);
  return results;
}

export function decomposeStandard(counts: TileCounts, meldsNeeded: number): HandDecomposition[] {
  if (meldsNeeded < 0) {
    return [];
  }
  if (totalCount(counts) !== meldsNeeded * 3 + 2) {
    return [];
  }
  const working: TileCounts = new Map(counts);
  const partials = search(working, meldsNeeded, 1, new Map());
  const decompositions: HandDecomposition[] = [];
  for (const partial of partials) {
    if (partial.pair === null) {
      continue;
    }
    decompositions.push({
      pattern: 'STANDARD',
      melds: partial.melds,
      pair: partial.pair,
    });
  }
  return decompositions;
}
