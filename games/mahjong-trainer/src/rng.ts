export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextSeed(seed: number): number {
  let state = ((seed >>> 0) + 0x9e3779b9) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x21f0aaad) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x735a2d97) >>> 0;
  return (state ^ (state >>> 15)) >>> 0;
}
