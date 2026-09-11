// Pure matchmaking selection. Given the open rooms for a game (the same shape
// RoomManager.listRooms emits, plus a `locked` flag), decide which one a
// "Play now" request should drop into — or signal that a fresh room is needed.
// No I/O, no room mutation: the gateway acts on the decision.

import type { RoomSummary } from './types.ts';

// A room is joinable for quick-match when it is not full and not locked by its
// host. We deliberately ignore in-progress games here; an adapter that wants to
// allow mid-game joins can still expose those rooms as open via listRooms.
export function isQuickMatchable(room: RoomSummary): boolean {
  return !room.locked && room.players < room.max;
}

// Choose the room to seat a quick-match player into. Strategy: prefer the
// fullest joinable room so tables fill up (and start) instead of spreading
// players thin across many half-empty rooms. Ties break on the lexically
// smallest code for deterministic, testable behavior. Returns the chosen room's
// code, or null when none is joinable (caller should create a new room).
export function pickQuickMatchRoom(rooms: RoomSummary[]): string | null {
  const candidates = rooms.filter(isQuickMatchable);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.players !== a.players) return b.players - a.players;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  return candidates[0].code;
}
