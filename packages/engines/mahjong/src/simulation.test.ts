import { describe, it, expect } from 'vitest';
import { runSimulation } from './simulation.ts';

describe('runSimulation', () => {
  it('plays a few hundred random games with no crashes or invalid states', () => {
    const stats = runSimulation(300, 1);
    expect(stats.gamesPlayed).toBe(300);
    expect(stats.crashes).toBe(0);
    expect(stats.invalidStates).toBe(0);
    expect(stats.firstFailingSeed).toBeNull();
    expect(stats.completions).toBe(300);
    expect(stats.averageTurns).toBeGreaterThan(0);
  });

  it('is deterministic for a given base seed', () => {
    const first = runSimulation(50, 100);
    const second = runSimulation(50, 100);
    expect(second).toEqual(first);
  });
});
