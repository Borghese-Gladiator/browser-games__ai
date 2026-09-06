import { describe, it, expect } from 'vitest';
import type { Tile } from '../../tiles/tile.js';
import type { FlowerKind } from '../../tiles/tile.js';
import { DEFAULT_TAIWANESE_RULES, winningHandSize } from '../../rules/taiwanese.js';
import { tiles } from '../../hand/test-helpers.js';
import type { GameConfig, GameState, PlayerState } from '../state.js';
import { getPlayer, withPlayer, isTerminal } from '../state.js';
import { createGame, dealHand, replaceFlowers } from '../deal.js';
import { applyAction } from '../reducer.js';
import { validateAction } from '../validate.js';

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

function seqNumbers(state: GameState): number[] {
  return state.events.map((event) => event.seq);
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
    const held = getPlayer(result.state, 0);
    expect(held.hand.some((tile) => tile.suit === 'flower')).toBe(false);
    expect(held.hand).toHaveLength(3);
    expect(held.flowers.map((tile) => tile.flower)).toEqual(['spring', 'autumn', 'winter']);
    expect(result.events).toHaveLength(3);
    expect(result.events.every((event) => event.type === 'FLOWER_REPLACED')).toBe(true);
  });
});

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

describe('applyAction DECLARE_WIN', () => {
  it('accepts a complete winning hand and finishes the game', () => {
    const state = dealtGame();
    const winning: PlayerState = {
      hand: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east east'),
      melds: [],
      flowers: [],
      discards: [],
    };
    const seeded = withPlayer(state, 0, winning);
    const result = applyAction(seeded, { type: 'DECLARE_WIN', player: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(isTerminal(result.state)).toBe(true);
    expect(result.state.outcome).toEqual({ kind: 'WIN', winner: 0, dealerRepeats: true });
    expect(result.events.at(-1)?.type).toBe('HAND_WON');
  });

  it('rejects a non-winning hand with NOT_A_WINNING_HAND', () => {
    const state = dealtGame();
    const notWinning: PlayerState = {
      hand: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 7s 9p'),
      melds: [],
      flowers: [],
      discards: [],
    };
    const seeded = withPlayer(state, 0, notWinning);
    const result = applyAction(seeded, { type: 'DECLARE_WIN', player: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('NOT_A_WINNING_HAND');
  });
});

describe('wall exhaustion', () => {
  it('turns an empty live wall into a DRAW outcome', () => {
    const state = dealtGame();
    const emptyWall: GameState = {
      ...state,
      turn: { phase: 'NEEDS_DRAW', player: 1, drawnTile: null },
      currentPlayer: 1,
      wall: { ...state.wall, drawIndex: 5, replacementIndex: 4 },
    };
    const result = applyAction(emptyWall, { type: 'DRAW', player: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.state.phase).toBe('FINISHED');
    expect(result.state.outcome?.kind).toBe('DRAW');
    expect(result.events.at(-1)?.type).toBe('WALL_EXHAUSTED');
  });
});

describe('event sequence numbers', () => {
  it('stay strictly monotonic across actions', () => {
    let state = dealtGame();
    const firstDiscard = getPlayer(state, 0).hand[0];
    const discarded = applyAction(state, { type: 'DISCARD', player: 0, tile: firstDiscard });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) {
      return;
    }
    state = discarded.state;
    const drawn = applyAction(state, { type: 'DRAW', player: 1 });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) {
      return;
    }
    state = drawn.state;
    const expected = Array.from({ length: state.events.length }, (_, index) => index);
    expect(seqNumbers(state)).toEqual(expected);
    expect(state.nextSeq).toBe(state.events.length);
  });
});
