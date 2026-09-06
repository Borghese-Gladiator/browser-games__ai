import { describe, it, expect } from 'vitest';
import type { Tile } from '../tiles/tile.js';
import type { FlowerKind } from '../tiles/tile.js';
import { DEFAULT_TAIWANESE_RULES, winningHandSize } from '../rules/taiwanese.js';
import { tiles } from '../hand/test-helpers.js';
import type { GameConfig, GameState, PlayerState } from './state.js';
import { getPlayer, withPlayer } from './state.js';
import { createGame, dealHand, replaceFlowers } from './deal.js';
import { applyAction } from './reducer.js';

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

describe('createGame', () => {
  it('builds a full shuffled wall in the DEALING phase', () => {
    const state = createGame(config());
    expect(state.phase).toBe('DEALING');
    expect(state.wall.tiles).toHaveLength(144);
    expect(state.wall.drawIndex).toBe(0);
    expect(state.wall.replacementIndex).toBe(143);
    expect(state.players).toHaveLength(rules.playerCount);
    expect(state.nextSeq).toBe(0);
  });

  it('is deterministic for the same seed', () => {
    const a = createGame(config({ seed: 'same' }));
    const b = createGame(config({ seed: 'same' }));
    expect(a.wall.tiles.map((tile) => tile.id)).toEqual(b.wall.tiles.map((tile) => tile.id));
  });
});

describe('dealHand', () => {
  it('leaves the dealer holding the winning size in NEEDS_DISCARD', () => {
    const state = dealtGame();
    expect(state.phase).toBe('PLAYING');
    expect(state.turn.player).toBe(0);
    expect(state.turn.phase).toBe('NEEDS_DISCARD');
    expect(getPlayer(state, 0).hand).toHaveLength(winningHandSize(rules));
    for (let player = 1; player < rules.playerCount; player++) {
      expect(getPlayer(state, player as 1 | 2 | 3).hand).toHaveLength(rules.concealedHandSize);
    }
  });

  it('replaces every flower from the dealt hands', () => {
    const state = dealtGame('flower-seed');
    for (const player of state.players) {
      expect(player.hand.some((tile) => tile.suit === 'flower')).toBe(false);
    }
    const replacedCount = state.events.filter((event) => event.type === 'FLOWER_REPLACED').length;
    const flowersHeld = state.players.reduce((sum, player) => sum + player.flowers.length, 0);
    expect(flowersHeld).toBe(replacedCount);
  });
});

describe('replaceFlowers', () => {
  it('moves flowers aside, draws replacements, and terminates on recursion', () => {
    const wallTiles = tiles('6s 5s 3p'); // consumed from the dead tail, last first
    const replacementFlower = flower('winter');
    const base = createGame(config());
    const withWall: GameState = {
      ...base,
      wall: { tiles: [...wallTiles, replacementFlower], drawIndex: 0, replacementIndex: 3 },
    };
    const player: PlayerState = {
      hand: [flower('spring'), tiles('5m')[0], flower('autumn')],
      melds: [],
      flowers: [],
      discards: [],
    };
    const seeded = withPlayer(withWall, 0, player);

    const result = replaceFlowers(seeded, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.exhausted).toBe(false);
    const held = getPlayer(result.state, 0);
    expect(held.hand.some((tile) => tile.suit === 'flower')).toBe(false);
    expect(held.hand).toHaveLength(3);
    expect(held.flowers.map((tile) => tile.flower)).toEqual(['spring', 'autumn', 'winter']);
    expect(result.events).toHaveLength(3);
    expect(result.events.every((event) => event.type === 'FLOWER_REPLACED')).toBe(true);
  });

  it('reveals the flower and reports an exhaustive draw when the replacement supply is empty', () => {
    const base = createGame(config());
    const emptyReplacement: GameState = {
      ...base,
      wall: { tiles: base.wall.tiles, drawIndex: 5, replacementIndex: 4 },
    };
    const player: PlayerState = {
      hand: [flower('spring'), tiles('5m')[0]],
      melds: [],
      flowers: [],
      discards: [],
    };
    const seeded = withPlayer(emptyReplacement, 0, player);

    const result = replaceFlowers(seeded, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.exhausted).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('FLOWER_REPLACED');
    const held = getPlayer(result.state, 0);
    expect(held.hand.some((tile) => tile.suit === 'flower')).toBe(false);
    expect(held.hand).toHaveLength(1);
    expect(held.flowers.map((tile) => tile.flower)).toEqual(['spring']);
  });
});
