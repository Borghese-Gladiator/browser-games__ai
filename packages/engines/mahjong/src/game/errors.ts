import type { GameAction } from './actions.js';

export type GameErrorCode =
  | 'WRONG_TURN'
  | 'WRONG_PHASE'
  | 'TILE_NOT_IN_HAND'
  | 'WALL_EMPTY'
  | 'GAME_OVER'
  | 'NOT_A_WINNING_HAND'
  | 'NO_CLAIM_WINDOW'
  | 'NOT_ELIGIBLE_TO_CLAIM'
  | 'INVALID_CLAIM'
  | 'INVALID_KONG'
  | 'UNKNOWN_ACTION';

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
  readonly action: GameAction;
}

export function gameError(code: GameErrorCode, action: GameAction, message: string): GameError {
  return { code, message, action };
}
