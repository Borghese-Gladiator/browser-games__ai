import type { Tile } from '../tiles/tile.js';
import type { TileKind } from '../tiles/tile-kind.js';
import { tileToKind } from '../tiles/tile-kind.js';

export type TileCounts = Map<TileKind, number>;

const NUMBER_SUFFIXES = ['m', 's', 'p'] as const;

const HONOR_KINDS: readonly TileKind[] = [
  'east',
  'south',
  'west',
  'north',
  'red',
  'green',
  'white',
];

function buildNumberKinds(): TileKind[] {
  const kinds: TileKind[] = [];
  for (const suffix of NUMBER_SUFFIXES) {
    for (let rank = 1; rank <= 9; rank++) {
      kinds.push(`${rank}${suffix}` as TileKind);
    }
  }
  return kinds;
}

export const ALL_TILE_KINDS: readonly TileKind[] = [...buildNumberKinds(), ...HONOR_KINDS];

export function toTileCounts(tiles: readonly Tile[]): TileCounts {
  const counts: TileCounts = new Map();
  for (const tile of tiles) {
    const kind = tileToKind(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
}
