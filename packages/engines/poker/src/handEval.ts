// Pure Texas Hold'em hand evaluation. No I/O, no side effects.
// A card is a 2-char string: rank char + suit char, e.g. "As", "Td", "2c".

export type Card = string;

export interface HandValue {
  rank: number;
  name: string;
  tiebreak: number[];
}

export const RANKS = '23456789TJQKA'.split(''); // index 0–12 (2 lowest, Ace highest)
export const SUITS = ['c', 'd', 'h', 's'];

export const HAND_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

// Fisher-Yates. Returns a new array; does not mutate the input.
export function shuffle(deck: Card[]): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rankIndex(card: Card): number {
  return RANKS.indexOf(card[0]);
}

export function suitOf(card: Card): string {
  return card[1];
}

// Find the high card of the best 5-in-a-row straight from a set of rank indices.
// Handles the A-2-3-4-5 wheel (Ace treated as low). Returns the high rank index
// of the straight (4 for the wheel), or -1 if no straight.
function straightHigh(rankSet: Set<number>): number {
  // rankSet: Set of distinct rank indices present
  const present = new Set(rankSet);
  // Ace (12) also counts as low (-1) for the wheel.
  const wheel = present.has(12) ? new Set([...present, -1]) : present;
  for (let high = 12; high >= 3; high--) {
    if (
      wheel.has(high) &&
      wheel.has(high - 1) &&
      wheel.has(high - 2) &&
      wheel.has(high - 3) &&
      wheel.has(high - 4)
    ) {
      return high;
    }
  }
  return -1;
}

// Evaluate exactly 5 cards. Returns { rank, name, tiebreak }.
// rank: 0=high-card … 8=straight-flush.
// tiebreak: ordered rank indices (descending priority) for breaking ties.
export function evaluate5(cards: Card[]): HandValue {
  const ranks = cards.map(rankIndex);
  const suits = cards.map(suitOf);

  // Rank histogram: rankIndex -> count.
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);

  // Groups sorted by (count desc, rank desc).
  const groups = [...counts.entries()].sort((a, b) =>
    b[1] - a[1] || b[0] - a[0],
  );

  const isFlush = suits.every((s) => s === suits[0]);
  const high = straightHigh(new Set(ranks));
  const isStraight = high !== -1 && counts.size === 5;

  if (isStraight && isFlush) {
    return { rank: 8, name: HAND_NAMES[8], tiebreak: [high] };
  }

  // Four of a kind: groups = [[quadRank,4],[kicker,1]]
  if (groups[0][1] === 4) {
    return {
      rank: 7,
      name: HAND_NAMES[7],
      tiebreak: [groups[0][0], groups[1][0]],
    };
  }

  // Full house: [[trips,3],[pair,2]]
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return {
      rank: 6,
      name: HAND_NAMES[6],
      tiebreak: [groups[0][0], groups[1][0]],
    };
  }

  if (isFlush) {
    return {
      rank: 5,
      name: HAND_NAMES[5],
      tiebreak: ranks.slice().sort((a, b) => b - a),
    };
  }

  if (isStraight) {
    return { rank: 4, name: HAND_NAMES[4], tiebreak: [high] };
  }

  // Three of a kind: [[trips,3], kicker, kicker]
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { rank: 3, name: HAND_NAMES[3], tiebreak: [groups[0][0], ...kickers] };
  }

  // Two pair: [[pairHi,2],[pairLo,2],[kicker,1]]
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return {
      rank: 2,
      name: HAND_NAMES[2],
      tiebreak: [...pairs, groups[2][0]],
    };
  }

  // One pair: [[pair,2], k, k, k]
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { rank: 1, name: HAND_NAMES[1], tiebreak: [groups[0][0], ...kickers] };
  }

  // High card
  return {
    rank: 0,
    name: HAND_NAMES[0],
    tiebreak: ranks.slice().sort((a, b) => b - a),
  };
}

function combinations5(cards: Card[]): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return result;
}

// Best 5-card hand out of 7 (or more). Returns the best evaluate5 result.
export function best7(cards: Card[]): HandValue {
  let best: HandValue | null = null;
  for (const combo of combinations5(cards)) {
    const h = evaluate5(combo);
    if (best === null || compareHands(h, best) > 0) best = h;
  }
  return best!;
}

// Compare two evaluate5 results. 1 if h1 > h2, -1 if h1 < h2, 0 if tie.
export function compareHands(h1: HandValue, h2: HandValue): number {
  if (h1.rank !== h2.rank) return h1.rank > h2.rank ? 1 : -1;
  const len = Math.max(h1.tiebreak.length, h2.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const a = h1.tiebreak[i] ?? -1;
    const b = h2.tiebreak[i] ?? -1;
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}
