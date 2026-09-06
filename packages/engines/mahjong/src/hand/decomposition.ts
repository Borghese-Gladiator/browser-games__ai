import type { TileKind } from '../tiles/tile-kind.js';
import type { MeldKind } from '../tiles/meld.js';

export type WinningPattern = 'STANDARD' | 'SEVEN_PAIRS';

export interface DecomposedMeld {
  readonly kind: MeldKind;
  readonly tiles: readonly TileKind[];
  readonly concealed: boolean;
}

export interface HandDecomposition {
  readonly pattern: WinningPattern;
  readonly melds: readonly DecomposedMeld[];
  readonly pair: readonly [TileKind, TileKind];
}

export interface WinningHandResult {
  readonly winning: boolean;
  readonly pattern: WinningPattern | null;
  readonly decompositions: readonly HandDecomposition[];
}
