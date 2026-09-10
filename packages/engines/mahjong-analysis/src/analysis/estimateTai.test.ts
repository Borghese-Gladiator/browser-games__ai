import { describe, it, expect } from 'vitest';
import { estimateTai } from './estimateTai.ts';
import { RULESET } from './ruleset.ts';
import type { Meld, Position, TaiEstimate, Wind } from './types.ts';

function kinds(spec: string): string[] {
  return spec.trim().split(/\s+/);
}

function pong(kind: string, concealed = false): Meld {
  return { tiles: [kind, kind, kind], type: 'pong', concealed };
}

function position(overrides: Partial<Position>): Position {
  return {
    concealedTiles: [],
    exposedMelds: [],
    flowers: [],
    seatWind: 'east',
    roundWind: 'east',
    isDealer: false,
    ruleset: RULESET,
    ...overrides,
  };
}

function ids(patterns: TaiEstimate['guaranteed']): Set<string> {
  return new Set(patterns.map((pattern) => pattern.id));
}

function isSubset(inner: Set<string>, outer: Set<string>): boolean {
  return [...inner].every((id) => outer.has(id));
}

// A dealer, fully concealed, tenpai hand: four chows, one concealed dragon
// triplet and a floating tile waiting to pair.
const DEALER_HAND = position({
  concealedTiles: kinds('1m 2m 3m 4m 5m 6m 7m 8m 9m 2s 3s 4s red red red 7p'),
  seatWind: 'east',
  roundWind: 'east',
  isDealer: true,
});

describe('estimateTai', () => {
  it('forbids the concealed hand pattern in every tier when a meld is exposed', () => {
    const estimate = estimateTai(
      position({
        exposedMelds: [pong('5m')],
        concealedTiles: kinds('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s east east'),
        seatWind: 'south',
        roundWind: 'west',
      }),
    );
    expect(ids(estimate.guaranteed).has('concealed_hand')).toBe(false);
    expect(ids(estimate.onTrack).has('concealed_hand')).toBe(false);
    expect(ids(estimate.potential).has('concealed_hand')).toBe(false);
  });

  it('reports the dealer pattern in guaranteed and thus every tier', () => {
    const estimate = estimateTai(DEALER_HAND);
    expect(ids(estimate.guaranteed).has('dealer')).toBe(true);
    expect(ids(estimate.onTrack).has('dealer')).toBe(true);
    expect(ids(estimate.potential).has('dealer')).toBe(true);
    const dealer = estimate.potential.find((pattern) => pattern.id === 'dealer');
    expect(dealer?.tier).toBe('guaranteed');
  });

  it('nests the tiers and never decreases the cumulative tai total', () => {
    const estimate = estimateTai(DEALER_HAND);
    const guaranteed = ids(estimate.guaranteed);
    const onTrack = ids(estimate.onTrack);
    const potential = ids(estimate.potential);
    expect(isSubset(guaranteed, onTrack)).toBe(true);
    expect(isSubset(onTrack, potential)).toBe(true);
    expect(estimate.totals.onTrack).toBeGreaterThanOrEqual(estimate.totals.guaranteed);
    expect(estimate.totals.potential).toBeGreaterThanOrEqual(estimate.totals.onTrack);
  });

  it('omits a pattern that is unreachable within the search bound', () => {
    const estimate = estimateTai(
      position({
        concealedTiles: kinds('1m 2m 3m 4m 5m 6m 7m 8m 9m 1p 2p 3p 4p 5p 6p 7p'),
        seatWind: 'south',
        roundWind: 'west',
      }),
    );
    const potential = ids(estimate.potential);
    expect(potential.has('dragon_triplet')).toBe(false);
    expect(potential.has('seat_wind')).toBe(false);
    expect(potential.has('round_wind')).toBe(false);
  });

  it('depends on public information only', () => {
    interface HiddenState {
      concealedTiles: string[];
      exposedMelds: Meld[];
      flowers: string[];
      seatWind: Wind;
      roundWind: Wind;
      isDealer: boolean;
      otherHands: string[][];
      wall: string[];
    }
    const toPosition = (state: HiddenState): Position =>
      position({
        concealedTiles: state.concealedTiles,
        exposedMelds: state.exposedMelds,
        flowers: state.flowers,
        seatWind: state.seatWind,
        roundWind: state.roundWind,
        isDealer: state.isDealer,
      });

    const base: HiddenState = {
      concealedTiles: kinds('1m 2m 3m 4m 5m 6m 7m 8m 9m 2s 3s 4s green green green 7p'),
      exposedMelds: [],
      flowers: ['plum'],
      seatWind: 'east',
      roundWind: 'south',
      isDealer: false,
      otherHands: [kinds('1p 1p 1p'), kinds('9s 9s')],
      wall: kinds('5m 6m red white'),
    };
    const erased: HiddenState = { ...base, otherHands: [], wall: [] };

    expect(estimateTai(toPosition(base))).toEqual(estimateTai(toPosition(erased)));
  });

  it('estimates a typical 16-tile hand well under 50 ms', () => {
    const hand = position({
      concealedTiles: kinds('1s 2s 3s 4s 5s 6s 7s 8s 9s 1p 2p 3p green green green 5p'),
      seatWind: 'south',
      roundWind: 'south',
    });
    const start = performance.now();
    estimateTai(hand);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
