// Pure backoff math for socket auto-reconnect. No React/DOM deps so it's unit-testable.

export const MAX_ATTEMPTS = 10;

// Exponential backoff with jitter, clamped to [base, max].
export function nextDelay(attempt: number, { base = 500, max = 30_000 }: { base?: number; max?: number } = {}): number {
  return Math.min(base * 2 ** attempt, max) * (0.85 + Math.random() * 0.3);
}

export function shouldReconnect(attempt: number): boolean {
  return attempt < MAX_ATTEMPTS;
}
