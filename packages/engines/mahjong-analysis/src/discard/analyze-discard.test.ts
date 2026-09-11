import { describe, it, expect } from 'vitest';
import { tiles } from '../test-helpers.ts';
import { analyzeDiscardOptions } from './analyze-discard.ts';

describe('analyzeDiscardOptions', () => {
  it('analyzes each distinct discardable kind once', () => {
    const analyses = analyzeDiscardOptions({
      concealed: tiles('1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s east'),
      exposedMelds: [],
    });
    const kinds = analyses.map((analysis) => analysis.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('carries completion, improving, shape, and reason fields', () => {
    const [first] = analyzeDiscardOptions({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 4s 5s east'),
      exposedMelds: [],
    });
    expect(first.improvementCount).toBe(first.improvingTileKinds.length);
    expect(first.reasons.map((reason) => reason.code)).toEqual([
      'completion-distance',
      'improving-tiles',
      'good-shapes',
      'wait-count',
      'isolated-penalty',
    ]);
  });

  it('returns identical output for identical input', () => {
    const spec = '1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 4s 5s east';
    const first = analyzeDiscardOptions({ concealed: tiles(spec), exposedMelds: [] });
    const second = analyzeDiscardOptions({ concealed: tiles(spec), exposedMelds: [] });
    expect(first).toEqual(second);
  });
});
