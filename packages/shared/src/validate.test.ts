import { describe, it, expect } from 'vitest';
import { validateMessage, type MessageShape } from './validate.js';

const schema: MessageShape[] = [{ action: 'object' }, { restart: 'boolean' }];

describe('validateMessage', () => {
  it('accepts a valid action message', () => {
    expect(validateMessage(schema, { t: 'game', action: { kind: 'bet' } }).ok).toBe(true);
  });

  it('accepts a valid restart message', () => {
    expect(validateMessage(schema, { t: 'game', restart: true }).ok).toBe(true);
  });

  it('rejects a message missing all declared keys', () => {
    const res = validateMessage(schema, { t: 'game', evil: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBeTruthy();
  });

  it('rejects a wrong-typed value', () => {
    expect(validateMessage(schema, { t: 'game', restart: 'yes' }).ok).toBe(false);
    expect(validateMessage(schema, { t: 'game', action: 'bet' }).ok).toBe(false);
  });

  it('rejects an empty payload', () => {
    expect(validateMessage(schema, { t: 'game' }).ok).toBe(false);
  });

  it('treats null as not an object', () => {
    expect(validateMessage(schema, { t: 'game', action: null }).ok).toBe(false);
  });

  it('passes everything when schema is null/undefined', () => {
    expect(validateMessage(null, { t: 'game', anything: 1 }).ok).toBe(true);
    expect(validateMessage(undefined, {}).ok).toBe(true);
  });
});
