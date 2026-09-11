// Shared mistake-severity classification. The discard trainer and the post-game
// review both grade a discard by how far its score falls short of the best
// discard, then map that shortfall to one severity band. This is the single
// source of truth for the thresholds so both surfaces classify identically.

export type MistakeSeverity = 'optimal' | 'minor' | 'moderate' | 'severe';

export const SEVERITY_THRESHOLDS: Readonly<{ minor: number; moderate: number; severe: number }> = {
  minor: 1,
  moderate: 20,
  severe: 1000,
};

export function severityForDelta(deltaScore: number): MistakeSeverity {
  if (deltaScore < SEVERITY_THRESHOLDS.minor) {
    return 'optimal';
  }
  if (deltaScore < SEVERITY_THRESHOLDS.moderate) {
    return 'minor';
  }
  if (deltaScore < SEVERITY_THRESHOLDS.severe) {
    return 'moderate';
  }
  return 'severe';
}
