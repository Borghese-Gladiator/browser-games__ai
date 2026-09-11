// Framework-side player identity. The stable, public key is a UUID generated
// once per browser and persisted in localStorage; it is carried on every socket
// connection so the server recognizes returning players. Beside it we persist a
// secret reconnectToken (minted server-side, required to restore a seat) and the
// last room code, so a reload reconnects to the same seat automatically.
// importIdentity swaps both the id and the token for ones decoded from a player
// code, letting a player carry their identity to another browser or device.
import { useState, useCallback } from 'react';
import { encodePlayerCode, decodePlayerCode, playerColor } from '@portal/shared/identity';

const STORAGE_KEY = 'browser-games:playerId';
const NAME_KEY = 'browser-games:playerName';
const TOKEN_KEY = 'browser-games:reconnectToken';
const ROOM_KEY = 'browser-games:lastRoom';

export interface Identity {
  playerId: string;
  reconnectToken: string | null;
  setReconnectToken(token: string): void;
  lastRoom: string | null;
  setLastRoom(code: string | null): void;
  name: string;
  setName(next: string): void;
  color: string;
  playerCode: string;
  importIdentity(code: string): boolean;
}

export function useIdentity(): Identity {
  const [playerId] = useState<string>(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = globalThis.crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  });

  // Secret token, minted server-side and returned only to this owner on `joined`.
  const [reconnectToken, setReconnectTokenState] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const setReconnectToken = useCallback((token: string) => {
    setReconnectTokenState(token);
    localStorage.setItem(TOKEN_KEY, token);
  }, []);

  // Last room joined, so a fresh connection can auto-rejoin the held seat.
  const [lastRoom, setLastRoomState] = useState<string | null>(
    () => localStorage.getItem(ROOM_KEY),
  );
  const setLastRoom = useCallback((code: string | null) => {
    setLastRoomState(code);
    if (code) localStorage.setItem(ROOM_KEY, code);
    else localStorage.removeItem(ROOM_KEY);
  }, []);

  // Last-used display name, so a player who leaves/rejoins or reloads doesn't
  // have to retype it. Persisted through setName.
  const [name, setNameState] = useState<string>(() => localStorage.getItem(NAME_KEY) || '');
  const setName = useCallback((next: string) => {
    setNameState(next);
    if (next) localStorage.setItem(NAME_KEY, next);
  }, []);

  const importIdentity = useCallback((code: string): boolean => {
    try {
      const { playerId: newId, reconnectToken: newToken } = decodePlayerCode(code);
      localStorage.setItem(STORAGE_KEY, newId);
      localStorage.setItem(TOKEN_KEY, newToken);
      // Dropping the last room avoids a rejoin attempt against a seat the
      // imported identity never held.
      localStorage.removeItem(ROOM_KEY);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    playerId,
    reconnectToken,
    setReconnectToken,
    lastRoom,
    setLastRoom,
    name,
    setName,
    color: playerColor(playerId),
    playerCode: encodePlayerCode(playerId, reconnectToken ?? '', name),
    importIdentity,
  };
}
