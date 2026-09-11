import type { TileKind } from '@browser-games/engine-mahjong';
import { indexToKind, isNumberIndex, rankPosition } from '../completion/distance.ts';

export type ShapeKind = 'pair' | 'partial-run' | 'run' | 'triplet' | 'isolated';

export interface IdentifiedShape {
  readonly kind: ShapeKind;
  readonly tileKinds: readonly TileKind[];
}

export function identifyShapes(counts: readonly number[]): readonly IdentifiedShape[] {
  const work = counts.slice();
  const shapes: IdentifiedShape[] = [];

  for (let index = 0; index < work.length; index += 1) {
    while (work[index] >= 3) {
      work[index] -= 3;
      shapes.push({ kind: 'triplet', tileKinds: [indexToKind(index)] });
    }
  }

  for (let index = 0; index < work.length; index += 1) {
    if (!isNumberIndex(index) || rankPosition(index) > 6) {
      continue;
    }
    while (work[index] > 0 && work[index + 1] > 0 && work[index + 2] > 0) {
      work[index] -= 1;
      work[index + 1] -= 1;
      work[index + 2] -= 1;
      shapes.push({
        kind: 'run',
        tileKinds: [indexToKind(index), indexToKind(index + 1), indexToKind(index + 2)],
      });
    }
  }

  for (let index = 0; index < work.length; index += 1) {
    while (work[index] >= 2) {
      work[index] -= 2;
      shapes.push({ kind: 'pair', tileKinds: [indexToKind(index)] });
    }
  }

  for (let index = 0; index < work.length; index += 1) {
    if (!isNumberIndex(index) || rankPosition(index) > 7) {
      continue;
    }
    while (work[index] > 0 && work[index + 1] > 0) {
      work[index] -= 1;
      work[index + 1] -= 1;
      shapes.push({ kind: 'partial-run', tileKinds: [indexToKind(index), indexToKind(index + 1)] });
    }
  }

  for (let index = 0; index < work.length; index += 1) {
    if (!isNumberIndex(index) || rankPosition(index) > 6) {
      continue;
    }
    while (work[index] > 0 && work[index + 2] > 0) {
      work[index] -= 1;
      work[index + 2] -= 1;
      shapes.push({ kind: 'partial-run', tileKinds: [indexToKind(index), indexToKind(index + 2)] });
    }
  }

  for (let index = 0; index < work.length; index += 1) {
    while (work[index] > 0) {
      work[index] -= 1;
      shapes.push({ kind: 'isolated', tileKinds: [indexToKind(index)] });
    }
  }

  return shapes;
}
