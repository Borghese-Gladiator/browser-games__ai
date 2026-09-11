export type Suit = "char" | "dot" | "bam" | "wind" | "dragon" | "flower";
export type TileSize = "xs" | "sm" | "md" | "lg";
export type SeatPosition = "bottom" | "right" | "top" | "left";

export interface ParsedTile {
  suit: Suit;
  rank: number;
  code: string;
  label: string;
}

const SUIT_SUFFIX: Record<string, string> = { characters: "m", bamboo: "s", dots: "p" };
const SUIT_WORD: Record<string, string> = {
  characters: "characters",
  bamboo: "bamboo",
  dots: "dots",
};

const WINDS = new Set(["east", "south", "west", "north"]);

// Compact glyph text, e.g. "5p", "east", "plum". Used as a text fallback.
export function tileShort(tileId: string): string {
  const [prefix, second] = tileId.split("-");
  if (prefix === "honor" || prefix === "flower") return second;
  return `${second}${SUIT_SUFFIX[prefix] ?? ""}`;
}

// Full accessible name for a tile. This is the aria-label everywhere. The logic
// matches the board's original inline tileLabel so accessible names never change.
export function tileLabel(tileId: string): string {
  const [prefix, second] = tileId.split("-");
  if (prefix === "honor" || prefix === "flower") return second;
  return `${second} ${SUIT_WORD[prefix] ?? prefix}`;
}

export function parseTile(tileId: string): ParsedTile {
  const [prefix, second] = tileId.split("-");
  const label = tileLabel(tileId);
  if (prefix === "honor") {
    const suit: Suit = WINDS.has(second) ? "wind" : "dragon";
    return { suit, rank: 0, code: second, label };
  }
  if (prefix === "flower") {
    return { suit: "flower", rank: 0, code: second, label };
  }
  const suit: Suit =
    prefix === "characters" ? "char" : prefix === "bamboo" ? "bam" : "dot";
  return { suit, rank: Number(second), code: second, label };
}

// Map an analysis TileKind ("5p", "east") to a board tile id ("dots-5",
// "honor-east"). The analyzer and review surfaces speak in kinds; the tile
// components speak in ids. This keeps one tile renderer for the whole app.
const KIND_SUFFIX_PREFIX: Record<string, string> = { m: "characters", s: "bamboo", p: "dots" };

export function kindToTileId(kind: string): string {
  const match = /^([1-9])([msp])$/.exec(kind);
  if (match) {
    return `${KIND_SUFFIX_PREFIX[match[2]]}-${match[1]}`;
  }
  return `honor-${kind}`;
}

// Stable kind for a tile, dropping the copy index (e.g. "5p", "east", "plum").
export function tileKind(tileId: string): string {
  const [prefix, second] = tileId.split("-");
  if (prefix === "honor" || prefix === "flower") return second;
  return `${second}${SUIT_SUFFIX[prefix] ?? ""}`;
}

// How many copies of a kind exist in the wall. Flowers are unique; the rest have
// four copies each.
export function copiesForTile(tileId: string): number {
  return tileId.startsWith("flower-") ? 1 : 4;
}

const SUIT_ORDER: Record<Suit, number> = {
  char: 0,
  dot: 1,
  bam: 2,
  wind: 3,
  dragon: 4,
  flower: 5,
};
const WIND_ORDER = ["east", "south", "west", "north"];
const DRAGON_ORDER = ["red", "green", "white"];
const FLOWER_ORDER = [
  "plum",
  "orchid",
  "chrysanthemum",
  "bamboo",
  "spring",
  "summer",
  "autumn",
  "winter",
];

function sortWeight(tileId: string): number {
  const t = parseTile(tileId);
  let within = t.rank;
  if (t.suit === "wind") within = WIND_ORDER.indexOf(t.code);
  else if (t.suit === "dragon") within = DRAGON_ORDER.indexOf(t.code);
  else if (t.suit === "flower") within = FLOWER_ORDER.indexOf(t.code);
  return SUIT_ORDER[t.suit] * 100 + within;
}

// Sort tile ids by suit then rank for a tidy hand. The sort is stable so equal
// tiles keep their input order.
export function sortTiles(tileIds: readonly string[]): string[] {
  return tileIds
    .map((id, i) => ({ id, i, w: sortWeight(id) }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .map((e) => e.id);
}

// Corner-index colour token per suit. Suits use their traditional ink colour.
export function suitColor(suit: Suit): string {
  switch (suit) {
    case "char":
      return "var(--mj-char)";
    case "dot":
      return "var(--mj-dot)";
    case "bam":
      return "var(--mj-bam)";
    case "dragon":
      return "var(--mj-dragon)";
    case "flower":
      return "var(--mj-flower)";
    default:
      return "var(--mj-honor)";
  }
}
