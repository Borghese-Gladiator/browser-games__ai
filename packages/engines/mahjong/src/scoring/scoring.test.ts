import { describe, it, expect } from 'vitest';
import { TAI_VALUES as CATALOGUE } from '@browser-games/engine-mahjong-analysis';
import type { Tile, FlowerKind } from '../tiles/tile.ts';
import type { Wind } from '../game/state.ts';
import { tiles, meld } from '../hand/test-helpers.ts';
import type { ScoreContext } from './scoring.ts';
import { scoreHand } from './scoring.ts';

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

  it.each<{ name: string; ctx: ScoreContext; expected: number; ids: string[] }>([
    {
      name: 'plain hand, discard, non-dealer scores zero',
      ctx: context({ hand: { concealed: tiles(BASE_HAND), exposedMelds: [] } }),
      expected: 0,
      ids: [],
    },
    {
      name: 'self-draw adds self-draw tai',
      ctx: context({ hand: { concealed: tiles(BASE_HAND), exposedMelds: [] }, selfDraw: true }),
      expected: CATALOGUE.self_draw.tai,
      ids: ['self_draw'],
    },
    {
      name: 'dealer adds dealer tai',
      ctx: context({ hand: { concealed: tiles(BASE_HAND), exposedMelds: [] }, isDealer: true }),
      expected: CATALOGUE.dealer.tai,
      ids: ['dealer'],
    },
    {
      name: 'self-draw and dealer stack',
      ctx: context({
        hand: { concealed: tiles(BASE_HAND), exposedMelds: [] },
        selfDraw: true,
        isDealer: true,
      }),
      expected: CATALOGUE.self_draw.tai + CATALOGUE.dealer.tai,
      ids: ['self_draw', 'dealer'],
    },
    {
      name: 'all-triplets scores all-triplets tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 1m 1m 5m 5m 5m 9m 9m 9m 4s 4s 4s 5p 5p 5p east east'),
          exposedMelds: [],
        },
      }),
      expected: CATALOGUE.all_triplets.tai,
      ids: ['all_triplets'],
    },
    {
      name: 'full-flush scores full flush tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1m 2m 3m 4m 5m 6m 7m 7m'),
          exposedMelds: [],
        },
      }),
      expected: CATALOGUE.full_flush.tai,
      ids: ['full_flush'],
    },
    {
      name: 'half-flush scores half flush tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1m 2m 3m east east east red red'),
          exposedMelds: [],
        },
      }),
      expected: CATALOGUE.half_flush.tai,
      ids: ['half_flush'],
    },
    {
      name: 'seven-pairs scores seven pairs tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 1m 1m 3m 3m 5m 5m 7m 7m 9m 9m 1s 1s 3s 3s east east'),
          exposedMelds: [],
        },
      }),
      expected: CATALOGUE.seven_pairs.tai,
      ids: ['seven_pairs'],
    },
    {
      name: 'flowers add flower tai and seat-matching flower tai',
      ctx: context({
        hand: { concealed: tiles(BASE_HAND), exposedMelds: [] },
        seatWind: 'E',
        flowers: [flower('spring'), flower('summer')],
      }),
      expected: CATALOGUE.flower.tai * 2 + CATALOGUE.seat_flower.tai,
      ids: ['flower', 'seat_flower'],
    },
    {
      name: 'exposed meld all-triplets scores all-triplets tai',
      ctx: context({
        hand: {
          concealed: tiles('1m 1m 1m 5m 5m 5m 9m 9m 9m 4s 4s 4s east east'),
          exposedMelds: [meld('pong', '5p 5p 5p')],
        },
      }),
      expected: CATALOGUE.all_triplets.tai,
      ids: ['all_triplets'],
    },
  ])('$name', ({ ctx, expected, ids }) => {
    const result = scoreHand(ctx);
    expect(result).not.toBeNull();
    expect(result?.totalTai).toBe(expected);
    expect(result?.patterns.map((one) => one.id).sort()).toEqual([...ids].sort());
  });

  it('carries english, chinese, and tai straight from the analysis catalogue', () => {
    const result = scoreHand(
      context({
        hand: {
          concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1m 2m 3m 4m 5m 6m 7m 7m'),
          exposedMelds: [],
        },
      }),
    );
    expect(result).not.toBeNull();
    const fullFlush = result?.patterns.find((one) => one.id === 'full_flush');
    expect(fullFlush).toEqual({
      id: 'full_flush',
      english: CATALOGUE.full_flush.english,
      chinese: CATALOGUE.full_flush.chinese,
      tai: CATALOGUE.full_flush.tai,
    });
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
    expect(result?.totalTai).toBe(CATALOGUE.all_triplets.tai);
    expect(result?.patterns.map((one) => one.id)).toContain('all_triplets');
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
    expect(result?.totalTai).toBe(CATALOGUE.full_flush.tai + CATALOGUE.all_triplets.tai);
    expect(result?.patterns.map((one) => one.id).sort()).toEqual(['all_triplets', 'full_flush']);
  });
});
