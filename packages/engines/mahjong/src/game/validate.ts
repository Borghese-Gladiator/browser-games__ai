import type { GameAction } from './actions.js';
import type { GameState, PlayerId } from './state.js';
import type { GameError } from './errors.js';
import type { TurnPhase } from './turn.js';
import { getPlayer } from './state.js';
import { gameError } from './errors.js';

export function requireTurn(
  state: GameState,
  action: GameAction,
  player: PlayerId,
  phase: TurnPhase,
): GameError | null {
  if (state.turn.player !== player) {
    return gameError(
      'WRONG_TURN',
      action,
      `player ${player} may not act; it is player ${state.turn.player}'s turn`,
    );
  }
  if (state.turn.phase !== phase) {
    return gameError(
      'WRONG_PHASE',
      action,
      `player ${player} may not act in phase ${state.turn.phase}; expected ${phase}`,
    );
  }
  return null;
}

export function validateAction(state: GameState, action: GameAction): GameError | null {
  if (state.phase === 'FINISHED') {
    return gameError('GAME_OVER', action, 'the hand has finished');
  }
  switch (action.type) {
    case 'DEAL': {
      if (state.phase !== 'DEALING') {
        return gameError('WRONG_PHASE', action, 'DEAL is only valid before the deal');
      }
      return null;
    }
    case 'DRAW': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'DRAW is only valid during play');
      }
      return requireTurn(state, action, action.player, 'NEEDS_DRAW');
    }
    case 'DISCARD': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'DISCARD is only valid during play');
      }
      const turnError = requireTurn(state, action, action.player, 'NEEDS_DISCARD');
      if (turnError) {
        return turnError;
      }
      const held = getPlayer(state, action.player).hand;
      if (!held.some((tile) => tile.id === action.tile.id)) {
        return gameError(
          'TILE_NOT_IN_HAND',
          action,
          `player ${action.player} does not hold tile ${action.tile.id}`,
        );
      }
      return null;
    }
    case 'DECLARE_WIN': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'DECLARE_WIN is only valid during play');
      }
      return requireTurn(state, action, action.player, 'NEEDS_DISCARD');
    }
    default: {
      const unknown = action as GameAction;
      return gameError('UNKNOWN_ACTION', unknown, 'unknown action type');
    }
  }
}
