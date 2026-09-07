import { describe, it, expect } from 'vitest';
import { tiles } from '../hand/test-helpers.js';
import type { Tile } from '../tiles/tile.js';
import type { Meld } from '../tiles/meld.js';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.js';
import type { GameAction } from '../game/actions.js';
import type { GameState, PlayerId, PlayerState } from '../game/state.js';
import { createGame } from '../game/deal.js';
import { applyAction } from '../game/reducer.js';
import { getAvailableActions } from '../game/getAvailableActions.js';
import { createStandardAi, evaluateDiscards, shouldClaimPong } from './standard.js';
import { createRng } from './random.js';

function chooseActingSeat(state: GameState): PlayerId | null {
  if (state.pendingClaim) {
    for (const seat of state.pendingClaim.pending) {
      if (getAvailableActions(state, seat).length > 0) {
        return seat;
      }
    }
    return null;
  }
  const turnSeat = state.turn.player;
  if (getAvailableActions(state, turnSeat).length > 0) {
    return turnSeat;
  }
  for (let seat = 0; seat < state.rules.playerCount; seat++) {
    if (getAvailableActions(state, seat as PlayerId).length > 0) {
      return seat as PlayerId;
    }
  }
  return null;
}

function claimState(hand: Tile[], melds: Meld[], discard: Tile, seat: PlayerId): GameState {
  const empty: PlayerState = { hand: [], melds: [], flowers: [], discards: [] };
  const players: PlayerState[] = [empty, empty, empty, empty];
  players[seat] = { hand, melds, flowers: [], discards: [] };
  return {
    rules: DEFAULT_TAIWANESE_RULES,
    players,
    pendingClaim: {
      discard: { player: 0, tile: discard },
      eligible: [],
      declarations: [],
      pending: [seat],
    },
  } as unknown as GameState;
}

describe('createStandardAi', () => {
  it('always returns a legal action across full games', () => {
    const ai = createStandardAi();
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      let state = createGame({
        rules: DEFAULT_TAIWANESE_RULES,
        seed,
        dealer: 0,
        roundWind: 'E',
      });
      const dealt = applyAction(state, { type: 'DEAL' });
      expect(dealt.ok).toBe(true);
      if (!dealt.ok) {
        return;
      }
      state = dealt.state;
      let steps = 0;
      while (state.phase === 'PLAYING' && steps < 5000) {
        steps += 1;
        const seat = chooseActingSeat(state);
        if (seat === null) {
          break;
        }
        const actions = getAvailableActions(state, seat);
        const action = ai(state, actions, rng);
        expect(actions).toContain(action);
        const result = applyAction(state, action);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        state = result.state;
      }
    }
  });

  it('declares a win when a winning action is available', () => {
    const ai = createStandardAi();
    const state = claimState([], [], tiles('1m')[0], 0);
    const actions: GameAction[] = [
      { type: 'DECLARE_WIN', player: 0 },
      { type: 'DISCARD', player: 0, tile: tiles('2m')[0] },
    ];
    const action = ai(state, actions, createRng(1));
    expect(action.type).toBe('DECLARE_WIN');
  });

  it('claims a clearly-improving pong', () => {
    const ai = createStandardAi();
    const hand = tiles('west west 1m 2m 3m 4m 5m 6m 7m 8m 9m 9s 9s 3p 5p 1s');
    const discard = tiles('west')[0];
    const state = claimState(hand, [], discard, 1);
    const actions: GameAction[] = [
      { type: 'CLAIM_PONG', player: 1 },
      { type: 'PASS_CLAIM', player: 1 },
    ];
    const action = ai(state, actions, createRng(1));
    expect(action.type).toBe('CLAIM_PONG');
  });

  it('declines a clearly non-improving pong', () => {
    const ai = createStandardAi();
    const hand = tiles('west west 1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 6p 7p');
    const discard = tiles('west')[0];
    const state = claimState(hand, [], discard, 1);
    const actions: GameAction[] = [
      { type: 'CLAIM_PONG', player: 1 },
      { type: 'PASS_CLAIM', player: 1 },
    ];
    const action = ai(state, actions, createRng(1));
    expect(action.type).toBe('PASS_CLAIM');
  });
});

describe('shouldClaimPong', () => {
  it('accepts a pong that lowers the completion distance', () => {
    const hand = tiles('west west 1m 2m 3m 4m 5m 6m 7m 8m 9m 9s 9s 3p 5p 1s');
    const improving = shouldClaimPong(
      { concealed: hand, exposedMelds: [] },
      tiles('west')[0],
    );
    expect(improving).toBe(true);
  });

  it('rejects a pong that does not lower the completion distance', () => {
    const hand = tiles('west west 1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 6p 7p');
    const improving = shouldClaimPong(
      { concealed: hand, exposedMelds: [] },
      tiles('west')[0],
    );
    expect(improving).toBe(false);
  });
});

describe('evaluateDiscards', () => {
  it('ranks an isolated honor above a connected tile', () => {
    const hand = tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 4s 5s east');
    const evaluations = evaluateDiscards({ concealed: hand, exposedMelds: [] });
    expect(evaluations[0].kind).toBe('east');
  });
});
