import type { Ruleset, TaiPatternDef } from './types.ts';

export const TAI_VALUES: Record<string, TaiPatternDef> = {
  self_draw: {
    id: 'self_draw',
    english: 'Self-draw',
    chinese: '自摸',
    tai: 1,
    rule: 'You win on a tile that you draw yourself.',
  },
  dealer: {
    id: 'dealer',
    english: 'Dealer',
    chinese: '莊家',
    tai: 1,
    rule: 'You are the dealer for this hand.',
  },
  concealed_hand: {
    id: 'concealed_hand',
    english: 'Concealed hand',
    chinese: '門清',
    tai: 1,
    rule: 'You complete the hand with no exposed melds.',
  },
  three_concealed_triplets: {
    id: 'three_concealed_triplets',
    english: 'Three concealed triplets',
    chinese: '三暗刻',
    tai: 2,
    rule: 'Your hand holds at least three concealed triplets.',
  },
  dragon_triplet: {
    id: 'dragon_triplet',
    english: 'Dragon triplet',
    chinese: '三元牌',
    tai: 1,
    rule: 'Your hand holds a triplet of a dragon tile.',
  },
  seat_wind: {
    id: 'seat_wind',
    english: 'Seat wind',
    chinese: '門風',
    tai: 1,
    rule: 'Your hand holds a triplet of your seat wind.',
  },
  round_wind: {
    id: 'round_wind',
    english: 'Round wind',
    chinese: '圈風',
    tai: 1,
    rule: 'Your hand holds a triplet of the round wind.',
  },
  all_triplets: {
    id: 'all_triplets',
    english: 'All triplets',
    chinese: '碰碰胡',
    tai: 4,
    rule: 'Every meld in your hand is a triplet.',
  },
  full_flush: {
    id: 'full_flush',
    english: 'Full flush',
    chinese: '清一色',
    tai: 8,
    rule: 'Every tile in your hand comes from one number suit.',
  },
  half_flush: {
    id: 'half_flush',
    english: 'Half flush',
    chinese: '混一色',
    tai: 4,
    rule: 'Your hand uses one number suit with honor tiles.',
  },
  seven_pairs: {
    id: 'seven_pairs',
    english: 'Seven pairs',
    chinese: '七對',
    tai: 4,
    rule: 'Your hand is seven pairs.',
  },
  flower: {
    id: 'flower',
    english: 'Flower',
    chinese: '花牌',
    tai: 1,
    rule: 'You hold at least one flower tile.',
  },
  seat_flower: {
    id: 'seat_flower',
    english: 'Seat flower',
    chinese: '正花',
    tai: 1,
    rule: 'You hold a flower tile that matches your seat.',
  },
};

export const RULESET: Ruleset = {
  taiValues: TAI_VALUES,
  maxTilesInHand: 17,
};
