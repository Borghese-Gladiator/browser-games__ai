import type { GameAction } from './actions.js';

export type GameErrorCode =
  | 'WRONG_TURN'
  | 'WRONG_PHASE'
  | 'TILE_NOT_IN_HAND'
  | 'WALL_EMPTY'
  | 'GAME_OVER'
  | 'NOT_A_WINNING_HAND'
  | 'UNKNOWN_ACTION';

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
  readonly action: GameAction;
}

export function gameError(code: GameErrorCode, action: GameAction, message: string): GameError {
  return { code, message, action };
}
