import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import { tiles } from '../hand/test-helpers.ts';
import type { GameConfig, GameState, PlayerId, PlayerState } from './state.ts';
import { getPlayer, withPlayer, isTerminal } from './state.ts';
import { createGame } from './deal.ts';
import { applyAction } from './reducer.ts';
import { replayScores } from './nextHand.ts';
import type { ApplyResult } from './result.ts';

const rules = DEFAULT_TAIWANESE_RULES;

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return { rules, seed: 'table-1', dealer: 0, roundWind: 'E', ...overrides };
}

function dealtGame(seed = 'table-1'): GameState {
  const start = createGame(config({ seed }));
  const result = applyAction(start, { type: 'DEAL' });
  if (!result.ok) {
    throw new Error('deal failed');
  }
  return result.state;
}

function seqNumbers(state: GameState): number[] {
  return state.events.map((event) => event.seq);
}

function passAllClaims(state: GameState): GameState {
  let current = state;
  while (current.pendingClaim && current.pendingClaim.pending.length > 0) {
    const seat = current.pendingClaim.pending[0];
    const result = applyAction(current, { type: 'PASS_CLAIM', player: seat });
    if (!result.ok) {
      throw new Error('pass failed');
    }
    current = result.state;
  }
  return current;
}

function playToTerminal(state: GameState): GameState {
  let current = state;
  let guard = 0;
  while (current.phase !== 'FINISHED' && guard < 1000) {
    guard += 1;
    if (current.pendingClaim) {
      current = passAllClaims(current);
      continue;
    }
    const player = current.turn.player;
    if (current.turn.phase === 'NEEDS_DISCARD') {
      const held = getPlayer(current, player);
      const tile = current.turn.drawnTile ?? held.hand[held.hand.length - 1];
      const result = applyAction(current, { type: 'DISCARD', player, tile });
      if (!result.ok) {
        throw new Error('discard failed');
      }
      current = result.state;
    } else {
      const result = applyAction(current, { type: 'DRAW', player });
      if (!result.ok) {
        throw new Error('draw failed');
      }
      current = result.state;
    }
  }
  return current;
}

describe('applyAction DECLARE_WIN', () => {
  it('accepts a complete winning hand and finishes the game', () => {
    const state = dealtGame();
    const winning: PlayerState = {
      hand: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east east'),
      melds: [],
      flowers: [],
      discards: [],
      score: 0,
    };
    const seeded = withPlayer(state, 0, winning);
    const result = applyAction(seeded, { type: 'DECLARE_WIN', player: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(isTerminal(result.state)).toBe(true);
    expect(result.state.outcome).toMatchObject({ kind: 'WIN', winner: 0, dealerRepeats: true });
    expect(result.events.at(-1)?.type).toBe('HAND_WON');
  });

  it('rejects a non-winning hand with NOT_A_WINNING_HAND', () => {
    const state = dealtGame();
    const notWinning: PlayerState = {
      hand: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 7s 9p'),
      melds: [],
      flowers: [],
      discards: [],
      score: 0,
    };
    const seeded = withPlayer(state, 0, notWinning);
    const result = applyAction(seeded, { type: 'DECLARE_WIN', player: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('NOT_A_WINNING_HAND');
  });
});

describe('wall exhaustion', () => {
  it('turns an empty live wall into a DRAW outcome', () => {
    const state = dealtGame();
    const emptyWall: GameState = {
      ...state,
      turn: { phase: 'NEEDS_DRAW', player: 1, drawnTile: null },
      currentPlayer: 1,
      wall: { ...state.wall, drawIndex: 5, replacementIndex: 4 },
    };
    const result = applyAction(emptyWall, { type: 'DRAW', player: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.state.phase).toBe('FINISHED');
    expect(result.state.outcome?.kind).toBe('DRAW');
    expect(result.events.at(-1)?.type).toBe('WALL_EXHAUSTED');
  });

  it.each(['seed-1', 'seed-13', 'seed-25', 's2'])(
    'plays seed %s to an exhaustive draw with every flower revealed and no short-hand discard',
    (seed) => {
      const final = playToTerminal(dealtGame(seed));
      expect(final.phase).toBe('FINISHED');
      expect(final.outcome?.kind).toBe('DRAW');
      expect(final.turn.phase).toBe('NEEDS_DRAW');
      expect(final.events.at(-1)?.type).toBe('WALL_EXHAUSTED');
      for (let player = 0; player < rules.playerCount; player++) {
        const held = final.players[player];
        expect(held.hand.some((tile) => tile.suit === 'flower')).toBe(false);
        const unreplaced = final.events.filter(
          (event) =>
            event.type === 'FLOWER_REPLACED' &&
            event.replacement === null &&
            event.player === player,
        ).length;
        const minimum = rules.concealedHandSize - 3 * held.melds.length - unreplaced;
        expect(held.hand.length).toBeGreaterThanOrEqual(minimum);
      }
    },
  );
});

describe('event sequence numbers', () => {
  it('stay strictly monotonic across actions', () => {
    let state = dealtGame();
    const firstDiscard = getPlayer(state, 0).hand[0];
    const discarded = applyAction(state, { type: 'DISCARD', player: 0, tile: firstDiscard });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) {
      return;
    }
    state = passAllClaims(discarded.state);
    const drawn = applyAction(state, { type: 'DRAW', player: 1 });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) {
      return;
    }
    state = drawn.state;
    const expected = Array.from({ length: state.events.length }, (_, index) => index);
    expect(seqNumbers(state)).toEqual(expected);
    expect(state.nextSeq).toBe(state.events.length);
  });
});

const WIN_HAND = '1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east east';

function unwrap(result: ApplyResult): GameState {
  if (!result.ok) {
    throw new Error(`action failed: ${result.error.code}`);
  }
  return result.state;
}

function totalScore(state: GameState): number {
  return state.players.reduce((sum, player) => sum + player.score, 0);
}

// Overwrite the seat's hand with a complete winning hand, then self-draw win.
function forceSelfDrawWin(state: GameState, seat: PlayerId): GameState {
  const held = getPlayer(state, seat);
  const seeded = withPlayer(state, seat, { ...held, hand: tiles(WIN_HAND), melds: [] });
  const ready: GameState = {
    ...seeded,
    currentPlayer: seat,
    turn: { phase: 'NEEDS_DISCARD', player: seat, drawnTile: null },
  };
  return unwrap(applyAction(ready, { type: 'DECLARE_WIN', player: seat }));
}

describe('settlement at the end of a hand', () => {
  it('keeps the per-seat deltas zero-sum on a self-draw win', () => {
    const start = dealtGame();
    const won = forceSelfDrawWin(start, 0);
    const seats = won.outcome!.seats;
    expect(seats.reduce((sum, seat) => sum + seat.delta, 0)).toBe(0);
    expect(totalScore(won)).toBe(4 * rules.startingScore);
  });

  it('keeps the per-seat deltas zero-sum and unchanged on an exhaustive draw', () => {
    const start = dealtGame();
    const emptyWall: GameState = {
      ...start,
      turn: { phase: 'NEEDS_DRAW', player: 1, drawnTile: null },
      currentPlayer: 1,
      wall: { ...start.wall, drawIndex: 5, replacementIndex: 4 },
    };
    const drawn = unwrap(applyAction(emptyWall, { type: 'DRAW', player: 1 }));
    expect(drawn.outcome?.kind).toBe('DRAW');
    const seats = drawn.outcome!.seats;
    expect(seats.every((seat) => seat.delta === 0)).toBe(true);
    expect(totalScore(drawn)).toBe(4 * rules.startingScore);
  });
});

describe('NEXT_HAND across hands', () => {
  it('rotates the dealer, advances the prevailing wind on a full circuit, and carries scores', () => {
    let state = dealtGame();
    const winners: PlayerId[] = [1, 2, 3, 0];
    const dealersAfter: PlayerId[] = [1, 2, 3, 0];
    for (let hand = 0; hand < winners.length; hand++) {
      state = forceSelfDrawWin(state, winners[hand]);
      expect(totalScore(state)).toBe(4 * rules.startingScore);
      state = unwrap(applyAction(state, { type: 'NEXT_HAND' }));
      expect(state.dealer).toBe(dealersAfter[hand]);
      expect(state.phase).toBe('PLAYING');
    }
    // Four non-dealer wins rotate the dealer back to seat 0, a full circuit.
    expect(state.dealer).toBe(0);
    expect(state.roundWind).toBe('S');
  });

  it('carries scores forward and keeps one event log that replays to the same scores', () => {
    let state = dealtGame();
    state = forceSelfDrawWin(state, 1);
    const afterHand1 = state.players.map((player) => player.score);
    state = unwrap(applyAction(state, { type: 'NEXT_HAND' }));
    // The new hand starts from the carried scores.
    expect(state.players.map((player) => player.score)).toEqual(afterHand1);
    state = forceSelfDrawWin(state, 2);
    const finalScores = state.players.map((player) => player.score);
    expect(finalScores).toEqual(replayScores(state.events, rules.startingScore, rules.playerCount));
    // A single event log spans both hands.
    expect(state.events.filter((event) => event.type === 'HAND_WON')).toHaveLength(2);
    expect(state.events.filter((event) => event.type === 'NEXT_HAND')).toHaveLength(1);
  });
});
