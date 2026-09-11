import { describe, it, expect } from 'vitest';
import { isTurnExpired, windowDeadlineExpired, decideTimeout } from './timers.js';
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

describe('windowDeadlineExpired', () => {
  it('is false for an unopened window', () => {
    expect(windowDeadlineExpired(null, 9999, 500)).toBe(false);
  });
  it('is true only once the deadline lapses', () => {
    expect(windowDeadlineExpired(1000, 1400, 500)).toBe(false);
    expect(windowDeadlineExpired(1000, 1500, 500)).toBe(true);
  });
});

// Adapter stub: the timeout action folds the given seat.
const adapter = asAdapter({
  timeoutAction: (_state, seat) => ({ action: { type: 'fold' }, seat }),
});

const opts = { graceMs: 10000, forfeitMs: 60000 };

describe('decideTimeout', () => {
  it('does nothing when there are no pending seats', () => {
    const out = decideTimeout(
      { state, adapter, windowOpenedAt: 0, liveSeats: new Set(), pendingSeats: new Set() },
      { now: 999999, ...opts },
    );
    expect(out).toEqual([]);
  });

  it('auto-acts for a DARK seat once the grace window lapses', () => {
    const out = decideTimeout(
      { state, adapter, windowOpenedAt: 0, liveSeats: new Set([0, 1, 3]), pendingSeats: new Set([2]) },
      { now: 10000, ...opts },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ seat: 2, reason: 'disconnect' });
    expect((out[0].msg.action as { type: string }).type).toBe('fold');
  });

  it('does NOT act for a dark seat before the grace window', () => {
    const out = decideTimeout(
      { state, adapter, windowOpenedAt: 0, liveSeats: new Set([0, 1, 3]), pendingSeats: new Set([2]) },
      { now: 5000, ...opts },
    );
    expect(out).toEqual([]);
  });

  it('does NOT act for a LIVE (present) seat within the forfeit window', () => {
    const out = decideTimeout(
      { state, adapter, windowOpenedAt: 0, liveSeats: new Set([0, 1, 2, 3]), pendingSeats: new Set([2]) },
      { now: 20000, ...opts },
    );
    expect(out).toEqual([]);
  });

  it('forfeits even a present-but-idle seat past the forfeit window', () => {
    const out = decideTimeout(
      { state, adapter, windowOpenedAt: 0, liveSeats: new Set([0, 1, 2, 3]), pendingSeats: new Set([2]) },
      { now: 60000, ...opts },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ seat: 2, reason: 'idle' });
  });

  it('returns [] when the adapter has no timeout action', () => {
    const noAction = asAdapter({ timeoutAction: () => null });
    const out = decideTimeout(
      { state, adapter: noAction, windowOpenedAt: 0, liveSeats: new Set(), pendingSeats: new Set([2]) },
      { now: 99999, ...opts },
    );
    expect(out).toEqual([]);
  });

  it('decides one intent per expired pending seat across a multi-seat window', () => {
    // seats 1,2,3 pending; 1 dark (grace-expired -> disconnect), 3 live (idle,
    // not forfeited -> skipped), 2 dark (disconnect).
    const out = decideTimeout(
      { state, adapter, windowOpenedAt: 0, liveSeats: new Set([0, 3]), pendingSeats: new Set([1, 2, 3]) },
      { now: 10000, ...opts },
    );
    expect(out.map((i) => i.seat).sort()).toEqual([1, 2]);
    expect(out.every((i) => i.reason === 'disconnect')).toBe(true);
  });
});
