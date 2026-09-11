import type { DiscardAnalysis } from '../discard/analyze-discard.ts';

export type DiscardReasonCode =
  | 'completion-distance'
  | 'improving-tiles'
  | 'good-shapes'
  | 'wait-count'
  | 'isolated-penalty';

export interface DiscardReason {
  readonly code: DiscardReasonCode;
  readonly value: number;
  readonly contribution: number;
}

const WEIGHT_DISTANCE = -1000;
const WEIGHT_IMPROVEMENT = 20;
const WEIGHT_SHAPE = 10;
const WEIGHT_WAIT = 15;

export function buildDiscardReasons(
  analysis: Omit<DiscardAnalysis, 'reasons'>,
): readonly DiscardReason[] {
  return [
    {
      code: 'completion-distance',
      value: analysis.completionDistance,
      contribution: analysis.completionDistance * WEIGHT_DISTANCE,
    },
    {
      code: 'improving-tiles',
      value: analysis.improvementCount,
      contribution: analysis.improvementCount * WEIGHT_IMPROVEMENT,
    },
    {
      code: 'good-shapes',
      value: analysis.shapeMetrics.shapeQuality,
      contribution: analysis.shapeMetrics.shapeQuality * WEIGHT_SHAPE,
    },
    {
      code: 'wait-count',
      value: analysis.waitQuality,
      contribution: analysis.waitQuality * WEIGHT_WAIT,
    },
    {
      code: 'isolated-penalty',
      value: analysis.shapeMetrics.isolatedTilePenalty,
      contribution: -analysis.shapeMetrics.isolatedTilePenalty,
    },
  ];
}
