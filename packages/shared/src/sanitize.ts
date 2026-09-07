export const MAX_NAME_LEN = 20;

const PROFANITY = ['fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'piss', 'cock'];

// C0/C1 control chars, zero-width/bidi marks, line/paragraph separators, and BOM.
const CONTROL_CHARS = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]',
  'gu',
);
const EMOJI = '[\\p{Emoji_Presentation}\\p{Extended_Pictographic}](?:\\u200D[\\p{Emoji_Presentation}\\p{Extended_Pictographic}])*';
const EMOJI_BOMB = new RegExp(`(?:${EMOJI}){4,}`, 'gu');
const EMOJI_SINGLE = new RegExp(EMOJI, 'gu');

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new TypeError('name must be a string');
  }
  let name = raw.replace(CONTROL_CHARS, '');
  name = name.replace(EMOJI_BOMB, (match: string) => {
    const segments = match.match(EMOJI_SINGLE) ?? [];
    return segments.slice(0, 2).join('');
  });
  name = name.trim();
  name = [...name].slice(0, MAX_NAME_LEN).join('');
  for (const word of PROFANITY) {
    const re = new RegExp(word, 'gi');
    name = name.replace(re, '***');
  }
  if (name.trim() === '') {
    throw new Error('name required');
  }
  return name;
}
