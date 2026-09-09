// DEPRECATED: this static ruleset table no longer feeds the tai pill. The pill
// and the fan and pattern guide now read estimateTai from
// @browser-games/engine-mahjong-analysis, the single source of tai values and
// rule sentences. This module stays for the winning-hand scoreHand helper only;
// do not use TAI_REFERENCE as a UI data source.
import {
  scoreHand,
  TAI_VALUES,
  type Tile,
  type Meld,
  type MeldKind,
  type PatternName,
  type Wind,
} from "@browser-games/engine-mahjong";

const PATTERN_LABEL: Record<PatternName, string> = {
  SELF_DRAW: "Self-draw",
  DEALER: "Dealer",
  ALL_TRIPLETS: "All triplets",
  ALL_ONE_SUIT: "All one suit",
  HALF_FLUSH: "Half flush",
  SEVEN_PAIRS: "Seven pairs",
  FLOWER: "Flower",
  SEAT_FLOWER: "Seat flower",
};

export interface TaiState {
  tai: number | null;
  patterns: string[];
}

export interface TaiReferenceRow {
  label: string;
  tai: number;
}

export const TAI_REFERENCE: TaiReferenceRow[] = [
  { label: PATTERN_LABEL.ALL_ONE_SUIT, tai: TAI_VALUES.allOneSuit },
  { label: PATTERN_LABEL.ALL_TRIPLETS, tai: TAI_VALUES.allTriplets },
  { label: PATTERN_LABEL.HALF_FLUSH, tai: TAI_VALUES.halfFlush },
  { label: PATTERN_LABEL.SEVEN_PAIRS, tai: TAI_VALUES.sevenPairs },
  { label: PATTERN_LABEL.SELF_DRAW, tai: TAI_VALUES.selfDraw },
  { label: PATTERN_LABEL.DEALER, tai: TAI_VALUES.dealer },
  { label: PATTERN_LABEL.FLOWER, tai: TAI_VALUES.flower },
];

function idToTile(id: string): Tile {
  const [prefix, second] = id.split("-");
  if (prefix === "honor") return { id, suit: "honor", honor: second as Tile["honor"] };
  if (prefix === "flower") return { id, suit: "flower", flower: second as Tile["flower"] };
  return { id, suit: prefix as Tile["suit"], rank: Number(second) };
}

function toMeld(meld: { kind: string; tiles: string[] }): Meld {
  return { kind: meld.kind as MeldKind, tiles: meld.tiles.map(idToTile) };
}

// Read the current tai from the scoring module using the local hand only. The
// module returns null unless the hand is a complete winning hand, so this shows
// a live tai the moment the player can win and null otherwise.
export function computeTai(input: {
  hand: string[];
  melds: { kind: string; tiles: string[] }[];
  flowers: string[];
  seatWind: Wind;
  isDealer: boolean;
}): TaiState {
  try {
    const result = scoreHand({
      hand: {
        concealed: input.hand.map(idToTile),
        exposedMelds: input.melds.map(toMeld),
      },
      selfDraw: false,
      isDealer: input.isDealer,
      seatWind: input.seatWind,
      flowers: input.flowers.map(idToTile),
    });
    if (!result) return { tai: null, patterns: [] };
    return {
      tai: result.totalTai,
      patterns: result.patterns.map((p) => PATTERN_LABEL[p.name]),
    };
  } catch {
    return { tai: null, patterns: [] };
  }
}
