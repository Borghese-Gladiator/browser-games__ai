import { describe, it, expect } from 'vitest';
import { applyOptimistic, reconcile } from './optimistic.ts';

describe('applyOptimistic', () => {
  it('returns reduce(state, action)', () => {
    const reduce = (state: { count: number }, action: { by: number }) => ({
      ...state,
      count: state.count + action.by,
    });
    expect(applyOptimistic({ count: 1 }, { by: 2 }, reduce)).toEqual({ count: 3 });
  });
});

describe('reconcile', () => {
  it('returns the authoritative server state, rolling back local prediction', () => {
    const server = { count: 5 };
    const local = { count: 99 };
    expect(reconcile(server, { by: 1 }, local)).toBe(server);
  });
});
