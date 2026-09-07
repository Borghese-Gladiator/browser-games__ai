import { describe, it, expect } from 'vitest';
import {
  createDeck,
  shuffle,
  evaluate5,
  best7,
  compareHands,
} from './handEval.js';

describe('createDeck', () => {
  it('returns 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });
});

describe('shuffle', () => {
  it('returns the same cards without mutating the input', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled)).toEqual(new Set(deck));
    expect(deck).toEqual(createDeck()); // original unchanged
  });
});

describe('evaluate5', () => {
  const cases: Array<[string, string[], number]> = [
    ['high card', ['As', 'Td', '9c', '5h', '2s'], 0],
    ['one pair', ['As', 'Ad', '9c', '5h', '2s'], 1],
    ['two pair', ['As', 'Ad', '9c', '9h', '2s'], 2],
    ['three of a kind', ['As', 'Ad', 'Ac', '9h', '2s'], 3],
    ['straight', ['5s', '6d', '7c', '8h', '9s'], 4],
    ['wheel straight (A-2-3-4-5)', ['As', '2d', '3c', '4h', '5s'], 4],
    ['flush', ['As', 'Ts', '9s', '5s', '2s'], 5],
    ['full house', ['As', 'Ad', 'Ac', '9h', '9s'], 6],
    ['four of a kind', ['As', 'Ad', 'Ac', 'Ah', '9s'], 7],
    ['straight flush', ['5s', '6s', '7s', '8s', '9s'], 8],
  ];
  it.each(cases)('detects %s', (_label, cards, rank) => {
    expect(evaluate5(cards).rank).toBe(rank);
  });
});

describe('best7', () => {
  it('finds a straight flush within 7 cards', () => {
    const h = best7(['5s', '6s', '7s', '8s', '9s', 'Kd', '2c']);
    expect(h.rank).toBe(8);
  });

  it('finds the best hand (full house) among distractors', () => {
    const h = best7(['As', 'Ad', 'Ac', '9h', '9s', '2c', '5d']);
    expect(h.rank).toBe(6);
  });
});

describe('compareHands', () => {
  it('straight flush beats four of a kind', () => {
    const sf = evaluate5(['5s', '6s', '7s', '8s', '9s']);
    const quads = evaluate5(['As', 'Ad', 'Ac', 'Ah', '9s']);
    expect(compareHands(sf, quads)).toBe(1);
  });

  it('pair of aces beats pair of kings', () => {
    const aces = evaluate5(['As', 'Ad', '9c', '5h', '2s']);
    const kings = evaluate5(['Ks', 'Kd', '9c', '5h', '2s']);
    expect(compareHands(aces, kings)).toBe(1);
  });

  it('identical hands tie', () => {
    const a = evaluate5(['As', 'Ad', '9c', '5h', '2s']);
    const b = evaluate5(['Ah', 'Ac', '9d', '5s', '2c']);
    expect(compareHands(a, b)).toBe(0);
  });

  it('higher kicker wins with same pair', () => {
    const a = evaluate5(['As', 'Ad', 'Kc', '5h', '2s']);
    const b = evaluate5(['Ah', 'Ac', 'Qd', '5s', '2c']);
    expect(compareHands(a, b)).toBe(1);
  });
});
