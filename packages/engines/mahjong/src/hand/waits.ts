import type { TileKind } from '../tiles/tile-kind.ts';
import type { TaiwaneseRules } from '../rules/taiwanese.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import { ALL_TILE_KINDS, toTileCounts } from './counts.ts';
import type { HandInput } from './winning.ts';
import { toExposedMelds, winningDecompositionsFromCounts } from './winning.ts';

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
