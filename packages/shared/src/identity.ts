export type PlayerType = 'guest' | 'claimed';

export interface DecodedPlayerCode {
  playerId: string;
  name: string;
  type: PlayerType;
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

export function encodePlayerCode(playerId: string, name = ''): string {
  return btoa(JSON.stringify({ v: 1, id: playerId, n: name, type: 'guest' }));
}

export function decodePlayerCode(code: string): DecodedPlayerCode {
  let parsed: any;
  try {
    parsed = JSON.parse(atob(code));
  } catch {
    throw new Error('invalid code');
  }
  if (parsed.v !== 1 || typeof parsed.id !== 'string' || !parsed.id) {
    throw new Error('invalid code');
  }
  return {
    playerId: parsed.id,
    name: typeof parsed.n === 'string' ? parsed.n : '',
    type: parsed.type === 'claimed' ? 'claimed' : 'guest',
  };
}
