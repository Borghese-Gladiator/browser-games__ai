import type { HonorKind, Suit, Tile, TileKind } from '@browser-games/engine-mahjong';

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
