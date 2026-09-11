// Secret per-seat reconnect token. The gateway mints one when a player first
// takes a seat, returns it only to that owner, and requires it (via a constant-
// time compare) before it restores a held seat or accepts a host action. The
// token is never broadcast and never placed in any per-seat public state.

import crypto from 'node:crypto';

export function mintReconnectToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Constant-time compare. Returns false on a length mismatch or a null/undefined
// side rather than throwing, so callers can treat every failure the same way.
export function verifyReconnectToken(
  expected: string | null | undefined,
  presented: string | null | undefined,
): boolean {
  if (typeof expected !== 'string' || typeof presented !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
