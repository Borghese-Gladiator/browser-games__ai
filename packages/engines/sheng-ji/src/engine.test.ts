import { describe, it, expect } from 'vitest';
import {
  createDeck,
  isTrumpCard,
  cardPointValue,
  beats,
  legalCards,
  resolveTrick,
  pointsInTrick,
  createGame,
  addPlayer,
  startDeal,
  playCard,
  publicState,
} from './engine.js';

const TS = 'S';
const TR = '2';

function seat4() {
  let g = createGame();
  g = addPlayer(g, { id: 'a', name: 'Alice' });
  g = addPlayer(g, { id: 'b', name: 'Bob' });
  g = addPlayer(g, { id: 'c', name: 'Carol' });
  g = addPlayer(g, { id: 'd', name: 'Dave' });
  return startDeal(g);
}

describe('createDeck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });
});

describe('isTrumpCard', () => {
  it('treats trump rank and trump suit as trumps', () => {
    expect(isTrumpCard('2S', TS, TR)).toBe(true); // trump rank + suit
    expect(isTrumpCard('2H', TS, TR)).toBe(true); // trump rank, off-suit
    expect(isTrumpCard('AS', TS, TR)).toBe(true); // trump suit
    expect(isTrumpCard('AH', TS, TR)).toBe(false); // neither
  });
});

describe('cardPointValue', () => {
  it.each([
    ['5H', 5],
    ['10D', 10],
    ['KH', 10],
    ['AH', 0],
    ['9S', 0],
  ])('%s -> %i', (card, pts) => {
    expect(cardPointValue(card)).toBe(pts);
  });
});

describe('beats — trump beats off-suit and hierarchy', () => {
  it('trump rank in trump suit beats trump rank off-suit', () => {
    expect(beats('2S', '2H', 'trump', TS, TR)).toBe(true); // 1000 > 503
  });
  it('trump rank off-suit beats a plain trump-suit card', () => {
    expect(beats('2H', 'AS', 'trump', TS, TR)).toBe(true); // 503 > 14
  });
  it('lower trump-suit card does not beat higher trump-suit card', () => {
    expect(beats('3S', 'AS', 'trump', TS, TR)).toBe(false); // 3 < 14
  });
  it('a trump beats an off-suit card', () => {
    expect(beats('AS', 'AH', 'trump', TS, TR)).toBe(true);
  });
  it('within led suit, higher rank wins', () => {
    expect(beats('AH', 'KH', 'H', TS, TR)).toBe(true);
  });
  it('a card that neither trumps nor follows cannot win', () => {
    expect(beats('KC', '5H', 'H', TS, TR)).toBe(false);
  });
  it('following the led suit beats an off-suit non-trump', () => {
    expect(beats('5H', 'KC', 'H', TS, TR)).toBe(true);
  });
});

describe('legalCards — follow-suit enforcement', () => {
  it('leading: all cards legal', () => {
    expect(legalCards(['5H', '2S', 'KD'], { plays: [] }, TS, TR)).toEqual(['5H', '2S', 'KD']);
  });
  it('must follow led Hearts when holding Hearts', () => {
    const trick = { plays: [{ seat: 0, card: 'AH' }] };
    expect(legalCards(['5H', 'KD', '2S'], trick, TS, TR)).toEqual(['5H']);
  });
  it('void in led suit: anything legal', () => {
    const trick = { plays: [{ seat: 0, card: 'AH' }] };
    expect(legalCards(['KD', '2S'], trick, TS, TR)).toEqual(['KD', '2S']);
  });
  it('must follow trump when trump is led and holding a trump', () => {
    const trick = { plays: [{ seat: 0, card: 'AS' }] }; // AS is trump
    expect(legalCards(['5H', 'KD', '2H'], trick, TS, TR)).toEqual(['2H']); // 2H is trump (trump rank)
  });
  it('void in trump: anything legal when trump is led', () => {
    const trick = { plays: [{ seat: 0, card: 'AS' }] };
    expect(legalCards(['5H', 'KD'], trick, TS, TR)).toEqual(['5H', 'KD']);
  });
});

describe('resolveTrick', () => {
  it('highest of led suit wins when no trump', () => {
    const plays = [
      { seat: 0, card: 'AH' },
      { seat: 1, card: '5H' },
      { seat: 2, card: 'KH' },
      { seat: 3, card: '3H' },
    ];
    expect(resolveTrick(plays, TS, TR)).toBe(0);
  });
  it('a trump beats the led suit', () => {
    const plays = [
      { seat: 0, card: 'AH' },
      { seat: 1, card: '5H' },
      { seat: 2, card: '3S' },
      { seat: 3, card: 'KH' },
    ];
    expect(resolveTrick(plays, TS, TR)).toBe(2);
  });
  it('trump rank in trump suit beats a plain trump', () => {
    const plays = [
      { seat: 0, card: 'AH' },
      { seat: 1, card: '3S' },
      { seat: 2, card: '2S' },
      { seat: 3, card: 'KH' },
    ];
    expect(resolveTrick(plays, TS, TR)).toBe(2);
  });
});

describe('pointsInTrick', () => {
  it.each([
    [['5H', '10D', 'KS', 'AH'], 25],
    [['3H', '4D', '7S', 'AH'], 0],
    [['5S', '5D', 'KH', '10C'], 30],
  ])('%j -> %i', (cards, pts) => {
    const plays = cards.map((card, seat) => ({ seat, card }));
    expect(pointsInTrick(plays)).toBe(pts);
  });
});

describe('addPlayer', () => {
  it('rejects a 5th player', () => {
    let g = seat4();
    expect(() => addPlayer(g, { id: 'e', name: 'Eve' })).toThrow('table full');
  });
  it('rejects a duplicate name', () => {
    let g = createGame();
    g = addPlayer(g, { id: 'a', name: 'Alice' });
    expect(() => addPlayer(g, { id: 'b', name: 'Alice' })).toThrow('name taken');
  });
});

describe('startDeal', () => {
  it('deals 4 x 13 unique cards and starts play', () => {
    const g = seat4();
    expect(g.phase).toBe('playing');
    expect(g.teamPoints).toEqual([0, 0]);
    const all = g.players.flatMap((p) => p.hand);
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    for (const p of g.players) expect(p.hand).toHaveLength(13);
  });
});

describe('playCard — follow-suit enforcement at runtime', () => {
  it('throws when a player who can follow plays off-suit', () => {
    // Construct a known state manually.
    let g = createGame();
    g.players = [
      { id: 'a', name: 'A', seat: 0, hand: ['AH'] },
      { id: 'b', name: 'B', seat: 1, hand: ['5H', 'KD'] },
      { id: 'c', name: 'C', seat: 2, hand: ['9C'] },
      { id: 'd', name: 'D', seat: 3, hand: ['8C'] },
    ];
    g.trumpSuit = TS;
    g.trumpRank = TR;
    g.phase = 'playing';
    g.activeSeat = 0;

    g = playCard(g, 'a', 'AH'); // seat 0 leads Hearts
    expect(g.activeSeat).toBe(1);
    expect(() => playCard(g, 'b', 'KD')).toThrow('must follow suit'); // B holds 5H
    const ok = playCard(g, 'b', '5H'); // legal
    expect(ok.currentTrick.plays).toHaveLength(2);
  });

  it('rejects playing out of turn', () => {
    const g = seat4();
    const other = g.players.find((p) => p.seat !== g.activeSeat)!;
    expect(() => playCard(g, other.id, other.hand[0])).toThrow('not your turn');
  });
});

describe('publicState', () => {
  it('exposes only the requesting seat hand', () => {
    const g = seat4();
    const view0 = publicState(g, 0);
    expect(view0.myHand).toHaveLength(13);
    const players = view0.players;
    if (!Array.isArray(players)) throw new Error('players is not an array');
    expect(players.every((p) => !('hand' in p))).toBe(true);
    expect(players.every((p) => typeof p.handCount === 'number')).toBe(true);
  });
  it('only the active seat gets legal cards', () => {
    const g = seat4();
    const active = g.activeSeat;
    expect(publicState(g, active).legalCards).not.toHaveLength(0);
    const inactive = (active + 1) % 4;
    expect(publicState(g, inactive).legalCards).toEqual([]);
  });
});

describe('full deal integration', () => {
  it('plays 52 cards, ends with a result and 100 total points', () => {
    let g = seat4();
    for (let i = 0; i < 52; i++) {
      const seat = g.activeSeat;
      const view = publicState(g, seat);
      const card = (view.legalCards as string[])[0];
      g = playCard(g, g.players[seat].id, card);
    }
    expect(g.phase).toBe('deal-over');
    expect(g.completedTricks).toBe(13);
    expect(g.result).not.toBeNull();
    expect(g.teamPoints[0] + g.teamPoints[1]).toBe(100);
    expect([0, 1]).toContain(g.result!.winnerTeam);
  });
});
