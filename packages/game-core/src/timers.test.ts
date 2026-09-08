import { describe, it, expect } from 'vitest';
import { isTurnExpired, decideTimeout } from './timers.js';
import type { Adapter, EngineState } from './types.ts';

const asAdapter = (a: Partial<Adapter<EngineState>>): Adapter<EngineState> =>
  a as unknown as Adapter<EngineState>;
const state: EngineState = { players: [] };

describe('isTurnExpired', () => {
  it('is false with no active turn', () => {
    expect(isTurnExpired(null, 1000, 500)).toBe(false);
  });
  it('is false before the budget elapses', () => {
    expect(isTurnExpired(1000, 1400, 500)).toBe(false);
  });
  it('is true at/after the budget', () => {
    expect(isTurnExpired(1000, 1500, 500)).toBe(true);
    expect(isTurnExpired(1000, 9000, 500)).toBe(true);
  });
});

// Adapter stub: seat 2 is to act; the timeout action folds that seat.
const adapter = asAdapter({
  activeSeat: () => 2,
  timeoutAction: (_state, seat) => ({ action: { type: 'fold' }, seat }),
});

const opts = { graceMs: 10000, forfeitMs: 60000 };

describe('decideTimeout', () => {
  it('does nothing when there is no active seat', () => {
    const noTurn = asAdapter({ activeSeat: () => -1, timeoutAction: () => ({}) });
    const out = decideTimeout(
      { state, adapter: noTurn, turnStartedAt: 0, liveSeats: new Set() },
      { now: 999999, ...opts },
    );
    expect(out).toBeNull();
  });

  it('auto-acts for a DARK seat once the grace window lapses', () => {
    const out = decideTimeout(
      { state, adapter, turnStartedAt: 0, liveSeats: new Set([0, 1, 3]) },
      { now: 10000, ...opts },
    );
    expect(out).toMatchObject({ seat: 2, reason: 'disconnect' });
    expect((out!.msg.action as { type: string }).type).toBe('fold');
  });

  it('does NOT act for a dark seat before the grace window', () => {
    const out = decideTimeout(
      { state, adapter, turnStartedAt: 0, liveSeats: new Set([0, 1, 3]) },
      { now: 5000, ...opts },
    );
    expect(out).toBeNull();
  });

  it('does NOT act for a LIVE (present) seat within the forfeit window', () => {
    const out = decideTimeout(
      { state, adapter, turnStartedAt: 0, liveSeats: new Set([0, 1, 2, 3]) },
      { now: 20000, ...opts },
    );
    expect(out).toBeNull();
  });

  it('forfeits even a present-but-idle seat past the forfeit window', () => {
    const out = decideTimeout(
      { state, adapter, turnStartedAt: 0, liveSeats: new Set([0, 1, 2, 3]) },
      { now: 60000, ...opts },
    );
    expect(out).toMatchObject({ seat: 2, reason: 'idle' });
  });

  it('returns null when the adapter has no timeout action', () => {
    const noAction = asAdapter({ activeSeat: () => 2, timeoutAction: () => null });
    const out = decideTimeout(
      { state, adapter: noAction, turnStartedAt: 0, liveSeats: new Set() },
      { now: 99999, ...opts },
    );
    expect(out).toBeNull();
  });
});
