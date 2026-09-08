import type { Tile } from '../tiles/tile.js';
import type { PlayerId } from './state.js';

export interface DealAction {
  readonly type: 'DEAL';
}

export interface DrawAction {
  readonly type: 'DRAW';
  readonly player: PlayerId;
}

export interface DiscardAction {
  readonly type: 'DISCARD';
  readonly player: PlayerId;
  readonly tile: Tile;
}

export interface DeclareWinAction {
  readonly type: 'DECLARE_WIN';
  readonly player: PlayerId;
}

export type GameAction = DealAction | DrawAction | DiscardAction | DeclareWinAction;
