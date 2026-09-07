import { describe, it, expect } from 'vitest';
import { isYourTurn } from './yourTurn.ts';

describe('isYourTurn', () => {
  it('fires when the active seat transitions to mySeat', () => {
    expect(isYourTurn(1, 0, 0)).toBe(true);
    expect(isYourTurn(null, 2, 2)).toBe(true);
  });

  it('does not fire when it was already my turn', () => {
    expect(isYourTurn(0, 0, 0)).toBe(false);
  });

  it('does not fire when the active seat is not mine', () => {
    expect(isYourTurn(0, 1, 2)).toBe(false);
  });

  it('does not fire for spectators or unseated players', () => {
    expect(isYourTurn(1, -1, -1)).toBe(false);
    expect(isYourTurn(1, 0, null)).toBe(false);
  });
});
