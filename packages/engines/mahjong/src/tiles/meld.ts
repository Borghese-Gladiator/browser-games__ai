import type { Tile } from './tile.ts';

export type MeldKind = 'pong' | 'chow' | 'kong' | 'pair';

export interface Meld {
  readonly kind: MeldKind;
  readonly tiles: readonly Tile[];
}
