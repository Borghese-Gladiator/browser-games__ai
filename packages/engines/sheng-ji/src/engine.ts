// Pure Sheng Ji (升级) game engine. No I/O, no side effects.
// A card is a string: rank + suit, e.g. "2S", "10H", "AD", "KC".
// Ranks: 2 3 4 5 6 7 8 9 10 J Q K A.  Suits: S(pades) H(earts) D(iamonds) C(lubs).
//
// v1 scope: 52 cards (no jokers), trump rank fixed at '2', trump suit fixed at
// 'S' (Spades), clockwise play (seat 0->1->2->3), single-card tricks only.
// Defending team (dealer's team) wins the deal at >= 80 captured points.
//
// TODO: v2 — add pairs/tractors/throws (multi-card combinations), joker support,
// and a proper trump declaration / kitty (底牌) mechanic.

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_ORDER: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13, A: 14,
};
const SUIT_TIE_ORDER: Record<string, number> = { C: 1, D: 2, H: 3 }; // tie-breaks among trump-rank cards of non-trump suits

const POINTS_TO_WIN = 80;

export interface SeatInit {
  id: string;
  name: string;
}

export interface ShengJiPlayer {
  id: string;
  name: string;
  seat: number;
  hand: string[];
}

export interface TrickPlay {
  seat: number;
  card: string;
}

export interface CurrentTrick {
  plays: TrickPlay[];
}

export interface ShengJiResult {
  winnerTeam: number;
  teamPoints: number[];
}

export interface ShengJiState {
  phase: string;
  players: ShengJiPlayer[];
  trumpSuit: string | null;
  trumpRank: string | null;
  dealerSeat: number;
  activeSeat: number;
  currentTrick: CurrentTrick;
  completedTricks: number;
  teamPoints: number[];
  lastTrickWinner: number | null;
  result: ShengJiResult | null;
}

export function cardSuit(card: string): string {
  return card[card.length - 1];
}

export function cardRank(card: string): string {
  return card.slice(0, card.length - 1);
}

export function createDeck(): string[] {
  const deck: string[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

// Fisher-Yates. Returns a new array; does not mutate the input.
export function shuffle(deck: string[]): string[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function cardPointValue(card: string): number {
  const r = cardRank(card);
  if (r === '5') return 5;
  if (r === '10' || r === 'K') return 10;
  return 0;
}

export function isTrumpCard(card: string, trumpSuit: string, trumpRank: string): boolean {
  return cardRank(card) === trumpRank || cardSuit(card) === trumpSuit;
}

// The "suit class" used for following: trump cards form a single class.
export function getSuitClass(card: string, trumpSuit: string, trumpRank: string): string {
  return isTrumpCard(card, trumpSuit, trumpRank) ? 'trump' : cardSuit(card);
}

// Strength ordering within the trump class. Higher wins.
export function getTrumpOrder(card: string, trumpSuit: string, trumpRank: string): number {
  const r = cardRank(card);
  const s = cardSuit(card);
  if (r === trumpRank && s === trumpSuit) return 1000; // trump rank in trump suit
  if (r === trumpRank) return 500 + SUIT_TIE_ORDER[s]; // trump rank, off-suit
  return RANK_ORDER[r]; // regular trump-suit card (3..14; trumpRank handled above)
}

// Does `challenger` beat `current`, given the led suit class?
export function beats(
  challenger: string,
  current: string,
  ledSuitClass: string,
  trumpSuit: string,
  trumpRank: string,
): boolean {
  const cT = isTrumpCard(challenger, trumpSuit, trumpRank);
  const bT = isTrumpCard(current, trumpSuit, trumpRank);
  if (cT && bT) {
    return getTrumpOrder(challenger, trumpSuit, trumpRank) > getTrumpOrder(current, trumpSuit, trumpRank);
  }
  if (cT) return true;
  if (bT) return false;
  // neither is trump
  const cLed = cardSuit(challenger) === ledSuitClass;
  const bLed = cardSuit(current) === ledSuitClass;
  if (cLed && bLed) return RANK_ORDER[cardRank(challenger)] > RANK_ORDER[cardRank(current)];
  if (cLed) return true;
  return false; // current follows led suit (or neither does); first play stands
}

// Which cards in `hand` are legal to play given the current trick?
export function legalCards(
  hand: string[],
  currentTrick: CurrentTrick,
  trumpSuit: string,
  trumpRank: string,
): string[] {
  if (currentTrick.plays.length === 0) return [...hand]; // leading: anything legal
  const ledSuitClass = getSuitClass(currentTrick.plays[0].card, trumpSuit, trumpRank);
  const matching = hand.filter((c) => getSuitClass(c, trumpSuit, trumpRank) === ledSuitClass);
  return matching.length > 0 ? matching : [...hand];
}

// Returns the winning seat number for a completed (or partial) trick.
export function resolveTrick(plays: TrickPlay[], trumpSuit: string, trumpRank: string): number {
  const ledSuitClass = getSuitClass(plays[0].card, trumpSuit, trumpRank);
  let winner = plays[0];
  for (const play of plays.slice(1)) {
    if (beats(play.card, winner.card, ledSuitClass, trumpSuit, trumpRank)) winner = play;
  }
  return winner.seat;
}

export function pointsInTrick(plays: TrickPlay[]): number {
  return plays.reduce((sum, { card }) => sum + cardPointValue(card), 0);
}

export function clone(state: ShengJiState): ShengJiState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    currentTrick: { plays: [...state.currentTrick.plays] },
    teamPoints: [...state.teamPoints],
    result: state.result ? { ...state.result, teamPoints: [...state.result.teamPoints] } : null,
  };
}

export function createGame(): ShengJiState {
  return {
    phase: 'waiting', // 'waiting' | 'playing' | 'deal-over'
    players: [], // [{id, name, seat, hand: string[]}]
    trumpSuit: null,
    trumpRank: null,
    dealerSeat: 0,
    activeSeat: -1, // -1 when not active
    currentTrick: { plays: [] }, // plays: [{seat, card}]
    completedTricks: 0, // 0..13
    teamPoints: [0, 0], // team0 = seats 0&2, team1 = seats 1&3
    lastTrickWinner: null, // seat
    result: null, // {winnerTeam, teamPoints:[n,n]}
  };
}

export function addPlayer(state: ShengJiState, { id, name }: SeatInit): ShengJiState {
  if (state.players.length >= 4) throw new Error('table full');
  if (state.players.some((p) => p.name === name)) throw new Error('name taken');
  const next = clone(state);
  next.players.push({ id, name, seat: next.players.length, hand: [] });
  return next;
}

export function startDeal(state: ShengJiState): ShengJiState {
  if (state.players.length !== 4) throw new Error('need 4 players');
  if (state.phase !== 'waiting' && state.phase !== 'deal-over') {
    throw new Error('deal already in progress');
  }
  const next = clone(state);
  const deck = shuffle(createDeck());
  for (let i = 0; i < 4; i++) {
    next.players[i].hand = deck.slice(i * 13, (i + 1) * 13);
  }
  next.trumpSuit = 'S';
  next.trumpRank = '2';
  next.dealerSeat = state.phase === 'deal-over' ? (state.dealerSeat + 1) % 4 : 0;
  next.activeSeat = next.dealerSeat; // dealer leads the first trick
  next.currentTrick = { plays: [] };
  next.completedTricks = 0;
  next.teamPoints = [0, 0];
  next.lastTrickWinner = null;
  next.result = null;
  next.phase = 'playing';
  return next;
}

export function playCard(state: ShengJiState, playerId: string, cardId: string): ShengJiState {
  if (state.phase !== 'playing') throw new Error('no deal in progress');
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.seat !== state.activeSeat) throw new Error('not your turn');
  if (!player.hand.includes(cardId)) throw new Error('card not in hand');
  if (!legalCards(player.hand, state.currentTrick, state.trumpSuit!, state.trumpRank!).includes(cardId)) {
    throw new Error('must follow suit');
  }

  const next = clone(state);
  const me = next.players.find((p) => p.id === playerId)!;
  me.hand = me.hand.filter((c) => c !== cardId);
  next.currentTrick.plays.push({ seat: me.seat, card: cardId });

  if (next.currentTrick.plays.length === 4) {
    const winnerSeat = resolveTrick(next.currentTrick.plays, next.trumpSuit!, next.trumpRank!);
    next.teamPoints[winnerSeat % 2] += pointsInTrick(next.currentTrick.plays);
    next.lastTrickWinner = winnerSeat;
    next.completedTricks += 1;

    if (next.completedTricks === 13) {
      const defTeam = next.dealerSeat % 2;
      const winnerTeam = next.teamPoints[defTeam] >= POINTS_TO_WIN ? defTeam : 1 - defTeam;
      next.result = { winnerTeam, teamPoints: [...next.teamPoints] };
      next.phase = 'deal-over';
      next.activeSeat = -1;
      next.currentTrick = { plays: [] };
    } else {
      next.currentTrick = { plays: [] };
      next.activeSeat = winnerSeat;
    }
  } else {
    next.activeSeat = (me.seat + 1) % 4;
  }

  return next;
}

// View of the state safe to send to one seat (never exposes other hands).
export function publicState(state: ShengJiState, forSeat: number): Record<string, unknown> {
  const me = state.players[forSeat];
  const hand = me ? me.hand : [];
  return {
    phase: state.phase,
    players: state.players.map((p) => ({ seat: p.seat, name: p.name, handCount: p.hand.length })),
    trumpSuit: state.trumpSuit,
    trumpRank: state.trumpRank,
    dealerSeat: state.dealerSeat,
    activeSeat: state.activeSeat,
    currentTrick: { plays: [...state.currentTrick.plays] },
    completedTricks: state.completedTricks,
    teamPoints: [...state.teamPoints],
    lastTrickWinner: state.lastTrickWinner,
    result: state.result ? { ...state.result, teamPoints: [...state.result.teamPoints] } : null,
    mySeat: forSeat,
    myHand: hand,
    legalCards:
      state.phase === 'playing' && forSeat === state.activeSeat
        ? legalCards(hand, state.currentTrick, state.trumpSuit!, state.trumpRank!)
        : [],
  };
}

export { SUITS, RANKS, POINTS_TO_WIN };
