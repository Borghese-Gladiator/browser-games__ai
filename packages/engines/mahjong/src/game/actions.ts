import type { Tile } from '../tiles/tile.ts';
import type { PlayerId } from './state.ts';

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

export interface ClaimChowAction {
  readonly type: 'CLAIM_CHOW';
  readonly player: PlayerId;
  readonly tiles: readonly [Tile, Tile];
}

export interface ClaimPongAction {
  readonly type: 'CLAIM_PONG';
  readonly player: PlayerId;
}

export interface ClaimKongAction {
  readonly type: 'CLAIM_KONG';
  readonly player: PlayerId;
  readonly concealed: boolean;
  readonly tile?: Tile;
}

export interface PassClaimAction {
  readonly type: 'PASS_CLAIM';
  readonly player: PlayerId;
}

export type GameAction =
  | DealAction
  | DrawAction
  | DiscardAction
  | DeclareWinAction
  | ClaimChowAction
  | ClaimPongAction
  | ClaimKongAction
  | PassClaimAction;
