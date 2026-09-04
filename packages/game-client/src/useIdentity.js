// Framework-side player identity. The stable key is a UUID generated once per
// browser and persisted in localStorage; it is carried on every socket
// connection so the server recognizes returning players. importIdentity swaps
// the stored key for one decoded from a player code (the export/import escape
// hatch), letting a player carry their identity to another browser/device.
import { useState, useCallback } from 'react';
import { encodePlayerCode, decodePlayerCode, playerColor } from '@portal/shared/identity';

const STORAGE_KEY = 'browser-games:playerId';
const NAME_KEY = 'browser-games:playerName';

export function useIdentity() {
  const [playerId] = useState(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = globalThis.crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  });

  // Last-used display name, so a player who leaves/rejoins or reloads doesn't
  // have to retype it. Persisted through setName.
  const [name, setNameState] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const setName = useCallback((next) => {
    setNameState(next);
    if (next) localStorage.setItem(NAME_KEY, next);
  }, []);

  const importIdentity = useCallback((code) => {
    try {
      const { playerId: newId } = decodePlayerCode(code);
      localStorage.setItem(STORAGE_KEY, newId);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    playerId,
    name,
    setName,
    color: playerColor(playerId),
    playerCode: encodePlayerCode(playerId),
    importIdentity,
  };
}
