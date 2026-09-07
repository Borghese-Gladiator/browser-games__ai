import { describe, it, expect } from 'vitest';
import { makeBot, botActionFor } from './bots.js';
import type { Adapter, EngineState } from './types.ts';

const asAdapter = (a: Partial<Adapter<EngineState>>): Adapter<EngineState> =>
  a as unknown as Adapter<EngineState>;
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
    activeSeat: () => 1,
    botMove: (_state, seat) => ({ cardId: `from-${seat}` }),
  });

  it('returns the adapter move when it is a bot seat to act', () => {
    expect(botActionFor(state, adapter, new Set([1]))).toEqual({ cardId: 'from-1' });
  });

  it('returns null when the active seat is not a bot', () => {
    expect(botActionFor(state, adapter, new Set([0, 2]))).toBeNull();
  });

  it('returns null when no seat is active', () => {
    const idle = asAdapter({ activeSeat: () => -1, botMove: () => ({ cardId: 'x' }) });
    expect(botActionFor(state, idle, new Set([0, 1, 2, 3]))).toBeNull();
  });
});
