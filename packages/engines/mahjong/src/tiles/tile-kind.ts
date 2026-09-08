import type { Suit, Tile } from './tile.ts';

export type TileKind =
  | '1m'
  | '2m'
  | '3m'
  | '4m'
  | '5m'
  | '6m'
  | '7m'
  | '8m'
  | '9m'
  | '1s'
  | '2s'
  | '3s'
  | '4s'
  | '5s'
  | '6s'
  | '7s'
  | '8s'
  | '9s'
  | '1p'
  | '2p'
  | '3p'
  | '4p'
  | '5p'
  | '6p'
  | '7p'
  | '8p'
  | '9p'
  | 'east'
  | 'south'
  | 'west'
  | 'north'
  | 'red'
  | 'green'
  | 'white';

const NUMBER_SUFFIX: Partial<Record<Suit, string>> = {
  characters: 'm',
  bamboo: 's',
  dots: 'p',
};

export function tileToKind(tile: Tile): TileKind {
  if (tile.suit === 'honor') {
    if (!tile.honor) {
      throw new Error(`honor tile ${tile.id} has no honor`);
    }
    return tile.honor;
  }
  if (tile.suit === 'flower') {
    throw new Error(`flower tile ${tile.id} has no TileKind`);
  }
  const suffix = NUMBER_SUFFIX[tile.suit];
  if (!suffix || tile.rank === undefined) {
    throw new Error(`tile ${tile.id} has no numeric TileKind`);
  }
  return `${tile.rank}${suffix}` as TileKind;
}
