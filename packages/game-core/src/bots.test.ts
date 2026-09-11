import { describe, it, expect } from 'vitest';
import { makeBot, botActionFor } from './bots.js';
import type { Adapter, EngineState } from './types.ts';

const baseAdapter: Adapter<EngineState> = {
  engine: {
    createGame: () => ({ players: [] }),
    addPlayer: (s) => s,
    publicState: (s) => s,
  },
  minPlayers: 2,
  maxPlayers: 4,
  onMessage: (s) => s,
};
const asAdapter = (a: Partial<Adapter<EngineState>>): Adapter<EngineState> => ({
  ...baseAdapter,
  ...a,
});
const state: EngineState = { players: [] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('makeBot', () => {
  it('produces a UUID id and a numbered name', () => {
    const b = makeBot(0);
    expect(b.id).toMatch(UUID_RE);
    expect(b.name).toBe('Bot 1');
  });
});

describe('botActionFor', () => {
  const adapter = asAdapter({
    botMove: (_state, seat) => ({ cardId: `from-${seat}` }),
  });

  it('returns the adapter move for a pending bot seat', () => {
    expect(botActionFor(state, adapter, new Set([1]), new Set([1]))).toEqual([
      { seat: 1, msg: { cardId: 'from-1' } },
    ]);
  });

  it('returns [] when the pending seat is not a bot', () => {
    expect(botActionFor(state, adapter, new Set([0, 2]), new Set([1]))).toEqual([]);
  });

  it('returns [] when there are no pending seats', () => {
    expect(botActionFor(state, adapter, new Set([0, 1, 2, 3]), new Set())).toEqual([]);
  });

  it('iterates every pending bot seat and returns one intent each', () => {
    const out = botActionFor(state, adapter, new Set([1, 3]), new Set([1, 2, 3]));
    expect(out).toEqual([
      { seat: 1, msg: { cardId: 'from-1' } },
      { seat: 3, msg: { cardId: 'from-3' } },
    ]);
  });

  it('skips a pending bot seat the adapter declines', () => {
    const picky = asAdapter({ botMove: (_state, seat) => (seat === 2 ? { play: seat } : null) });
    expect(botActionFor(state, picky, new Set([1, 2]), new Set([1, 2]))).toEqual([
      { seat: 2, msg: { play: 2 } },
    ]);
  });
});
