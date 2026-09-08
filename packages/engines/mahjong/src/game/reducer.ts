import { isWinningHand } from '../hand/winning.ts';
import type {
  ClaimChowAction,
  ClaimKongAction,
  ClaimPongAction,
  DealAction,
  DeclareWinAction,
  DiscardAction,
  DrawAction,
  GameAction,
  PassClaimAction,
} from './actions.ts';
import type { GameState } from './state.ts';
import { getPlayer, withPlayer } from './state.ts';
import type { ApplyResult } from './result.ts';
import type { GameEvent } from './events.ts';
import { recordEvent } from './events.ts';
import { gameError } from './errors.ts';
import { dealHand, drawFromWall, finishAsDraw, replaceFlowers } from './deal.ts';
import { validateAction } from './validate.ts';
import {
  applyConcealedKong,
  finishWin,
  openClaimWindow,
  registerClaim,
  registerPass,
  resolveClaimWindow,
  sameKind,
} from './claim.ts';

function applyDeal(state: GameState, _action: DealAction): ApplyResult {
  return dealHand(state);
}

function applyDraw(state: GameState, action: DrawAction): ApplyResult {
  const drawn = drawFromWall(state);
  if (drawn.tile === null) {
    return finishAsDraw(state);
  }
  const tile = drawn.tile;
  const held = getPlayer(drawn.state, action.player);
  let current = withPlayer(drawn.state, action.player, { ...held, hand: [...held.hand, tile] });
  const drawnEvent = recordEvent(current, { type: 'TILE_DRAWN', player: action.player, tile });
  current = drawnEvent.state;
  const replaced = replaceFlowers(current, action.player);
  if (!replaced.ok) {
    return replaced;
  }
  if (replaced.exhausted) {
    const draw = finishAsDraw(replaced.state);
    if (!draw.ok) {
      return draw;
    }
    return {
      ok: true,
      state: draw.state,
      events: [drawnEvent.event, ...replaced.events, ...draw.events],
    };
  }
  current = replaced.state;
  const finalHand = getPlayer(current, action.player).hand;
  const drawnTile = finalHand.length > 0 ? finalHand[finalHand.length - 1] : null;
  current = { ...current, turn: { ...current.turn, phase: 'NEEDS_DISCARD', drawnTile } };
  const advanced = recordEvent(current, {
    type: 'TURN_ADVANCED',
    player: action.player,
    phase: 'NEEDS_DISCARD',
  });
  current = advanced.state;
  const events: GameEvent[] = [drawnEvent.event, ...replaced.events, advanced.event];
  return { ok: true, state: current, events };
}

function applyDiscard(state: GameState, action: DiscardAction): ApplyResult {
  const held = getPlayer(state, action.player);
  const index = held.hand.findIndex((tile) => tile.id === action.tile.id);
  if (index === -1) {
    return {
      ok: false,
      error: gameError('TILE_NOT_IN_HAND', action, `tile ${action.tile.id} not held`),
    };
  }
  const hand = [...held.hand.slice(0, index), ...held.hand.slice(index + 1)];
  let current = withPlayer(state, action.player, {
    ...held,
    hand,
    discards: [...held.discards, action.tile],
  });
  current = {
    ...current,
    lastDiscard: { player: action.player, tile: action.tile },
    turn: { ...current.turn, drawnTile: null },
  };
  const discarded = recordEvent(current, {
    type: 'TILE_DISCARDED',
    player: action.player,
    tile: action.tile,
  });
  const opened = openClaimWindow(discarded.state, {
    player: action.player,
    tile: action.tile,
  });
  if (!opened.ok) {
    return opened;
  }
  return { ok: true, state: opened.state, events: [discarded.event, ...opened.events] };
}

function applyDeclareWin(state: GameState, action: DeclareWinAction): ApplyResult {
  if (state.pendingClaim) {
    const next = registerClaim(state, { seat: action.player, kind: 'WIN' });
    if (next.pendingClaim && next.pendingClaim.pending.length === 0) {
      return resolveClaimWindow(next);
    }
    return { ok: true, state: next, events: [] };
  }
  const held = getPlayer(state, action.player);
  const result = isWinningHand({ concealed: held.hand, exposedMelds: held.melds }, state.rules);
  if (!result.winning) {
    return {
      ok: false,
      error: gameError('NOT_A_WINNING_HAND', action, `player ${action.player} has no winning hand`),
    };
  }
  return finishWin(state, action.player, true, null);
}

function applyClaimChow(state: GameState, action: ClaimChowAction): ApplyResult {
  const next = registerClaim(state, {
    seat: action.player,
    kind: 'CHOW',
    tiles: [...action.tiles],
  });
  if (next.pendingClaim && next.pendingClaim.pending.length === 0) {
    return resolveClaimWindow(next);
  }
  return { ok: true, state: next, events: [] };
}

function applyClaimPong(state: GameState, action: ClaimPongAction): ApplyResult {
  const window = state.pendingClaim;
  if (!window) {
    return {
      ok: false,
      error: gameError('NO_CLAIM_WINDOW', action, 'no claim window is open'),
    };
  }
  const held = getPlayer(state, action.player);
  const tiles = held.hand.filter((tile) => sameKind(tile, window.discard.tile)).slice(0, 2);
  const next = registerClaim(state, { seat: action.player, kind: 'PONG', tiles });
  if (next.pendingClaim && next.pendingClaim.pending.length === 0) {
    return resolveClaimWindow(next);
  }
  return { ok: true, state: next, events: [] };
}

function applyClaimKong(state: GameState, action: ClaimKongAction): ApplyResult {
  if (action.concealed) {
    if (!action.tile) {
      return {
        ok: false,
        error: gameError('INVALID_KONG', action, 'a concealed kong needs a tile'),
      };
    }
    return applyConcealedKong(state, action.player, action.tile);
  }
  const window = state.pendingClaim;
  if (!window) {
    return {
      ok: false,
      error: gameError('NO_CLAIM_WINDOW', action, 'no claim window is open'),
    };
  }
  const held = getPlayer(state, action.player);
  const tiles = held.hand.filter((tile) => sameKind(tile, window.discard.tile)).slice(0, 3);
  const next = registerClaim(state, { seat: action.player, kind: 'KONG', tiles });
  if (next.pendingClaim && next.pendingClaim.pending.length === 0) {
    return resolveClaimWindow(next);
  }
  return { ok: true, state: next, events: [] };
}

function applyPassClaim(state: GameState, action: PassClaimAction): ApplyResult {
  const next = registerPass(state, action.player);
  if (next.pendingClaim && next.pendingClaim.pending.length === 0) {
    return resolveClaimWindow(next);
  }
  return { ok: true, state: next, events: [] };
}

export function applyAction(state: GameState, action: GameAction): ApplyResult {
  const error = validateAction(state, action);
  if (error) {
    return { ok: false, error };
  }
  switch (action.type) {
    case 'DEAL':
      return applyDeal(state, action);
    case 'DRAW':
      return applyDraw(state, action);
    case 'DISCARD':
      return applyDiscard(state, action);
    case 'DECLARE_WIN':
      return applyDeclareWin(state, action);
    case 'CLAIM_CHOW':
      return applyClaimChow(state, action);
    case 'CLAIM_PONG':
      return applyClaimPong(state, action);
    case 'CLAIM_KONG':
      return applyClaimKong(state, action);
    case 'PASS_CLAIM':
      return applyPassClaim(state, action);
    default: {
      const unknown = action as GameAction;
      return {
        ok: false,
        error: gameError('UNKNOWN_ACTION', unknown, 'unknown action type'),
      };
    }
  }
}
