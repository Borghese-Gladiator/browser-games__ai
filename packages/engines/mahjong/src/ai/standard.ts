import type { Tile } from '../tiles/tile.ts';
import type { TileKind } from '../tiles/tile-kind.ts';
import { tileToKind } from '../tiles/tile-kind.ts';
import type { TaiwaneseRules } from '../rules/taiwanese.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import { ALL_TILE_KINDS } from '../hand/counts.ts';
import type { HandInput } from '../hand/winning.ts';
import { findWaits } from '../hand/waits.ts';
import type { DiscardAction, GameAction } from '../game/actions.ts';
import type { GameState } from '../game/state.ts';
import { getPlayer } from '../game/state.ts';
import type { Rng } from './random.ts';

const TOTAL_MELDS = 5;
const MAX_COPIES = 4;
const SUIT_COUNT = 27;
const SUIT_WIDTH = 9;

const WEIGHT_DISTANCE = -1000;
const WEIGHT_IMPROVEMENT = 20;
const WEIGHT_SHAPE = 10;
const WEIGHT_WAIT = 15;
const PENALTY_ISOLATED_HONOR = 6;
const PENALTY_ISOLATED_NUMBER = 2;

const MEMO_CAP = 300000;

const KIND_INDEX = new Map<TileKind, number>();
ALL_TILE_KINDS.forEach((kind, index) => KIND_INDEX.set(kind, index));

function isNumberIndex(index: number): boolean {
  return index < SUIT_COUNT;
}

function rankPosition(index: number): number {
  return index % SUIT_WIDTH;
}

function countsFromTiles(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(ALL_TILE_KINDS.length).fill(0);
  for (const tile of tiles) {
    if (tile.suit === 'flower') {
      continue;
    }
    const index = KIND_INDEX.get(tileToKind(tile));
    if (index !== undefined) {
      counts[index] += 1;
    }
  }
  return counts;
}

const structureMemo = new Map<string, number>();

function serialize(counts: readonly number[]): string {
  return counts.join('');
}

function bestStructureValue(
  counts: number[],
  start: number,
  sets: number,
  partials: number,
  hasPair: boolean,
  setsNeeded: number,
): number {
  let index = start;
  while (index < counts.length && counts[index] === 0) {
    index += 1;
  }
  if (index === counts.length) {
    return 2 * sets + partials + (hasPair ? 1 : 0);
  }

  const key = `${serialize(counts)}|${index}|${sets}|${partials}|${hasPair ? 1 : 0}|${setsNeeded}`;
  const cached = structureMemo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best = 2 * sets + partials + (hasPair ? 1 : 0);
  const count = counts[index];
  const number = isNumberIndex(index);
  const rank = rankPosition(index);

  if (sets < setsNeeded && count >= 3) {
    counts[index] -= 3;
    best = Math.max(best, bestStructureValue(counts, index, sets + 1, partials, hasPair, setsNeeded));
    counts[index] += 3;
  }

  if (sets < setsNeeded && number && rank <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    counts[index + 2] -= 1;
    best = Math.max(best, bestStructureValue(counts, index, sets + 1, partials, hasPair, setsNeeded));
    counts[index] += 1;
    counts[index + 1] += 1;
    counts[index + 2] += 1;
  }

  if (!hasPair && count >= 2) {
    counts[index] -= 2;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials, true, setsNeeded));
    counts[index] += 2;
  }

  if (sets + partials < setsNeeded && count >= 2) {
    counts[index] -= 2;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials + 1, hasPair, setsNeeded));
    counts[index] += 2;
  }

  if (sets + partials < setsNeeded && number && rank <= 7 && counts[index + 1] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials + 1, hasPair, setsNeeded));
    counts[index] += 1;
    counts[index + 1] += 1;
  }

  if (sets + partials < setsNeeded && number && rank <= 6 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 2] -= 1;
    best = Math.max(best, bestStructureValue(counts, index, sets, partials + 1, hasPair, setsNeeded));
    counts[index] += 1;
    counts[index + 2] += 1;
  }

  counts[index] -= 1;
  best = Math.max(best, bestStructureValue(counts, index, sets, partials, hasPair, setsNeeded));
  counts[index] += 1;

  structureMemo.set(key, best);
  return best;
}

function structureValue(counts: number[], setsNeeded: number): number {
  if (structureMemo.size > MEMO_CAP) {
    structureMemo.clear();
  }
  return bestStructureValue(counts, 0, 0, 0, false, setsNeeded);
}

function shantenFromCounts(counts: number[], setsNeeded: number): number {
  return 2 * setsNeeded - structureValue(counts, setsNeeded);
}

export function standardShanten(
  concealed: readonly Tile[],
  exposedMeldCount: number,
  _rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): number {
  const setsNeeded = TOTAL_MELDS - exposedMeldCount;
  if (setsNeeded < 0) {
    return 0;
  }
  return shantenFromCounts(countsFromTiles(concealed), setsNeeded);
}

function candidateIndices(counts: readonly number[]): number[] {
  const seen = new Set<number>();
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] === 0) {
      continue;
    }
    seen.add(index);
    if (!isNumberIndex(index)) {
      continue;
    }
    const rank = rankPosition(index);
    if (rank >= 1) {
      seen.add(index - 1);
    }
    if (rank >= 2) {
      seen.add(index - 2);
    }
    if (rank <= 7) {
      seen.add(index + 1);
    }
    if (rank <= 6) {
      seen.add(index + 2);
    }
  }
  return [...seen];
}

function countImprovements(counts: number[], setsNeeded: number, base: number): number {
  let improvements = 0;
  for (const index of candidateIndices(counts)) {
    if (counts[index] >= MAX_COPIES) {
      continue;
    }
    counts[index] += 1;
    const shanten = shantenFromCounts(counts, setsNeeded);
    counts[index] -= 1;
    if (shanten < base) {
      improvements += 1;
    }
  }
  return improvements;
}

function countGoodShapes(counts: readonly number[]): number {
  let score = 0;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= 2) {
      score += 1;
    }
    if (isNumberIndex(index) && rankPosition(index) <= 7 && counts[index] > 0 && counts[index + 1] > 0) {
      score += 1;
    }
  }
  return score;
}

function hasNumberNeighbor(counts: readonly number[], index: number): boolean {
  const rank = rankPosition(index);
  if (rank >= 1 && counts[index - 1] > 0) {
    return true;
  }
  if (rank >= 2 && counts[index - 2] > 0) {
    return true;
  }
  if (rank <= 7 && counts[index + 1] > 0) {
    return true;
  }
  if (rank <= 6 && counts[index + 2] > 0) {
    return true;
  }
  return false;
}

function isolatedPenalty(counts: readonly number[]): number {
  let penalty = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count !== 1) {
      continue;
    }
    if (isNumberIndex(index)) {
      if (!hasNumberNeighbor(counts, index)) {
        penalty += PENALTY_ISOLATED_NUMBER;
      }
    } else {
      penalty += PENALTY_ISOLATED_HONOR;
    }
  }
  return penalty;
}

export interface DiscardEvaluation {
  readonly tile: Tile;
  readonly kind: TileKind;
  readonly score: number;
  readonly completionDistance: number;
  readonly improvementCount: number;
  readonly shapeQuality: number;
  readonly waitQuality: number;
  readonly isolatedTilePenalty: number;
}

function removeFirstById(tiles: readonly Tile[], target: Tile): Tile[] {
  const result = tiles.slice();
  const index = result.findIndex((tile) => tile.id === target.id);
  if (index !== -1) {
    result.splice(index, 1);
  }
  return result;
}

function scoreDiscard(
  remaining: readonly Tile[],
  exposedMelds: HandInput['exposedMelds'],
  rules: TaiwaneseRules,
  tile: Tile,
  kind: TileKind,
): DiscardEvaluation {
  const exposedCount = exposedMelds.length;
  const setsNeeded = TOTAL_MELDS - exposedCount;
  const counts = countsFromTiles(remaining);
  const completionDistance = shantenFromCounts(counts, setsNeeded);
  const improvementCount = countImprovements(counts, setsNeeded, completionDistance);
  const shapeQuality = countGoodShapes(counts);
  const waitQuality =
    completionDistance === 0 ? findWaits({ concealed: remaining, exposedMelds }, rules).length : 0;
  const penalty = isolatedPenalty(counts);
  const score =
    completionDistance * WEIGHT_DISTANCE +
    improvementCount * WEIGHT_IMPROVEMENT +
    shapeQuality * WEIGHT_SHAPE +
    waitQuality * WEIGHT_WAIT -
    penalty;
  return {
    tile,
    kind,
    score,
    completionDistance,
    improvementCount,
    shapeQuality,
    waitQuality,
    isolatedTilePenalty: penalty,
  };
}

export function evaluateDiscards(
  input: HandInput,
  rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): DiscardEvaluation[] {
  const evaluations: DiscardEvaluation[] = [];
  const seen = new Set<TileKind>();
  for (const tile of input.concealed) {
    if (tile.suit === 'flower') {
      continue;
    }
    const kind = tileToKind(tile);
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    const remaining = removeFirstById(input.concealed, tile);
    evaluations.push(scoreDiscard(remaining, input.exposedMelds, rules, tile, kind));
  }
  evaluations.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
  return evaluations;
}

function removeMatching(tiles: readonly Tile[], target: Tile, limit: number): Tile[] {
  const result = tiles.slice();
  const targetKind = tileToKind(target);
  let removed = 0;
  for (let index = result.length - 1; index >= 0 && removed < limit; index -= 1) {
    if (result[index].suit === 'flower') {
      continue;
    }
    if (tileToKind(result[index]) === targetKind) {
      result.splice(index, 1);
      removed += 1;
    }
  }
  return result;
}

export function shouldClaimPong(
  input: HandInput,
  discard: Tile,
  rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): boolean {
  const exposedCount = input.exposedMelds.length;
  const remaining = removeMatching(input.concealed, discard, 2);
  if (input.concealed.length - remaining.length < 2) {
    return false;
  }
  const before = standardShanten(input.concealed, exposedCount, rules);
  const after = standardShanten(remaining, exposedCount + 1, rules);
  return after < before;
}

export type StandardAi = (
  state: GameState,
  actions: readonly GameAction[],
  rng: Rng,
) => GameAction;

function chooseAction(state: GameState, actions: readonly GameAction[]): GameAction {
  const win = actions.find((action) => action.type === 'DECLARE_WIN');
  if (win) {
    return win;
  }
  const draw = actions.find((action) => action.type === 'DRAW');
  if (draw) {
    return draw;
  }
  const pass = actions.find((action) => action.type === 'PASS_CLAIM');
  if (pass) {
    const pong = actions.find((action) => action.type === 'CLAIM_PONG');
    if (pong && state.pendingClaim) {
      const held = getPlayer(state, pong.player);
      const improving = shouldClaimPong(
        { concealed: held.hand, exposedMelds: held.melds },
        state.pendingClaim.discard.tile,
        state.rules,
      );
      if (improving) {
        return pong;
      }
    }
    return pass;
  }
  const discards = actions.filter((action): action is DiscardAction => action.type === 'DISCARD');
  if (discards.length > 0) {
    const player = discards[0].player;
    const held = getPlayer(state, player);
    const evaluations = evaluateDiscards(
      { concealed: held.hand, exposedMelds: held.melds },
      state.rules,
    );
    if (evaluations.length > 0) {
      const best = evaluations[0].kind;
      const match = discards.find((action) => tileToKind(action.tile) === best);
      if (match) {
        return match;
      }
    }
    return discards[0];
  }
  return actions[0];
}

export function createStandardAi(_seed?: number): StandardAi {
  return (state, actions, _rng) => chooseAction(state, actions);
}
