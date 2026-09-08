import { describe, it, expect } from 'vitest';
import { type MistakeSeverity, SEVERITY_THRESHOLDS, severityForDelta } from './severity.ts';

describe('severityForDelta thresholds', () => {
  it.each<[number, MistakeSeverity]>([
    [0, 'optimal'],
    [SEVERITY_THRESHOLDS.minor - 1, 'optimal'],
    [SEVERITY_THRESHOLDS.minor, 'minor'],
    [SEVERITY_THRESHOLDS.moderate - 1, 'minor'],
    [SEVERITY_THRESHOLDS.moderate, 'moderate'],
    [SEVERITY_THRESHOLDS.severe - 1, 'moderate'],
    [SEVERITY_THRESHOLDS.severe, 'severe'],
    [SEVERITY_THRESHOLDS.severe + 500, 'severe'],
  ])('maps delta %d to %s', (delta, expected) => {
    expect(severityForDelta(delta)).toBe(expected);
  });
});
