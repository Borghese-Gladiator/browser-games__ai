import { describe, it, expect } from 'vitest';
import type { SettlementContext } from './settlement.ts';
import { settle } from './settlement.ts';

const base: SettlementContext = {
  winner: null,
  dealtInSeat: null,
  selfDraw: false,
  exhaustiveDraw: false,
  playerCount: 4,
};

function sum(deltas: readonly number[]): number {
  return deltas.reduce((total, value) => total + value, 0);
}

describe('settle', () => {
  it('makes the discarder pay the full amount on a discard win', () => {
    const deltas = settle(2, { ...base, winner: 1, dealtInSeat: 3 });
    expect(deltas).toEqual([0, 4, 0, -4]);
    expect(sum(deltas)).toBe(0);
  });

  it('yields winner +4 and discarder -4 for a 2 tai discard win', () => {
    const deltas = settle(2, { ...base, winner: 0, dealtInSeat: 2 });
    expect(deltas[0]).toBe(4);
    expect(deltas[2]).toBe(-4);
    expect(deltas[1]).toBe(0);
    expect(deltas[3]).toBe(0);
    expect(sum(deltas)).toBe(0);
  });

  it('makes all three losers pay on a self-draw', () => {
    const deltas = settle(2, { ...base, winner: 2, selfDraw: true });
    expect(deltas).toEqual([-4, -4, 12, -4]);
    expect(sum(deltas)).toBe(0);
  });

  it('transfers nothing on an exhaustive draw', () => {
    const deltas = settle(3, { ...base, exhaustiveDraw: true });
    expect(deltas).toEqual([0, 0, 0, 0]);
    expect(sum(deltas)).toBe(0);
  });
});
