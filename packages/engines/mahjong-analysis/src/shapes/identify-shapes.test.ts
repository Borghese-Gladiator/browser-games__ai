import { describe, it, expect } from 'vitest';
import { tiles } from '../test-helpers.ts';
import { countsFromTiles } from '../completion/distance.ts';
import { identifyShapes } from './identify-shapes.ts';

describe('identifyShapes', () => {
  it('recognizes runs, pairs, and isolated tiles', () => {
    const shapes = identifyShapes(countsFromTiles(tiles('1m 2m 3m 5m 5m 7m 9p east')));
    expect(shapes).toEqual([
      { kind: 'run', tileKinds: ['1m', '2m', '3m'] },
      { kind: 'pair', tileKinds: ['5m'] },
      { kind: 'isolated', tileKinds: ['7m'] },
      { kind: 'isolated', tileKinds: ['9p'] },
      { kind: 'isolated', tileKinds: ['east'] },
    ]);
  });

  it('recognizes a triplet', () => {
    expect(identifyShapes(countsFromTiles(tiles('3s 3s 3s')))).toEqual([
      { kind: 'triplet', tileKinds: ['3s'] },
    ]);
  });
});
