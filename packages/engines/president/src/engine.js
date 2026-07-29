// Pure President (a.k.a. Scum) game engine. No I/O, no side effects.
// Every exported function takes a state and returns a new state (immutable-style).
//
// A card is a 2-char string: rank char + suit char, e.g. "As", "Td", "2c".
// Ranks run 2 (low) .. A (high); suits are irrelevant to trick strength.
//
// Trick model: the current play sets a count (how many cards) and a rank. It is
// beaten only by the same count of a strictly higher rank. Players may pass. When
// every other still-in-play player passes, the trick resets and the last player
// to play leads a fresh trick. Players who empty their hands finish, in order;
// roles are assigned at round end (President, VP, ..., Scum).

const RANKS = '23456789TJQKA'.split(''); // index 0–12 (2 lowest, Ace highest)
const SUITS = ['c', 'd', 'h', 's'];
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

function createDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

// Fisher-Yates. Returns a new array; does not mutate the input.
function shuffle(deck) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rankIndex(card) {
  return RANKS.indexOf(card[0]);
}

export function createGame(options = {}) {
  return {
    phase: 'waiting', // 'waiting' | 'playing' | 'done'
    players: [], // { id, name, seat, hand: string[], finished: bool, role: string|null }
    activeSeat: -1,
    currentPlay: null, // { seat, cards: string[], rank: number, count: number } | null
    passedSeats: [], // seats that passed since the trick lead
    finishOrder: [], // seats in the order they emptied their hands
    trickCount: 0, // number of tricks completed this round (for observability)
    options: { ...options },
  };
}

function clone(state) {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    currentPlay: state.currentPlay
      ? { ...state.currentPlay, cards: [...state.currentPlay.cards] }
      : null,
    passedSeats: [...state.passedSeats],
    finishOrder: [...state.finishOrder],
  };
}

export function addPlayer(state, { id, name }) {
  if (state.players.length >= MAX_PLAYERS) throw new Error('table full');
  if (state.players.some((p) => p.name === name)) throw new Error('name taken');
  const next = clone(state);
  next.players.push({
    id,
    name,
    seat: next.players.length,
    hand: [],
    finished: false,
    role: null,
  });
  return next;
}

// Sort a hand low→high by rank (stable within rank).
function sortHand(hand) {
  return [...hand].sort((a, b) => rankIndex(a) - rankIndex(b));
}

// Next still-in-play seat clockwise from fromSeat (exclusive).
function nextInPlaySeat(state, fromSeat) {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (fromSeat + i) % n;
    if (!state.players[seat].finished) return seat;
  }
  return -1;
}

function inPlayPlayers(state) {
  return state.players.filter((p) => !p.finished);
}

export function startRound(state) {
  if (state.players.length < MIN_PLAYERS) {
    throw new Error(`need at least ${MIN_PLAYERS} players`);
  }
  if (state.phase !== 'waiting' && state.phase !== 'done') {
    throw new Error('round in progress');
  }
  const next = clone(state);
  const deck = shuffle(createDeck());

  // Reset players and deal the whole deck round-robin.
  next.players = next.players.map((p) => ({
    ...p,
    hand: [],
    finished: false,
    role: null,
  }));
  let seat = 0;
  while (deck.length) {
    next.players[seat % next.players.length].hand.push(deck.pop());
    seat++;
  }
  next.players.forEach((p) => {
    p.hand = sortHand(p.hand);
  });

  next.phase = 'playing';
  next.currentPlay = null;
  next.passedSeats = [];
  next.finishOrder = [];
  next.trickCount = 0;
  next.activeSeat = 0; // seat 0 leads the first trick
  return next;
}

// A group of cards is legal to play if it is non-empty, the player holds them all,
// and they share a single rank.
function validGroup(hand, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return false;
  if (new Set(cards).size !== cards.length) return false; // no duplicates
  const rank = rankIndex(cards[0]);
  if (rank < 0) return false;
  for (const c of cards) {
    if (rankIndex(c) !== rank) return false;
    if (!hand.includes(c)) return false;
  }
  return true;
}

// Legal plays for a seat: card groups (as arrays) that either open a fresh trick
// (any single-rank group) or beat the current play (same count, strictly higher
// rank). Passing is always legal unless the player is leading a fresh trick.
export function legalPlays(state, seat) {
  if (
    state.phase !== 'playing' ||
    seat !== state.activeSeat ||
    seat < 0 ||
    !state.players[seat] ||
    state.players[seat].finished
  ) {
    return [];
  }
  const hand = state.players[seat].hand;
  // Group hand cards by rank.
  const byRank = new Map();
  for (const c of hand) {
    const r = rankIndex(c);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(c);
  }

  const plays = [];
  if (state.currentPlay === null) {
    // Leading: any subset of a single rank of any size 1..count.
    for (const [, cards] of byRank) {
      for (let k = 1; k <= cards.length; k++) {
        plays.push(cards.slice(0, k));
      }
    }
  } else {
    const { count, rank } = state.currentPlay;
    for (const [r, cards] of byRank) {
      if (r > rank && cards.length >= count) {
        plays.push(cards.slice(0, count));
      }
    }
  }
  return plays;
}

// Whether `seat` may pass. Leading a fresh trick, passing is illegal (you must play).
function canPass(state) {
  return state.currentPlay !== null;
}

// Resolve the end of a trick: everyone else in play has passed. The last player
// to play leads a fresh trick (or the next in-play seat if they finished).
function resetTrick(next) {
  const leadSeat = next.currentPlay.seat;
  next.currentPlay = null;
  next.passedSeats = [];
  next.trickCount += 1;
  const leader = next.players[leadSeat];
  next.activeSeat = leader.finished ? nextInPlaySeat(next, leadSeat) : leadSeat;
}

function assignRoles(next) {
  const n = next.players.length;
  const order = [...next.finishOrder];
  // Any player never marked finished (shouldn't happen once round is done) goes last.
  for (const p of next.players) {
    if (!order.includes(p.seat)) order.push(p.seat);
  }
  order.forEach((seat, i) => {
    let role;
    if (i === n - 1) role = 'Scum';
    else if (i === 0) role = 'President';
    else if (i === 1) role = 'Vice President';
    else role = 'Neutral';
    next.players[seat].role = role;
  });
}

// action: { cards: string[] } to play, or { pass: true } to pass.
export function applyAction(state, playerId, action) {
  if (state.phase !== 'playing') throw new Error('no round in progress');
  const seat = state.activeSeat;
  const player = state.players[seat];
  if (!player || player.id !== playerId) throw new Error('not your turn');

  let next = clone(state);
  const p = next.players[seat];

  if (action && action.pass) {
    if (!canPass(next)) throw new Error('cannot pass when leading');
    next.passedSeats = [...next.passedSeats, seat];

    // If all other in-play players have passed, the trick resets.
    const others = inPlayPlayers(next).filter((q) => q.seat !== next.currentPlay.seat);
    if (others.every((q) => next.passedSeats.includes(q.seat))) {
      resetTrick(next);
      return next;
    }
    next.activeSeat = nextInPlaySeat(next, seat);
    return next;
  }

  const cards = action && action.cards;
  if (!validGroup(p.hand, cards)) throw new Error('illegal play');

  const rank = rankIndex(cards[0]);
  const count = cards.length;
  if (next.currentPlay !== null) {
    if (count !== next.currentPlay.count) throw new Error('must match card count');
    if (rank <= next.currentPlay.rank) throw new Error('must play a higher rank');
  }

  // Remove the played cards from the hand.
  p.hand = p.hand.filter((c) => !cards.includes(c));
  next.currentPlay = { seat, cards: [...cards], rank, count };
  next.passedSeats = [];

  // Did this player just empty their hand?
  if (p.hand.length === 0) {
    p.finished = true;
    next.finishOrder = [...next.finishOrder, seat];
  }

  // Round ends when only one player still holds cards.
  if (inPlayPlayers(next).length <= 1) {
    for (const q of inPlayPlayers(next)) {
      q.finished = true;
      next.finishOrder = [...next.finishOrder, q.seat];
    }
    next.phase = 'done';
    next.activeSeat = -1;
    next.currentPlay = null;
    assignRoles(next);
    return next;
  }

  // Advance to the next in-play seat. If the player who just played finished and
  // everyone else has effectively yielded, the next in-play seat leads.
  next.activeSeat = nextInPlaySeat(next, seat);
  return next;
}

// Safe per-client view. Includes only forSeat's hand and legal plays.
export function publicState(state, forSeat) {
  const me = forSeat >= 0 ? state.players[forSeat] : null;
  return {
    phase: state.phase,
    players: state.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      handCount: p.hand.length,
      finished: p.finished,
      role: p.role,
    })),
    activeSeat: state.activeSeat,
    currentPlay: state.currentPlay
      ? { seat: state.currentPlay.seat, cards: [...state.currentPlay.cards], count: state.currentPlay.count }
      : null,
    finishOrder: [...state.finishOrder],
    mySeat: forSeat,
    myHand: me ? [...me.hand] : [],
    legalPlays: legalPlays(state, forSeat),
    canPass: forSeat === state.activeSeat && state.phase === 'playing' && canPass(state),
    winner:
      state.phase === 'done' && state.finishOrder.length > 0
        ? {
            seat: state.finishOrder[0],
            name: state.players[state.finishOrder[0]].name,
            role: 'President',
          }
        : null,
  };
}

export function getOutcome(state) {
  if (state.phase !== 'done') return null;
  const n = state.players.length;
  return {
    outcomes: state.players.map((p) => {
      const place = state.finishOrder.indexOf(p.seat);
      return {
        playerId: p.id,
        rank: place >= 0 ? place + 1 : n,
        score: place >= 0 ? n - place : 0,
        meta: { role: p.role },
      };
    }),
  };
}
