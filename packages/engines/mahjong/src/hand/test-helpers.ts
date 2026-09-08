import type { Suit, Tile } from '../tiles/tile.js';
import type { HonorKind } from '../tiles/tile.js';
import type { TileKind } from '../tiles/tile-kind.js';
import type { Meld, MeldKind } from '../tiles/meld.js';

const SUFFIX_SUIT: Record<string, Suit> = {
  m: 'characters',
  s: 'bamboo',
  p: 'dots',
};

export function kindToTile(kind: TileKind, copy = 1): Tile {
  if (kind.length === 2 && SUFFIX_SUIT[kind[1]]) {
    return { id: `${kind}-${copy}`, suit: SUFFIX_SUIT[kind[1]], rank: Number(kind[0]) };
  }
  return { id: `${kind}-${copy}`, suit: 'honor', honor: kind as HonorKind };
}

export function tiles(spec: string): Tile[] {
  const seen = new Map<string, number>();
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => {
      const copy = (seen.get(token) ?? 0) + 1;
      seen.set(token, copy);
      return kindToTile(token as TileKind, copy);
    });
}

export function meld(kind: MeldKind, spec: string): Meld {
  return { kind, tiles: tiles(spec) };
}
