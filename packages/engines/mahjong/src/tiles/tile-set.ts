import type { FlowerKind, HonorKind, Suit, Tile } from './tile.ts';

const NUMBER_SUITS: Suit[] = ['characters', 'bamboo', 'dots'];

const HONORS: HonorKind[] = ['east', 'south', 'west', 'north', 'red', 'green', 'white'];

const FLOWERS: FlowerKind[] = [
  'plum',
  'orchid',
  'chrysanthemum',
  'bamboo',
  'spring',
  'summer',
  'autumn',
  'winter',
];

const COPIES = 4;

export function createTaiwaneseTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of NUMBER_SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let copy = 1; copy <= COPIES; copy++) {
        tiles.push({ id: `${suit}-${rank}-${copy}`, suit, rank });
      }
    }
  }
  for (const honor of HONORS) {
    for (let copy = 1; copy <= COPIES; copy++) {
      tiles.push({ id: `honor-${honor}-${copy}`, suit: 'honor', honor });
    }
  }
  for (const flower of FLOWERS) {
    tiles.push({ id: `flower-${flower}-1`, suit: 'flower', flower });
  }
  return tiles;
}
