// Portable identity code. It now bundles the secret reconnectToken alongside the
// public playerId so a player carries both to another device in one string,
// replacing the old plaintext guest-only code.
export interface PlayerCode {
  playerId: string;
  reconnectToken: string;
  name: string;
}

export function generatePlayerId(): string {
  return globalThis.crypto.randomUUID();
}

export function playerColor(playerId: string): string {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) {
    h = (Math.imul(31, h) + playerId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export function encodePlayerCode(playerId: string, reconnectToken: string, name = ''): string {
  return btoa(JSON.stringify({ v: 2, id: playerId, rt: reconnectToken, n: name }));
}

export function decodePlayerCode(code: string): PlayerCode {
  let parsed: { v?: number; id?: unknown; rt?: unknown; n?: unknown };
  try {
    parsed = JSON.parse(atob(code));
  } catch {
    throw new Error('invalid code');
  }
  if (
    parsed.v !== 2 ||
    typeof parsed.id !== 'string' || !parsed.id ||
    typeof parsed.rt !== 'string' || !parsed.rt
  ) {
    throw new Error('invalid code');
  }
  return {
    playerId: parsed.id,
    reconnectToken: parsed.rt,
    name: typeof parsed.n === 'string' ? parsed.n : '',
  };
}
