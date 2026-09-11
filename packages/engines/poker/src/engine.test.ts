import { describe, it, expect } from 'vitest';
import {
  createGame,
  addPlayer,
  startHand,
  applyAction,
  publicState,
} from './engine.js';

function seatFour() {
  let state = createGame();
  for (let i = 0; i < 4; i++) {
    state = addPlayer(state, { id: `p${i}`, name: `P${i}` });
  }
  return state;
}

describe('addPlayer', () => {
  it('seats 4 players and rejects a 5th', () => {
    const state = seatFour();
    expect(state.players).toHaveLength(4);
    expect(() => addPlayer(state, { id: 'p4', name: 'P4' })).toThrow('table full');
  });

  it('rejects a duplicate name', () => {
    let state = addPlayer(createGame(), { id: 'a', name: 'Alice' });
    expect(() => addPlayer(state, { id: 'b', name: 'Alice' })).toThrow('name taken');
  });
});

describe('startHand', () => {
  it('deals 2 unique hole cards per player and opens pre-flop', () => {
    const state = startHand(seatFour());
    expect(state.phase).toBe('pre-flop');
    expect(state.pot).toBe(0);
    const all = state.players.flatMap((p) => p.holeCards);
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    state.players.forEach((p) => expect(p.holeCards).toHaveLength(2));
  });

  it('action starts left of the dealer', () => {
    const state = startHand(seatFour());
    expect(state.activeSeat).toBe((state.dealer + 1) % 4);
  });
});

describe('applyAction turn order', () => {
  it('throws when the wrong player acts', () => {
    const state = startHand(seatFour());
    const wrongSeat = (state.activeSeat + 1) % 4;
    const wrongId = state.players[wrongSeat].id;
    expect(() => applyAction(state, wrongId, { type: 'check' })).toThrow('not your turn');
  });

  it('throws illegal action for check when a bet is outstanding', () => {
    let state = startHand(seatFour());
    const raiser = state.players[state.activeSeat].id;
    state = applyAction(state, raiser, { type: 'raise' });
    const next = state.players[state.activeSeat].id;
    expect(() => applyAction(state, next, { type: 'check' })).toThrow('illegal action');
  });
});

describe('betting flow', () => {
  it('all four check pre-flop -> flop is dealt', () => {
    let state = startHand(seatFour());
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, state.players[state.activeSeat].id, { type: 'check' });
    }
    expect(state.phase).toBe('flop');
    expect(state.community).toHaveLength(3);
  });

  it('raise sets currentBet and forces others to re-act', () => {
    let state = startHand(seatFour());
    const raiser = state.players[state.activeSeat].id;
    state = applyAction(state, raiser, { type: 'raise' });
    expect(state.currentBet).toBe(100);
    expect(state.pot).toBe(100);
    expect(state.phase).toBe('pre-flop'); // street not over
  });

  it('raise then everyone calls -> street advances', () => {
    let state = startHand(seatFour());
    state = applyAction(state, state.players[state.activeSeat].id, { type: 'raise' });
    for (let i = 0; i < 3; i++) {
      state = applyAction(state, state.players[state.activeSeat].id, { type: 'call' });
    }
    expect(state.phase).toBe('flop');
    expect(state.pot).toBe(400);
    expect(state.community).toHaveLength(3);
  });
});

describe('folding', () => {
  it('three folds award the pot to the last player immediately', () => {
    let state = startHand(seatFour());
    for (let i = 0; i < 3; i++) {
      state = applyAction(state, state.players[state.activeSeat].id, { type: 'fold' });
    }
    expect(state.phase).toBe('showdown');
    expect(state.winner).not.toBeNull();
    expect(state.winner!.amount).toBe(state.pot);
  });
});

describe('full hand to showdown', () => {
  it('everyone checks every street and a winner is announced', () => {
    let state = startHand(seatFour());
    // 4 streets (pre-flop, flop, turn, river); 4 checks each.
    for (let street = 0; street < 4; street++) {
      for (let i = 0; i < 4; i++) {
        state = applyAction(state, state.players[state.activeSeat].id, { type: 'check' });
      }
    }
    expect(state.phase).toBe('showdown');
    expect(state.community).toHaveLength(5);
    expect(state.winner).not.toBeNull();
    expect(state.winner!.handName).toBeTruthy();
    expect(state.winner!.amount).toBe(state.pot);
  });
});

describe('publicState', () => {
  it('hides other players hole cards and exposes only my own', () => {
    const state = startHand(seatFour());
    const view = publicState(state, 0);
    expect(view.myHoleCards).toHaveLength(2);
    const players = view.players;
    if (!Array.isArray(players)) throw new Error('players is not an array');
    players.forEach((p) => expect(Object.hasOwn(p, 'holeCards')).toBe(false));
  });

  it('only the active seat receives legal actions', () => {
    const state = startHand(seatFour());
    const active = state.activeSeat;
    const inactive = (active + 1) % 4;
    expect(publicState(state, active).legalActions).not.toHaveLength(0);
    expect(publicState(state, inactive).legalActions).toHaveLength(0);
  });
});
