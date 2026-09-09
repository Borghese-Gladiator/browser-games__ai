import type { Tile, TileKind } from '@browser-games/engine-mahjong';
import { findWaits, tileToKind } from '@browser-games/engine-mahjong';
import type { DiscardPosition } from '../completion/distance.ts';
import { TOTAL_MELDS, countsFromTiles, shantenFromCounts } from '../completion/distance.ts';
import { improvingKindsFromCounts } from '../acceptance/improving-tiles.ts';
import type { ShapeMetrics } from '../shapes/shape-quality.ts';
import { shapeMetrics } from '../shapes/shape-quality.ts';
import type { DiscardReason } from '../explanations/reasons.ts';
import { buildDiscardReasons } from '../explanations/reasons.ts';

export interface DiscardAnalysis {
  readonly tile: Tile;
  readonly kind: TileKind;
  readonly completionDistance: number;
  readonly improvingTileKinds: readonly TileKind[];
  readonly improvementCount: number;
  readonly shapeMetrics: ShapeMetrics;
  readonly waitQuality: number;
  readonly reasons: readonly DiscardReason[];
}

function removeFirstById(tiles: readonly Tile[], target: Tile): Tile[] {
  const result = tiles.slice();
  const index = result.findIndex((tile) => tile.id === target.id);
  if (index !== -1) {
    result.splice(index, 1);
  }
  return result;
}

function analyzeDiscard(position: DiscardPosition, tile: Tile): DiscardAnalysis {
  const remaining = removeFirstById(position.concealed, tile);
  const setsNeeded = TOTAL_MELDS - position.exposedMelds.length;
  const counts = countsFromTiles(remaining);
  const completionDistance = shantenFromCounts(counts, setsNeeded);
  const improvingTileKinds = improvingKindsFromCounts(counts, setsNeeded, completionDistance);
  const metrics = shapeMetrics(counts);
  const waitQuality =
    completionDistance === 0
      ? findWaits({ concealed: remaining, exposedMelds: position.exposedMelds }, position.rules).length
      : 0;
  const base = {
    tile,
    kind: tileToKind(tile),
    completionDistance,
    improvingTileKinds,
    improvementCount: improvingTileKinds.length,
    shapeMetrics: metrics,
    waitQuality,
  };
  return { ...base, reasons: buildDiscardReasons(base) };
}

export function analyzeDiscardOptions(position: DiscardPosition): readonly DiscardAnalysis[] {
  const analyses: DiscardAnalysis[] = [];
  const seen = new Set<TileKind>();
  for (const tile of position.concealed) {
    if (tile.suit === 'flower') {
      continue;
    }
    const kind = tileToKind(tile);
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    analyses.push(analyzeDiscard(position, tile));
  }
  return analyses;
}
