import { describe, it, expect } from 'vitest';
import { pickQuickMatchRoom, isQuickMatchable } from './matchmaking.js';
import type { RoomSummary } from './types.ts';

const room = (code: string, players: number, max = 4, locked = false): RoomSummary =>
  ({ code, players, max, locked, host: null });

describe('isQuickMatchable', () => {
  it('accepts an open, unlocked room', () => {
    expect(isQuickMatchable(room('AAAA', 1))).toBe(true);
  });
  it('rejects a full room', () => {
    expect(isQuickMatchable(room('AAAA', 4))).toBe(false);
  });
  it('rejects a locked room', () => {
    expect(isQuickMatchable(room('AAAA', 1, 4, true))).toBe(false);
  });
});

describe('pickQuickMatchRoom', () => {
  it('returns null when there are no rooms', () => {
    expect(pickQuickMatchRoom([])).toBeNull();
  });

  it('returns null when every room is full or locked', () => {
    expect(pickQuickMatchRoom([room('AAAA', 4), room('BBBB', 1, 4, true)])).toBeNull();
  });

  it('prefers the fullest joinable room so tables fill up', () => {
    const rooms = [room('AAAA', 1), room('BBBB', 3), room('CCCC', 2)];
    expect(pickQuickMatchRoom(rooms)).toBe('BBBB');
  });

  it('breaks ties on the lexically smallest code (deterministic)', () => {
    const rooms = [room('ZZZZ', 2), room('AAAA', 2)];
    expect(pickQuickMatchRoom(rooms)).toBe('AAAA');
  });

  it('skips full/locked rooms even when they are fullest', () => {
    const rooms = [room('AAAA', 4), room('BBBB', 3, 4, true), room('CCCC', 1)];
    expect(pickQuickMatchRoom(rooms)).toBe('CCCC');
  });
});
