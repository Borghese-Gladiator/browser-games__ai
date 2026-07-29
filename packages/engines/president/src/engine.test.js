import { describe, it, expect } from 'vitest';
import {
  createGame,
  addPlayer,
  startRound,
  applyAction,
  publicState,
  getOutcome,
} from './engine.js';

function seat(n) {
  let state = createGame();
  for (let i = 0; i < n; i++) {
    state = addPlayer(state, { id: `p${i}`, name: `P${i}` });
  }
  return state;
}

// Build a playing state with fixed hands for deterministic assertions.
function withHands(hands) {
  let state = startRound(seat(hands.length));
  state = {
    ...state,
    players: state.players.map((p, i) => ({ ...p, hand: [...hands[i]] })),
    activeSeat: 0,
    currentPlay: null,
    passedSeats: [],
    finishOrder: [],
  };
  return state;
}

const idAt = (state) => state.players[state.activeSeat].id;

describe('addPlayer', () => {
  it('seats 4 players and rejects a 5th', () => {
    const state = seat(4);
    expect(state.players).toHaveLength(4);
    expect(() => addPlayer(state, { id: 'x', name: 'X' })).toThrow('table full');
  });

  it('rejects a duplicate name', () => {
    const state = addPlayer(createGame(), { id: 'a', name: 'Alice' });
    expect(() => addPlayer(state, { id: 'b', name: 'Alice' })).toThrow('name taken');
  });
});

describe('startRound (deal)', () => {
  it('deals the whole 52-card deck across players with no duplicates', () => {
    const state = startRound(seat(4));
    expect(state.phase).toBe('playing');
    const all = state.players.flatMap((p) => p.hand);
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    state.players.forEach((p) => expect(p.hand).toHaveLength(13));
    expect(state.activeSeat).toBe(0);
  });

  it('requires at least 2 players', () => {
    expect(() => startRound(seat(1))).toThrow('at least 2');
  });
});

describe('play / pass turn order', () => {
  it('throws when the wrong player acts', () => {
    const state = withHands([['3c'], ['4c']]);
    expect(() => applyAction(state, 'p1', { cards: ['4c'] })).toThrow('not your turn');
  });

  it('leader may not pass', () => {
    const state = withHands([['3c'], ['4c']]);
    expect(() => applyAction(state, 'p0', { pass: true })).toThrow('cannot pass when leading');
  });

  it('a play advances to the next seat and sets the current play', () => {
    let state = withHands([['3c', '9c'], ['4c']]);
    state = applyAction(state, 'p0', { cards: ['3c'] });
    expect(state.currentPlay.cards).toEqual(['3c']);
    expect(state.activeSeat).toBe(1);
  });
});

describe('beating by higher rank', () => {
  it('accepts a strictly higher single and rejects an equal/lower one', () => {
    let state = withHands([['3c', 'Kc'], ['4c', '2c']]);
    state = applyAction(state, 'p0', { cards: ['3c'] });
    // Equal-or-lower is illegal.
    expect(() => applyAction(state, 'p1', { cards: ['4c'] })).not.toThrow();
    // Reset and try a lower rank against a King (3 players so the round stays live).
    let s2 = withHands([['Kc', '2c'], ['4c'], ['5c']]);
    s2 = applyAction(s2, 'p0', { cards: ['Kc'] });
    expect(() => applyAction(s2, 'p1', { cards: ['4c'] })).toThrow('higher rank');
  });
});

describe('beating by matching multiples', () => {
  it('a pair beats a lower pair, but count must match', () => {
    let state = withHands([['5c', '5d', '9c'], ['6c', '6d', '7c']]);
    state = applyAction(state, 'p0', { cards: ['5c', '5d'] });
    expect(state.currentPlay.count).toBe(2);
    // A single cannot answer a pair.
    expect(() => applyAction(state, 'p1', { cards: ['7c'] })).toThrow('match card count');
    // A higher pair can.
    state = applyAction(state, 'p1', { cards: ['6c', '6d'] });
    expect(state.currentPlay.cards).toEqual(['6c', '6d']);
  });
});

describe('trick reset when all others pass', () => {
  it('the last player to play leads a fresh trick', () => {
    let state = withHands([['3c', 'Ac'], ['4c'], ['5c']]);
    state = applyAction(state, 'p0', { cards: ['3c'] }); // seat 1 to act
    state = applyAction(state, 'p1', { pass: true }); // seat 2 to act
    state = applyAction(state, 'p2', { pass: true }); // all others passed
    expect(state.currentPlay).toBeNull();
    expect(state.activeSeat).toBe(0); // p0 leads again
  });
});

describe('finishing order and role assignment', () => {
  it('records finish order and assigns President / VP / Scum', () => {
    // Seat 0 has a single card; playing it empties the hand -> finishes first.
    let state = withHands([['Kc'], ['4c', '9c'], ['5c', 'Tc'], ['6c', 'Jc']]);
    state = applyAction(state, 'p0', { cards: ['Kc'] }); // p0 out (President)
    expect(state.finishOrder[0]).toBe(0);
    expect(state.players[0].finished).toBe(true);
    // Everyone else passes; trick resets to the next in-play seat (seat 1).
    state = applyAction(state, 'p1', { pass: true });
    state = applyAction(state, 'p2', { pass: true });
    state = applyAction(state, 'p3', { pass: true });
    expect(state.currentPlay).toBeNull();
    expect(state.activeSeat).toBe(1);
    // Seat 1 plays out its 9c then 4c across tricks to finish 2nd (VP).
    state = applyAction(state, 'p1', { cards: ['9c'] });
    state = applyAction(state, 'p2', { pass: true });
    state = applyAction(state, 'p3', { pass: true });
    // trick reset, seat 1 leads again
    state = applyAction(state, 'p1', { cards: ['4c'] }); // p1 out (VP)
    expect(state.finishOrder.slice(0, 2)).toEqual([0, 1]);

    // Drive the rest to completion.
    while (state.phase === 'playing') {
      const seatId = idAt(state);
      const plays = publicState(state, state.activeSeat).legalPlays;
      if (plays.length > 0) state = applyAction(state, seatId, { cards: plays[0] });
      else state = applyAction(state, seatId, { pass: true });
    }
    expect(state.phase).toBe('done');
    expect(state.players[0].role).toBe('President');
    expect(state.players[1].role).toBe('Vice President');
    // The last to finish is Scum.
    const scumSeat = state.finishOrder[state.finishOrder.length - 1];
    expect(state.players[scumSeat].role).toBe('Scum');
  });

  it('getOutcome ranks players by finish order once done', () => {
    let state = withHands([['Kc'], ['4c']]);
    state = applyAction(state, 'p0', { cards: ['Kc'] }); // p0 out -> only p1 left -> done
    expect(state.phase).toBe('done');
    const outcome = getOutcome(state);
    const byId = Object.fromEntries(outcome.outcomes.map((o) => [o.playerId, o]));
    expect(byId.p0.rank).toBe(1);
    expect(byId.p1.rank).toBe(2);
    expect(byId.p0.meta.role).toBe('President');
    expect(byId.p1.meta.role).toBe('Scum');
  });
});

describe('publicState', () => {
  it('exposes only my hand and legal plays for the active seat', () => {
    const state = withHands([['3c', '3d'], ['4c']]);
    const mine = publicState(state, 0);
    expect(mine.myHand).toEqual(['3c', '3d']);
    expect(mine.legalPlays.length).toBeGreaterThan(0);
    const other = publicState(state, 1);
    expect(other.myHand).toEqual(['4c']);
    expect(other.legalPlays).toHaveLength(0); // not their turn
    // No raw hands leak for other players.
    mine.players.forEach((p) => expect(p.hand).toBeUndefined());
  });
});
