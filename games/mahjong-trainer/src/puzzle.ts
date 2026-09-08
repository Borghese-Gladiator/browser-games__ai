import type { Tile } from '@browser-games/engine-mahjong';
import { DEFAULT_TAIWANESE_RULES, createTaiwaneseTileSet } from '@browser-games/engine-mahjong';
import type { RankedDiscard } from '@browser-games/engine-mahjong-analysis';
import { rankDiscards } from '@browser-games/engine-mahjong-analysis';
import { makeRng, nextSeed } from './rng.ts';

export const MEANINGFUL_SPREAD_THRESHOLD = 20;

const MAX_GENERATION_ATTEMPTS = 500;
const HAND_SIZE = DEFAULT_TAIWANESE_RULES.concealedHandSize + 1;

export interface DiscardTrainerPuzzle {
  readonly seed: number;
  readonly hand: readonly Tile[];
  readonly ranking: readonly RankedDiscard[];
  readonly spread: number;
}

export function dealHand(rng: () => number): Tile[] {
  const wall = createTaiwaneseTileSet().filter((tile) => tile.suit !== 'flower');
  for (let i = wall.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall.slice(0, HAND_SIZE);
}

export function rankingSpread(ranking: readonly RankedDiscard[]): number {
  if (ranking.length === 0) {
    return 0;
  }
  return ranking[0].score - ranking[ranking.length - 1].score;
}

export function isMeaningfulSpread(ranking: readonly RankedDiscard[]): boolean {
  return rankingSpread(ranking) > MEANINGFUL_SPREAD_THRESHOLD;
}

export function generatePuzzle(seed: number): DiscardTrainerPuzzle {
  let current = seed >>> 0;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const hand = dealHand(makeRng(current));
    const ranking = rankDiscards({ concealed: hand, exposedMelds: [] });
    if (isMeaningfulSpread(ranking)) {
      return { seed: current, hand, ranking, spread: rankingSpread(ranking) };
    }
    current = nextSeed(current);
  }
  throw new Error(
    `no puzzle with a meaningful spread found within ${MAX_GENERATION_ATTEMPTS} attempts from seed ${seed}`,
  );
}
