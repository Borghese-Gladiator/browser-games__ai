import { describe, it, expect } from 'vitest';
import type { Tile } from '../tiles/tile.ts';
import type { FlowerKind } from '../tiles/tile.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import { tiles } from '../hand/test-helpers.ts';
import type { GameConfig, GameState, PlayerState } from './state.ts';
import { getPlayer, withPlayer } from './state.ts';
import { createGame } from './deal.ts';
import { applyAction } from './reducer.ts';
import { validateAction } from './validate.ts';

const rules = DEFAULT_TAIWANESE_RULES;

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return { rules, seed: 'table-1', dealer: 0, roundWind: 'E', ...overrides };
}

function flower(kind: FlowerKind, copy = 1): Tile {
  return { id: `flower-${kind}-${copy}`, suit: 'flower', flower: kind };
}

function dealtGame(seed = 'table-1'): GameState {
  const start = createGame(config({ seed }));
  const result = applyAction(start, { type: 'DEAL' });
  if (!result.ok) {
    throw new Error('deal failed');
  }
  return result.state;
}

describe('validateAction', () => {
  it('rejects a discard from the wrong seat with WRONG_TURN', () => {
    const state = dealtGame();
    const tile = getPlayer(state, 0).hand[0];
    const error = validateAction(state, { type: 'DISCARD', player: 1, tile });
    expect(error?.code).toBe('WRONG_TURN');
  });

  it('rejects a draw in the wrong phase with WRONG_PHASE', () => {
    const state = dealtGame();
    const error = validateAction(state, { type: 'DRAW', player: 0 });
    expect(error?.code).toBe('WRONG_PHASE');
  });

  it('rejects a discard of a tile that is not held with TILE_NOT_IN_HAND', () => {
    const state = dealtGame();
    const missing = flower('plum');
    const error = validateAction(state, { type: 'DISCARD', player: 0, tile: missing });
    expect(error?.code).toBe('TILE_NOT_IN_HAND');
  });

  it('rejects any action after the hand finishes with GAME_OVER', () => {
    const state = dealtGame();
    const winning: PlayerState = {
      hand: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east east'),
      melds: [],
      flowers: [],
      discards: [],
    };
    const seeded = withPlayer(state, 0, winning);
    const won = applyAction(seeded, { type: 'DECLARE_WIN', player: 0 });
    expect(won.ok).toBe(true);
    if (!won.ok) {
      return;
    }
    const after = validateAction(won.state, { type: 'DRAW', player: 1 });
    expect(after?.code).toBe('GAME_OVER');
  });
});
