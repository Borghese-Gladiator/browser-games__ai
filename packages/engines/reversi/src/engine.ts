export interface SeatInit {
  id: string;
  name: string;
}

export interface ReversiPlayer {
  id: string;
  name: string;
  seat: number;
  color: string;
}

export interface ReversiScore {
  B: number;
  W: number;
}

export interface ReversiState {
  phase: string;
  board: Array<string | null>;
  players: ReversiPlayer[];
  activeSeat: number;
  winner: string | null;
  score: ReversiScore;
  passedSeat: number;
}

export interface Move {
  row: number;
  col: number;
}

const DIRECTIONS: Array<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function clone(state: ReversiState): ReversiState {
  return {
    ...state,
    board: [...state.board],
    players: state.players.map((p) => ({ ...p })),
    score: { ...state.score },
  };
}

function opponent(color: string): string {
  return color === 'B' ? 'W' : 'B';
}

function piecesToFlip(
  board: Array<string | null>,
  row: number,
  col: number,
  color: string,
): number[] {
  const flips: number[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opponent(color)) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (line.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === color) {
      flips.push(...line);
    }
  }
  return flips;
}

function countPieces(board: Array<string | null>): ReversiScore {
  let B = 0;
  let W = 0;
  for (const cell of board) {
    if (cell === 'B') B += 1;
    else if (cell === 'W') W += 1;
  }
  return { B, W };
}

function resolveGameOver(state: ReversiState): ReversiState {
  const next = clone(state);
  next.phase = 'done';
  next.activeSeat = -1;
  next.score = countPieces(next.board);
  if (next.score.B > next.score.W) next.winner = 'B';
  else if (next.score.W > next.score.B) next.winner = 'W';
  else next.winner = 'draw';
  return next;
}

export function createGame(): ReversiState {
  return {
    phase: 'waiting',
    board: Array(64).fill(null),
    players: [],
    activeSeat: -1,
    winner: null,
    score: { B: 0, W: 0 },
    passedSeat: -1,
  };
}

export function addPlayer(state: ReversiState, { id, name }: SeatInit): ReversiState {
  if (state.players.length >= 2) throw new Error('table full');
  if (state.players.some((p) => p.name === name)) throw new Error('name taken');
  const next = clone(state);
  const seat = next.players.length;
  next.players.push({ id, name, seat, color: seat === 0 ? 'B' : 'W' });
  return next;
}

export function removePlayer(state: ReversiState, playerId: string): ReversiState {
  const next = clone(state);
  next.players = next.players
    .filter((p) => p.id !== playerId)
    .map((p, i) => ({ ...p, seat: i, color: i === 0 ? 'B' : 'W' }));
  return next;
}

export function startGame(state: ReversiState): ReversiState {
  const next = clone(state);
  next.board = Array(64).fill(null);
  next.board[3 * 8 + 3] = 'W';
  next.board[3 * 8 + 4] = 'B';
  next.board[4 * 8 + 3] = 'B';
  next.board[4 * 8 + 4] = 'W';
  next.phase = 'playing';
  next.activeSeat = 0;
  next.winner = null;
  next.score = countPieces(next.board);
  next.passedSeat = -1;
  return next;
}

export function legalMoves(state: ReversiState, seat: number): Move[] {
  if (state.phase !== 'playing') return [];
  if (seat < 0 || seat >= state.players.length) return [];
  const color = state.players[seat].color;
  const moves: Move[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (state.board[row * 8 + col] !== null) continue;
      if (piecesToFlip(state.board, row, col, color).length > 0) {
        moves.push({ row, col });
      }
    }
  }
  return moves;
}

export function applyMove(state: ReversiState, playerId: string, { row, col }: Move): ReversiState {
  if (state.phase !== 'playing') throw new Error('not playing');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('not a player');
  if (player.seat !== state.activeSeat) throw new Error('not your turn');
  if (row < 0 || row > 7 || col < 0 || col > 7) throw new Error('illegal move');
  if (state.board[row * 8 + col] !== null) throw new Error('illegal move');
  const flips = piecesToFlip(state.board, row, col, player.color);
  if (flips.length === 0) throw new Error('illegal move');

  let next = clone(state);
  next.board[row * 8 + col] = player.color;
  for (const idx of flips) next.board[idx] = player.color;
  next.score = countPieces(next.board);

  const nextSeat = 1 - state.activeSeat;
  if (legalMoves(next, nextSeat).length > 0) {
    next.activeSeat = nextSeat;
    next.passedSeat = -1;
  } else if (legalMoves(next, state.activeSeat).length > 0) {
    // nextSeat has no legal move and is skipped; flag it so the next broadcast
    // can tell the players the turn passed. Cleared on the following move.
    next.activeSeat = state.activeSeat;
    next.passedSeat = nextSeat;
  } else {
    next = resolveGameOver(next);
  }
  return next;
}

export function publicState(state: ReversiState, forSeat: number): Record<string, unknown> {
  return {
    phase: state.phase,
    board: [...state.board],
    players: state.players.map(({ seat, name, color }) => ({ seat, name, color })),
    activeSeat: state.activeSeat,
    passedSeat: state.passedSeat ?? -1,
    winner: state.winner,
    score: { ...state.score },
    mySeat: forSeat,
    myColor: forSeat >= 0 ? (state.players[forSeat]?.color ?? null) : null,
    legalMoves: forSeat === state.activeSeat ? legalMoves(state, forSeat) : [],
  };
}
