import type { TileKind } from '../tiles/tile-kind.js';
import type { TaiwaneseRules } from '../rules/taiwanese.js';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.js';
import { ALL_TILE_KINDS, toTileCounts } from './counts.js';
import type { HandInput } from './winning.js';
import { toExposedMelds, winningDecompositionsFromCounts } from './winning.js';

const MAX_COPIES = 4;

export function findWaits(
  input: HandInput,
  rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): TileKind[] {
  const counts = toTileCounts(input.concealed);
  const exposed = toExposedMelds(input.exposedMelds);
  const waits: TileKind[] = [];
  for (const kind of ALL_TILE_KINDS) {
    const current = counts.get(kind) ?? 0;
    if (current >= MAX_COPIES) {
      continue;
    }
    const trial = new Map(counts);
    trial.set(kind, current + 1);
    if (winningDecompositionsFromCounts(trial, exposed, rules).length > 0) {
      waits.push(kind);
    }
  }
  return waits;
}
