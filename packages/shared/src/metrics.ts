export const SLOW_GAME_THRESHOLD_MS = 600_000; // 10 minutes

export function isSlowGame(
  phaseEnteredAt: number | null | undefined,
  now: number,
  thresholdMs = SLOW_GAME_THRESHOLD_MS,
): boolean {
  if (phaseEnteredAt == null) return false;
  return now - phaseEnteredAt >= thresholdMs;
}

// Returns msg/sec rounded to 1 decimal.
export function rollupMessagesPerSec(count: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((count / elapsedMs) * 1000 * 10) / 10;
}
