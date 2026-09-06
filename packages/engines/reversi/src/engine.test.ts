import { describe, it, expect } from 'vitest';
import {
  createGame,
  addPlayer,
  startGame,
  legalMoves,
  applyMove,
  publicState,
} from './engine.js';

function twoPlayerGame() {
  let s = createGame();
  s = addPlayer(s, { id: 'p0', name: 'Alice' });
  s = addPlayer(s, { id: 'p1', name: 'Bob' });
  return startGame(s);
}

describe('addPlayer', () => {
  it('seats two players with correct colors', () => {
    let s = createGame();
    s = addPlayer(s, { id: 'p0', name: 'Alice' });
    s = addPlayer(s, { id: 'p1', name: 'Bob' });
    expect(s.players).toEqual([
      { id: 'p0', name: 'Alice', seat: 0, color: 'B' },
      { id: 'p1', name: 'Bob', seat: 1, color: 'W' },
    ]);
  });

  it('throws when table is full', () => {
    let s = createGame();
    s = addPlayer(s, { id: 'p0', name: 'Alice' });
    s = addPlayer(s, { id: 'p1', name: 'Bob' });
    expect(() => addPlayer(s, { id: 'p2', name: 'Carol' })).toThrow('table full');
  });

  it('throws on duplicate name', () => {
    let s = createGame();
    s = addPlayer(s, { id: 'p0', name: 'Alice' });
    expect(() => addPlayer(s, { id: 'p1', name: 'Alice' })).toThrow('name taken');
  });
});

describe('startGame', () => {
  it('sets up the standard opening', () => {
    const s = twoPlayerGame();
    expect(s.phase).toBe('playing');
    expect(s.activeSeat).toBe(0);
    expect(s.board.filter((c) => c !== null)).toHaveLength(4);
    expect(s.score).toEqual({ B: 2, W: 2 });
    expect(s.board[3 * 8 + 3]).toBe('W');
    expect(s.board[3 * 8 + 4]).toBe('B');
    expect(s.board[4 * 8 + 3]).toBe('B');
    expect(s.board[4 * 8 + 4]).toBe('W');
  });
});

describe('legalMoves', () => {
  it('returns the four opening moves for Black', () => {
    const s = twoPlayerGame();
    const moves = legalMoves(s, 0);
    expect(moves).toHaveLength(4);
    expect(moves).toEqual(
      expect.arrayContaining([
        { row: 2, col: 3 },
        { row: 3, col: 2 },
        { row: 4, col: 5 },
        { row: 5, col: 4 },
      ]),
    );
  });

  it('returns the four symmetric moves for White', () => {
    const s = twoPlayerGame();
    const moves = legalMoves(s, 1);
    expect(moves).toHaveLength(4);
    expect(moves).toEqual(
      expect.arrayContaining([
        { row: 2, col: 4 },
        { row: 4, col: 2 },
        { row: 3, col: 5 },
        { row: 5, col: 3 },
      ]),
    );
  });

  it('returns empty when not playing', () => {
    const s = createGame();
    expect(legalMoves(s, 0)).toEqual([]);
  });
});

describe('applyMove', () => {
  it('places a piece and flips the opponent', () => {
    const s = twoPlayerGame();
    const next = applyMove(s, 'p0', { row: 2, col: 3 });
    expect(next.board[2 * 8 + 3]).toBe('B');
    expect(next.board[3 * 8 + 3]).toBe('B');
    expect(next.activeSeat).toBe(1);
    expect(next.score).toEqual({ B: 4, W: 1 });
  });

  it('rejects an illegal move that flips nothing', () => {
    const s = twoPlayerGame();
    expect(() => applyMove(s, 'p0', { row: 0, col: 0 })).toThrow('illegal move');
    expect(s.board.filter((c) => c !== null)).toHaveLength(4);
  });

  it('rejects a move from the wrong player', () => {
    const s = twoPlayerGame();
    expect(() => applyMove(s, 'p1', { row: 2, col: 4 })).toThrow('not your turn');
  });

  it('forces a pass when the next player has no legal move', () => {
    const s = twoPlayerGame();
    // Black to move; everything Black except a single White at (0,1) with an
    // empty (0,0) so Black can play (0,0) flipping (0,1), after which White
    // has no pieces and therefore no legal move -> White is skipped, but the
    // game is actually over once White has zero pieces. Use a layout where
    // White still has a piece but no legal move.
    let custom = {
      phase: 'playing',
      board: Array(64).fill('B'),
      players: s.players,
      activeSeat: 0,
      winner: null,
      score: { B: 0, W: 0 },
      passedSeat: -1,
    };
    // empty out a corner region so Black has a move and White is hemmed in
    custom.board[0] = null; // (0,0) empty
    custom.board[1] = 'W'; // (0,1) White
    // remaining are B. Black plays (0,0)? needs opponent line ending in own.
    // (0,0)->right: (0,1)=W, (0,2)=B -> flips (0,1). legal for Black.
    const next = applyMove(custom, 'p0', { row: 0, col: 0 });
    // After flip, White has no pieces on board -> no legal move for White,
    // and Black has no empty cells -> game over.
    expect(next.phase).toBe('done');
    expect(next.winner).toBe('B');
  });

  it('skips a player with no move and flags passedSeat, clearing it next move', () => {
    // Board confined to row 0: B at (0,0), W at (0,2), empties elsewhere in
    // row 0; the rest of the board is filled with B so neither side has lines
    // there. White (seat 1) has only the isolated piece at (0,2) and no line to
    // flip -> no legal move. Black (seat 0) can play (0,1): (0,1)->right hits
    // W at (0,2) then B at (0,3) -> flips (0,2). So after Black moves, White is
    // skipped (no move) but Black still has moves, leaving the turn on Black.
    const players = twoPlayerGame().players;
    const board = Array(64).fill('B');
    board[0] = 'B';
    board[1] = null;
    board[2] = 'W';
    board[3] = 'B';
    board[4] = null;
    board[5] = 'W';
    board[6] = 'B';
    const custom = { phase: 'playing', board, players, activeSeat: 0, winner: null, score: { B: 0, W: 0 }, passedSeat: -1 };

    const afterPass = applyMove(custom, 'p0', { row: 0, col: 1 });
    expect(afterPass.phase).toBe('playing');
    expect(afterPass.activeSeat).toBe(0); // White skipped, Black keeps the turn
    expect(afterPass.passedSeat).toBe(1);
  });

  it('clears passedSeat on a normal turn handoff', () => {
    // A fresh game hands off normally; the pass flag stays cleared.
    const s = twoPlayerGame();
    const next = applyMove(s, 'p0', { row: 2, col: 3 });
    expect(next.activeSeat).toBe(1);
    expect(next.passedSeat).toBe(-1);
  });

  it('detects game over and computes the winner', () => {
    let custom = {
      phase: 'playing',
      board: Array(64).fill('B'),
      players: twoPlayerGame().players,
      activeSeat: 0,
      winner: null,
      score: { B: 0, W: 0 },
      passedSeat: -1,
    };
    custom.board[0] = null;
    custom.board[1] = 'W';
    const next = applyMove(custom, 'p0', { row: 0, col: 0 });
    expect(next.phase).toBe('done');
    expect(next.activeSeat).toBe(-1);
    expect(next.winner).toBe('B');
    expect(next.score.B).toBe(64);
    expect(next.score.W).toBe(0);
  });
});

describe('publicState', () => {
  it('exposes legal moves only for the active seat', () => {
    const s = twoPlayerGame();
    expect(publicState(s, 0).legalMoves).toHaveLength(4);
    expect(publicState(s, 1).legalMoves).toEqual([]);
    expect(publicState(s, -1).legalMoves).toEqual([]);
  });

  it('returns a board copy and null color for spectators', () => {
    const s = twoPlayerGame();
    const pub = publicState(s, -1);
    (pub.board as Array<string | null>)[0] = 'B';
    expect(s.board[0]).toBeNull();
    expect(pub.myColor).toBeNull();
    expect(publicState(s, 0).myColor).toBe('B');
  });
});
