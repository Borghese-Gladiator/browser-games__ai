import { describe, it, expect } from 'vitest';
import type { Tile } from '../tiles/tile.ts';
import type { TileKind } from '../tiles/tile-kind.ts';
import { kindToTile } from '../hand/test-helpers.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import type { GameConfig, GameState, PlayerState } from './state.ts';
import { createGame } from './deal.ts';
import { applyAction } from './reducer.ts';
import { getAvailableActions } from './getAvailableActions.ts';

const rules = DEFAULT_TAIWANESE_RULES;

let counter = 0;
function u(kind: TileKind): Tile {
  counter += 1;
  return kindToTile(kind, counter);
}
function h(spec: string): Tile[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => u(token as TileKind));
}
function player(hand: Tile[]): PlayerState {
  return { hand, melds: [], flowers: [], discards: [] };
}
function config(): GameConfig {
  return { rules, seed: 'actions', dealer: 0, roundWind: 'E' };
}
function playing(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  const start = createGame(config());
  return {
    ...start,
    phase: 'PLAYING',
    players,
    currentPlayer: 0,
    turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: null },
    ...overrides,
  };
}

describe('getAvailableActions', () => {
  it('offers only a draw when the seat needs to draw', () => {
    const state = playing([player(h('1m 2m'))], {
      turn: { phase: 'NEEDS_DRAW', player: 0, drawnTile: null },
    });
    const actions = getAvailableActions(state, 0);
    expect(actions).toEqual([{ type: 'DRAW', player: 0 }]);
    expect(getAvailableActions(state, 1)).toEqual([]);
  });

  it('offers a discard for each tile plus a concealed kong when four match', () => {
    const state = playing([player(h('5p 5p 5p 5p 1m'))]);
    const actions = getAvailableActions(state, 0);
    expect(actions.filter((action) => action.type === 'DISCARD')).toHaveLength(5);
    expect(actions.some((action) => action.type === 'CLAIM_KONG')).toBe(true);
  });

  it('offers a win when the hand is complete on the seat turn', () => {
    const state = playing([
      player(h('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east east')),
    ]);
    const actions = getAvailableActions(state, 0);
    expect(actions.some((action) => action.type === 'DECLARE_WIN')).toBe(true);
  });

  it('offers claim and pass actions to a pending seat and nothing to the rest', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('3p 4p')),
      player(h('5p 5p')),
      player(h('9s')),
    ]);
    const opened = applyAction(state, { type: 'DISCARD', player: 0, tile: discard });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const chow = getAvailableActions(opened.state, 1);
    expect(chow.some((action) => action.type === 'CLAIM_CHOW')).toBe(true);
    expect(chow.some((action) => action.type === 'PASS_CLAIM')).toBe(true);
    const pong = getAvailableActions(opened.state, 2);
    expect(pong.some((action) => action.type === 'CLAIM_PONG')).toBe(true);
    expect(getAvailableActions(opened.state, 3)).toEqual([]);
  });

  it('offers nothing once the hand is finished', () => {
    const state = playing([player(h('1m'))], { phase: 'FINISHED' });
    expect(getAvailableActions(state, 0)).toEqual([]);
  });
});
