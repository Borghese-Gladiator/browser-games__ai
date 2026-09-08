import { describe, it, expect } from 'vitest';
import type { Tile, FlowerKind } from '../tiles/tile.ts';
import type { Wind } from '../game/state.ts';
import { tiles, meld } from '../hand/test-helpers.ts';
import type { ScoreContext } from './scoring.ts';
import { scoreHand, TAI_VALUES } from './scoring.ts';

function flower(kind: FlowerKind, copy = 1): Tile {
  return { id: `${kind}-${copy}`, suit: 'flower', flower: kind };
}

const BASE_HAND = '1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 1p';

function context(overrides: Partial<ScoreContext> & Pick<ScoreContext, 'hand'>): ScoreContext {
  return {
    selfDraw: false,
    isDealer: false,
    seatWind: 'E' as Wind,
    ...overrides,
  };
}

describe('scoreHand', () => {
  it('returns null for a hand with no winning decomposition', () => {
    const result = scoreHand(
      context({ hand: { concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 2p'), exposedMelds: [] } }),
    );
    expect(result).toBeNull();
  });

  it.each<{ name: string; ctx: ScoreContext; expected: number; patterns: string[] }>([
    {
      name: 'plain hand, discard, non-dealer scores zero',
      ctx: context({ hand: { concealed: tiles(BASE_HAND), exposedMelds: [] } }),
      expected: 0,
      patterns: [],
    },
    {
      name: 'self-draw adds self-draw tai',
      ctx: context({ hand: { concealed: tiles(BASE_HAND), exposedMelds: [] }, selfDraw: true }),
      expected: TAI_VALUES.selfDraw,
      patterns: ['SELF_DRAW'],
    },
    {
      name: 'dealer adds dealer tai',
      ctx: context({ hand: { concealed: tiles(BASE_HAND), exposedMelds: [] }, isDealer: true }),
      expected: TAI_VALUES.dealer,
      patterns: ['DEALER'],
    },
    {
      name: 'self-draw and dealer stack',
      ctx: context({
        hand: { concealed: tiles(BASE_HAND), exposedMelds: [] },
        selfDraw: true,
        isDealer: true,
      }),
      expected: TAI_VALUES.selfDraw + TAI_VALUES.dealer,
      patterns: ['SELF_DRAW', 'DEALER'],
    },
    {
      name: 'all-triplets scores all-triplets tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 1m 1m 5m 5m 5m 9m 9m 9m 4s 4s 4s 5p 5p 5p east east'),
          exposedMelds: [],
        },
      }),
      expected: TAI_VALUES.allTriplets,
      patterns: ['ALL_TRIPLETS'],
    },
    {
      name: 'all-one-suit scores full flush tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1m 2m 3m 4m 5m 6m 7m 7m'),
          exposedMelds: [],
        },
      }),
      expected: TAI_VALUES.allOneSuit,
      patterns: ['ALL_ONE_SUIT'],
    },
    {
      name: 'half-flush scores half flush tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1m 2m 3m east east east red red'),
          exposedMelds: [],
        },
      }),
      expected: TAI_VALUES.halfFlush,
      patterns: ['HALF_FLUSH'],
    },
    {
      name: 'seven-pairs scores seven pairs tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 1m 1m 3m 3m 5m 5m 7m 7m 9m 9m 1s 1s 3s 3s east east'),
          exposedMelds: [],
        },
      }),
      expected: TAI_VALUES.sevenPairs,
      patterns: ['SEVEN_PAIRS'],
    },
    {
      name: 'flowers add flower tai and seat-matching flower tai',
      ctx: context({
        hand: { concealed: tiles(BASE_HAND), exposedMelds: [] },
        seatWind: 'E',
        flowers: [flower('spring'), flower('summer')],
      }),
      expected: TAI_VALUES.flower * 2 + TAI_VALUES.seatFlower,
      patterns: ['FLOWER', 'SEAT_FLOWER'],
    },
    {
      name: 'exposed meld all-triplets scores all-triplets tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 1m 1m 5m 5m 5m 9m 9m 9m 4s 4s 4s east east'),
          exposedMelds: [meld('pong', '5p 5p 5p')],
        },
      }),
      expected: TAI_VALUES.allTriplets,
      patterns: ['ALL_TRIPLETS'],
    },
  ])('$name', ({ ctx, expected, patterns }) => {
    const result = scoreHand(ctx);
    expect(result).not.toBeNull();
    expect(result?.totalTai).toBe(expected);
    expect(result?.patterns.map((one) => one.name).sort()).toEqual([...patterns].sort());
  });

  it('picks the branch with the highest total tai for a multi-decomposition hand', () => {
    const result = scoreHand(
      context({
        hand: {
          concealed: tiles('2m 2m 2m 3m 3m 3m 4m 4m 4m 6p 6p 6p 7s 7s 7s east east'),
          exposedMelds: [],
        },
      }),
    );
    expect(result?.totalTai).toBe(TAI_VALUES.allTriplets);
    expect(result?.patterns.map((one) => one.name)).toContain('ALL_TRIPLETS');
    expect(result?.decomposition.melds.every((one) => one.kind === 'pong' || one.kind === 'kong')).toBe(true);
  });

  it('scores a full-flush all-triplets hand at the best branch', () => {
    const result = scoreHand(
      context({
        hand: {
          concealed: tiles('1m 1m 1m 2m 2m 2m 3m 3m 3m 4m 4m 4m 5m 5m 5m 9m 9m'),
          exposedMelds: [],
        },
      }),
    );
    expect(result?.totalTai).toBe(TAI_VALUES.allOneSuit + TAI_VALUES.allTriplets);
    expect(result?.patterns.map((one) => one.name).sort()).toEqual(['ALL_ONE_SUIT', 'ALL_TRIPLETS']);
  });
});
