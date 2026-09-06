export type Suit = 'characters' | 'bamboo' | 'dots' | 'honor' | 'flower';

export type HonorKind = 'east' | 'south' | 'west' | 'north' | 'red' | 'green' | 'white';

export type FlowerKind =
  | 'plum'
  | 'orchid'
  | 'chrysanthemum'
  | 'bamboo'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter';

export interface Tile {
  id: string;
  suit: Suit;
  rank?: number;
  honor?: HonorKind;
  flower?: FlowerKind;
}
