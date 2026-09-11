import crypto from 'node:crypto';

export function hashState(state: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
}
