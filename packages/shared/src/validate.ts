// schema is an array of shape objects, e.g. [{ action: 'object' }, { restart: 'boolean' }].
// A message matches if it satisfies at least one shape: every declared key present
// with the correct typeof. Extra keys are ignored. A null/undefined schema means
// the game declares no message contract, so anything passes.
export type MessageShape = Record<
  string,
  'string' | 'number' | 'boolean' | 'object' | 'function' | 'symbol' | 'bigint' | 'undefined'
>;

export type MessageSchema = MessageShape[] | null | undefined;

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateMessage(
  schema: MessageSchema,
  msg: Record<string, unknown>,
): ValidationResult {
  if (!schema) return { ok: true };

  const payload = { ...msg };
  delete payload.t;

  for (const shape of schema) {
    let matches = true;
    for (const [key, expectedType] of Object.entries(shape)) {
      const val = payload[key];
      if (val === undefined) {
        matches = false;
        break;
      }
      if (expectedType === 'object') {
        if (typeof val !== 'object' || val === null) {
          matches = false;
          break;
        }
      } else if (typeof val !== expectedType) {
        matches = false;
        break;
      }
    }
    if (matches) return { ok: true };
  }

  return { ok: false, reason: 'no matching message shape' };
}
