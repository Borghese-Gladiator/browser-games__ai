import type { ClaimType } from '../rules/claims.ts';
import type { GameAction } from './actions.ts';
import type { GameState, PlayerId } from './state.ts';
import type { GameError } from './errors.ts';
import type { TurnPhase } from './turn.ts';
import { getPlayer } from './state.ts';
import { gameError } from './errors.ts';
import { chowCombos, sameKind, windowOption } from './claim.ts';

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

export function requireClaimWindow(
  state: GameState,
  action: GameAction,
  player: PlayerId,
): GameError | null {
  if (!state.pendingClaim) {
    return gameError('NO_CLAIM_WINDOW', action, 'no claim window is open');
  }
  if (!state.pendingClaim.pending.includes(player)) {
    return gameError(
      'NOT_ELIGIBLE_TO_CLAIM',
      action,
      `player ${player} is not an outstanding claimant`,
    );
  }
  return null;
}

function eligibleForKind(state: GameState, player: PlayerId, kind: ClaimType): boolean {
  const window = state.pendingClaim;
  if (!window) {
    return false;
  }
  const option = windowOption(window, player);
  return option !== undefined && option.kinds.includes(kind);
}

export function validateAction(state: GameState, action: GameAction): GameError | null {
  if (action.type === 'NEXT_HAND') {
    if (state.phase !== 'FINISHED' || !state.outcome) {
      return gameError('WRONG_PHASE', action, 'NEXT_HAND is only valid after a finished hand');
    }
    return null;
  }
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
      if (state.pendingClaim) {
        const windowError = requireClaimWindow(state, action, action.player);
        if (windowError) {
          return windowError;
        }
        if (!eligibleForKind(state, action.player, 'WIN')) {
          return gameError('INVALID_CLAIM', action, `player ${action.player} cannot win this discard`);
        }
        return null;
      }
      return requireTurn(state, action, action.player, 'NEEDS_DISCARD');
    }
    case 'CLAIM_CHOW': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'CLAIM_CHOW is only valid during play');
      }
      const windowError = requireClaimWindow(state, action, action.player);
      if (windowError) {
        return windowError;
      }
      if (!eligibleForKind(state, action.player, 'CHOW')) {
        return gameError('INVALID_CLAIM', action, `player ${action.player} cannot chow this discard`);
      }
      const discard = state.pendingClaim!.discard;
      const held = getPlayer(state, action.player).hand;
      const requested = action.tiles.map((tile) => tile.id).sort();
      const valid = chowCombos(held, discard.tile).some((combo) => {
        const ids = combo.map((tile) => tile.id).sort();
        return ids.length === requested.length && ids.every((id, index) => id === requested[index]);
      });
      if (!valid) {
        return gameError('INVALID_CLAIM', action, 'the named tiles do not form a chow with the discard');
      }
      return null;
    }
    case 'CLAIM_PONG': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'CLAIM_PONG is only valid during play');
      }
      const windowError = requireClaimWindow(state, action, action.player);
      if (windowError) {
        return windowError;
      }
      if (!eligibleForKind(state, action.player, 'PONG')) {
        return gameError('INVALID_CLAIM', action, `player ${action.player} cannot pong this discard`);
      }
      return null;
    }
    case 'CLAIM_KONG': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'CLAIM_KONG is only valid during play');
      }
      if (action.concealed) {
        const turnError = requireTurn(state, action, action.player, 'NEEDS_DISCARD');
        if (turnError) {
          return turnError;
        }
        if (!action.tile) {
          return gameError('INVALID_KONG', action, 'a concealed kong needs a tile');
        }
        const held = getPlayer(state, action.player).hand;
        const matches = held.filter((tile) => sameKind(tile, action.tile!)).length;
        if (matches < 4) {
          return gameError('INVALID_KONG', action, 'a concealed kong needs four matching tiles');
        }
        return null;
      }
      const windowError = requireClaimWindow(state, action, action.player);
      if (windowError) {
        return windowError;
      }
      if (!eligibleForKind(state, action.player, 'KONG')) {
        return gameError('INVALID_KONG', action, `player ${action.player} cannot kong this discard`);
      }
      return null;
    }
    case 'PASS_CLAIM': {
      if (state.phase !== 'PLAYING') {
        return gameError('WRONG_PHASE', action, 'PASS_CLAIM is only valid during play');
      }
      return requireClaimWindow(state, action, action.player);
    }
    default: {
      const unknown = action as GameAction;
      return gameError('UNKNOWN_ACTION', unknown, 'unknown action type');
    }
  }
}
