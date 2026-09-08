import { describe, it, expect } from 'vitest';
import { hashState } from './observability.js';

describe('hashState', () => {
  it('is deterministic for the same input', () => {
    const state = { phase: 'active', players: [{ id: 'a' }] };
    expect(hashState(state)).toBe(hashState(state));
  });

  it('produces different hashes for different states', () => {
    expect(hashState({ phase: 'a' })).not.toBe(hashState({ phase: 'b' }));
  });

  it('produces a 16-char hex string', () => {
    const h = hashState({ x: 1 });
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
