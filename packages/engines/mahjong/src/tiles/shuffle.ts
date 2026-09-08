import type { RandomSource } from '../random/rng.ts';
import type { Tile } from './tile.ts';

export function shuffleTiles(tileSet: readonly Tile[], rng: RandomSource): Tile[] {
  const out = tileSet.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
