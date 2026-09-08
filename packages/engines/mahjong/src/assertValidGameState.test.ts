import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_TAIWANESE_RULES } from './rules/taiwanese.ts';
import type { GameConfig, GameState, PlayerId } from './game/state.ts';
import { createGame } from './game/deal.ts';
import { applyAction } from './game/reducer.ts';
import { getAvailableActions } from './game/getAvailableActions.ts';
import { createRandomAi, createRng } from './ai/random.ts';
import {
  assertValidGameState,
  collectAllTiles,
  InvalidGameStateError,
} from './assertValidGameState.ts';

const rules = DEFAULT_TAIWANESE_RULES;

function config(seed: number): GameConfig {
  return { rules, seed, dealer: 0, roundWind: 'E' };
}

function actingSeat(state: GameState): PlayerId | null {
  if (state.pendingClaim) {
    for (const seat of state.pendingClaim.pending) {
      if (getAvailableActions(state, seat).length > 0) {
        return seat;
      }
    }
    return null;
  }
  for (let seat = 0; seat < rules.playerCount; seat++) {
    if (getAvailableActions(state, seat as PlayerId).length > 0) {
      return seat as PlayerId;
    }
  }
  return null;
}

function playToEnd(seed: number, onState: (state: GameState) => void): GameState {
  const rng = createRng(seed);
  const ai = createRandomAi();
  let state = createGame(config(seed));
  const dealt = applyAction(state, { type: 'DEAL' });
  expect(dealt.ok).toBe(true);
  if (!dealt.ok) {
    return state;
  }
  state = dealt.state;
  onState(state);
  let guard = 0;
  while (state.phase === 'PLAYING' && guard < 5000) {
    guard += 1;
    const seat = actingSeat(state);
    expect(seat).not.toBeNull();
    if (seat === null) {
      break;
    }
    const actions = getAvailableActions(state, seat);
    const action = ai(state, actions, rng);
    const result = applyAction(state, action);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      break;
    }
    state = result.state;
    onState(state);
  }
  return state;
}

describe('assertValidGameState', () => {
  it('accepts a freshly dealt game', () => {
    const state = createGame(config(7));
    const dealt = applyAction(state, { type: 'DEAL' });
    expect(dealt.ok).toBe(true);
    if (dealt.ok) {
      expect(() => assertValidGameState(dealt.state)).not.toThrow();
    }
  });

  it('rejects a duplicated tile in two places', () => {
    const state = createGame(config(3));
    const dealt = applyAction(state, { type: 'DEAL' });
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) {
      return;
    }
    const players = dealt.state.players.slice();
    const stolen = players[1].hand[0];
    players[0] = { ...players[0], hand: [...players[0].hand, stolen] };
    const broken: GameState = { ...dealt.state, players };
    expect(() => assertValidGameState(broken)).toThrow(InvalidGameStateError);
  });

  it('rejects a flower left in a concealed hand', () => {
    const state = createGame(config(3));
    const dealt = applyAction(state, { type: 'DEAL' });
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) {
      return;
    }
    const flower = dealt.state.wall.tiles.find((tile) => tile.suit === 'flower');
    expect(flower).toBeDefined();
    if (!flower) {
      return;
    }
    const { drawIndex, replacementIndex, tiles } = dealt.state.wall;
    const index = tiles.findIndex((tile) => tile.id === flower.id);
    if (index < drawIndex || index > replacementIndex) {
      return;
    }
    const wallTiles = tiles.slice();
    wallTiles.splice(index, 1);
    const players = dealt.state.players.slice();
    players[0] = { ...players[0], hand: [...players[0].hand, flower] };
    const broken: GameState = {
      ...dealt.state,
      players,
      wall: { tiles: wallTiles, drawIndex, replacementIndex: replacementIndex - 1 },
    };
    expect(() => assertValidGameState(broken)).toThrow(/NO_FLOWER_IN_HAND/);
  });

  it('rejects a hand that is too large for its meld count', () => {
    const state = createGame(config(9));
    const dealt = applyAction(state, { type: 'DEAL' });
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) {
      return;
    }
    const { drawIndex, replacementIndex, tiles } = dealt.state.wall;
    const extra = [tiles[drawIndex], tiles[drawIndex + 1]];
    const players = dealt.state.players.slice();
    players[2] = { ...players[2], hand: [...players[2].hand, ...extra] };
    const broken: GameState = {
      ...dealt.state,
      players,
      wall: { tiles, drawIndex: drawIndex + 2, replacementIndex },
    };
    expect(() => assertValidGameState(broken)).toThrow(/HAND_SIZE/);
  });

  it('keeps a constant physical tile count across a whole game', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (seed) => {
        playToEnd(seed, (state) => {
          expect(collectAllTiles(state)).toHaveLength(144);
        });
      }),
      { numRuns: 60 },
    );
  });

  it('never places a physical tile in two places after any legal action sequence', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (seed) => {
        playToEnd(seed, (state) => {
          const ids = collectAllTiles(state).map((tile) => tile.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(() => assertValidGameState(state, { seed })).not.toThrow();
        });
      }),
      { numRuns: 60 },
    );
  });
});
