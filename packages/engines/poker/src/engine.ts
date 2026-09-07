// Pure Texas Hold'em game engine. No I/O, no side effects.
// Every exported function takes a state and returns a new state (immutable-style).
//
// v1 scope: no blinds/antes, no side pots. A single main pot, fixed-increment raises.

import {
  createDeck,
  shuffle,
  best7,
  compareHands,
  type Card,
  type HandValue,
} from './handEval.ts';

export const RAISE_AMOUNT = 100;
const MAX_PLAYERS = 4;

// `options` is the room's validated options bag. `stakes` scales the fixed raise
// increment so one engine exposes low/normal/high-stakes variants.
const STAKES_RAISE: Record<string, number> = { low: 50, normal: 100, high: 250 };

export interface SeatInit {
  id: string;
  name: string;
}

export interface PokerPlayer {
  id: string;
  name: string;
  seat: number;
  holeCards: Card[];
  folded: boolean;
  bet: number;
}

export interface PokerWinner {
  seat: number;
  name: string;
  handName: string;
  amount: number;
}

export interface PokerState {
  phase: string;
  players: PokerPlayer[];
  deck: Card[];
  community: Card[];
  pot: number;
  dealer: number;
  activeSeat: number;
  currentBet: number;
  actedSeats: number[];
  winner: PokerWinner | null;
  options: { raiseAmount: number; [k: string]: unknown };
}

export type PokerAction = { type: string; amount?: number };

export function createGame(options: Record<string, unknown> = {}): PokerState {
  const raiseAmount = STAKES_RAISE[options.stakes as string] ?? RAISE_AMOUNT;
  return {
    phase: 'waiting', // 'waiting'|'pre-flop'|'flop'|'turn'|'river'|'showdown'
    players: [], // { id, name, seat, holeCards: string[], folded, bet }
    deck: [],
    community: [],
    pot: 0,
    dealer: 0,
    activeSeat: -1,
    currentBet: 0,
    actedSeats: [],
    winner: null, // { seat, name, handName, amount }
    options: { ...options, raiseAmount },
  };
}

function clone(state: PokerState): PokerState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, holeCards: [...p.holeCards] })),
    deck: [...state.deck],
    community: [...state.community],
    actedSeats: [...state.actedSeats],
  };
}

export function addPlayer(state: PokerState, { id, name }: SeatInit): PokerState {
  if (state.players.length >= MAX_PLAYERS) throw new Error('table full');
  if (state.players.some((p) => p.name === name)) throw new Error('name taken');
  const next = clone(state);
  next.players.push({
    id,
    name,
    seat: next.players.length,
    holeCards: [],
    folded: false,
    bet: 0,
  });
  return next;
}

// First non-folded seat clockwise after the dealer.
function firstToAct(state: PokerState): number {
  return nextActiveSeat(state, state.dealer);
}

// Next non-folded seat clockwise from fromSeat (exclusive).
function nextActiveSeat(state: PokerState, fromSeat: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (!state.players[seat].folded) return seat;
  }
  return -1;
}

function activePlayers(state: PokerState): PokerPlayer[] {
  return state.players.filter((p) => !p.folded);
}

export function startHand(state: PokerState): PokerState {
  if (state.players.length < 2) throw new Error('need at least 2 players');
  if (state.phase !== 'waiting' && state.phase !== 'showdown') {
    throw new Error('hand in progress');
  }
  const next = clone(state);
  const deck = shuffle(createDeck());

  next.dealer =
    state.phase === 'showdown'
      ? (state.dealer + 1) % next.players.length
      : state.dealer;

  // Reset players and deal 2 hole cards each.
  next.players = next.players.map((p) => ({ ...p, holeCards: [], folded: false, bet: 0 }));
  for (let c = 0; c < 2; c++) {
    for (const p of next.players) {
      p.holeCards.push(deck.pop()!);
    }
  }

  next.deck = deck;
  next.community = [];
  next.pot = 0;
  next.currentBet = 0;
  next.actedSeats = [];
  next.winner = null;
  next.phase = 'pre-flop';
  next.activeSeat = firstToAct(next);
  return next;
}

function computeLegalActions(state: PokerState, seat: number): string[] {
  if (seat !== state.activeSeat || state.phase === 'showdown' || state.phase === 'waiting') {
    return [];
  }
  const player = state.players[seat];
  if (player.folded) return [];
  const actions = ['fold'];
  if (player.bet === state.currentBet) {
    actions.push('check');
  } else {
    actions.push('call');
  }
  actions.push('raise');
  return actions;
}

// All non-folded players have acted since the last aggression and matched the bet.
function isStreetOver(state: PokerState): boolean {
  const active = activePlayers(state);
  return active.every(
    (p) => state.actedSeats.includes(p.seat) && p.bet === state.currentBet,
  );
}

function advanceStreet(state: PokerState): PokerState {
  const next = clone(state);
  // Reset betting for the new street.
  next.currentBet = 0;
  next.actedSeats = [];
  next.players = next.players.map((p) => ({ ...p, bet: 0 }));

  if (next.phase === 'pre-flop') {
    next.phase = 'flop';
    next.community.push(next.deck.pop()!, next.deck.pop()!, next.deck.pop()!);
  } else if (next.phase === 'flop') {
    next.phase = 'turn';
    next.community.push(next.deck.pop()!);
  } else if (next.phase === 'turn') {
    next.phase = 'river';
    next.community.push(next.deck.pop()!);
  } else if (next.phase === 'river') {
    return resolveShowdown(next);
  }

  next.activeSeat = firstToAct(next);
  return next;
}

function resolveShowdown(state: PokerState): PokerState {
  const next = clone(state);
  const contenders = activePlayers(next);
  let bestSeat = -1;
  let bestHand: HandValue | null = null;
  let bestName = '';
  for (const p of contenders) {
    const hand = best7([...p.holeCards, ...next.community]);
    if (bestHand === null || compareHands(hand, bestHand) > 0) {
      bestHand = hand;
      bestSeat = p.seat;
      bestName = hand.name;
    }
  }
  next.phase = 'showdown';
  next.activeSeat = -1;
  next.winner = {
    seat: bestSeat,
    name: next.players[bestSeat].name,
    handName: bestName,
    amount: next.pot,
  };
  return next;
}

// Everyone but one player folded — award the pot without a showdown.
function awardToLastStanding(state: PokerState): PokerState {
  const next = clone(state);
  const winner = activePlayers(next)[0];
  next.phase = 'showdown';
  next.activeSeat = -1;
  next.winner = {
    seat: winner.seat,
    name: winner.name,
    handName: 'last player standing',
    amount: next.pot,
  };
  return next;
}

export function applyAction(state: PokerState, playerId: string, action: PokerAction): PokerState {
  if (state.phase === 'waiting' || state.phase === 'showdown') {
    throw new Error('no hand in progress');
  }
  const seat = state.activeSeat;
  const player = state.players[seat];
  if (!player || player.id !== playerId) throw new Error('not your turn');

  const legal = computeLegalActions(state, seat);
  if (!legal.includes(action.type)) throw new Error('illegal action');

  let next = clone(state);
  const p = next.players[seat];

  if (action.type === 'fold') {
    p.folded = true;
    next.actedSeats = [...next.actedSeats, seat];
  } else if (action.type === 'check') {
    next.actedSeats = [...next.actedSeats, seat];
  } else if (action.type === 'call') {
    next.pot += next.currentBet - p.bet;
    p.bet = next.currentBet;
    next.actedSeats = [...next.actedSeats, seat];
  } else if (action.type === 'raise') {
    const newBet = next.currentBet + (next.options?.raiseAmount ?? RAISE_AMOUNT);
    next.pot += newBet - p.bet;
    p.bet = newBet;
    next.currentBet = newBet;
    next.actedSeats = [seat]; // others must re-act
  }

  // Only one player left → award immediately.
  if (activePlayers(next).length === 1) {
    return awardToLastStanding(next);
  }

  if (isStreetOver(next)) {
    return advanceStreet(next);
  }

  next.activeSeat = nextActiveSeat(next, seat);
  return next;
}

// Safe per-client view. Includes only forSeat's hole cards and legal actions.
export function publicState(state: PokerState, forSeat: number): Record<string, unknown> {
  return {
    phase: state.phase,
    players: state.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      folded: p.folded,
      bet: p.bet,
    })),
    community: [...state.community],
    pot: state.pot,
    dealer: state.dealer,
    activeSeat: state.activeSeat,
    currentBet: state.currentBet,
    winner: state.winner,
    mySeat: forSeat,
    myHoleCards:
      forSeat >= 0 && state.players[forSeat]
        ? [...state.players[forSeat].holeCards]
        : [],
    legalActions: computeLegalActions(state, forSeat),
  };
}
