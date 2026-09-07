import { describe, it, expect } from 'vitest';
import {
  generatePlayerId,
  playerColor,
  encodePlayerCode,
  decodePlayerCode,
} from './identity.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generatePlayerId', () => {
  it('returns a UUID-format string', () => {
    expect(generatePlayerId()).toMatch(UUID_RE);
  });

  it('returns a different value on each call', () => {
    expect(generatePlayerId()).not.toBe(generatePlayerId());
  });
});

describe('playerColor', () => {
  it('returns an hsl string', () => {
    expect(playerColor('some-id')).toMatch(/^hsl\(\d+, 70%, 55%\)$/);
  });

  it('is deterministic for the same input', () => {
    expect(playerColor('abc')).toBe(playerColor('abc'));
  });

  it('produces different hues for different ids', () => {
    expect(playerColor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).not.toBe(
      playerColor('bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb'),
    );
  });
});

describe('encodePlayerCode / decodePlayerCode', () => {
  it('round-trips id, name, and guest type', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(decodePlayerCode(encodePlayerCode(id, 'Alice'))).toEqual({
      playerId: id,
      name: 'Alice',
      type: 'guest',
    });
  });

  it('round-trips with an empty name by default', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(decodePlayerCode(encodePlayerCode(id))).toEqual({
      playerId: id,
      name: '',
      type: 'guest',
    });
  });

  it('throws on non-base64 input', () => {
    expect(() => decodePlayerCode('notbase64!!')).toThrow('invalid code');
  });

  it('throws when required fields are missing', () => {
    expect(() => decodePlayerCode(btoa('{}'))).toThrow('invalid code');
  });
});
