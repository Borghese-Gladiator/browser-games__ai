import { isWinningHand } from '../hand/winning.js';
import type {
  DealAction,
  DeclareWinAction,
  DiscardAction,
  DrawAction,
  GameAction,
} from './actions.js';
import type { GameOutcome, GameState } from './state.js';
import { getPlayer, withPlayer } from './state.js';
import type { ApplyResult } from './result.js';
import type { GameEvent } from './events.js';
import { recordEvent } from './events.js';
import { gameError } from './errors.js';
import { dealerContinues, nextTurn } from './turn.js';
import { dealHand, drawFromWall, finishAsDraw, replaceFlowers } from './deal.js';
import { validateAction } from './validate.js';

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
  current = nextTurn(discarded.state);
  const advanced = recordEvent(current, {
    type: 'TURN_ADVANCED',
    player: current.turn.player,
    phase: 'NEEDS_DRAW',
  });
  current = advanced.state;
  return { ok: true, state: current, events: [discarded.event, advanced.event] };
}

function applyDeclareWin(state: GameState, action: DeclareWinAction): ApplyResult {
  const held = getPlayer(state, action.player);
  const result = isWinningHand({ concealed: held.hand, exposedMelds: held.melds }, state.rules);
  if (!result.winning) {
    return {
      ok: false,
      error: gameError('NOT_A_WINNING_HAND', action, `player ${action.player} has no winning hand`),
    };
  }
  const outcome: GameOutcome = {
    kind: 'WIN',
    winner: action.player,
    dealerRepeats: dealerContinues(state, {
      kind: 'WIN',
      winner: action.player,
      dealerRepeats: false,
    }),
  };
  const finished: GameState = { ...state, phase: 'FINISHED', outcome };
  const won = recordEvent(finished, { type: 'HAND_WON', player: action.player, selfDraw: true });
  return { ok: true, state: won.state, events: [won.event] };
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
    default: {
      const unknown = action as GameAction;
      return {
        ok: false,
        error: gameError('UNKNOWN_ACTION', unknown, 'unknown action type'),
      };
    }
  }
}
