import type { Tile } from "@browser-games/engine-mahjong";
import { tileToKind } from "@browser-games/engine-mahjong";

const SUIT_WORD: Record<string, string> = {
  characters: "characters",
  bamboo: "bamboo",
  dots: "dots",
};

export function tileGlyph(tile: Tile): string {
  return tileToKind(tile);
}

// Board tile id ("dots-5", "honor-east", "flower-plum") for the shared TileFace.
// The trainer works in engine Tile objects; the tile renderer works in ids.
export function tileToId(tile: Tile): string {
  if (tile.suit === "honor" && tile.honor) return `honor-${tile.honor}`;
  if (tile.suit === "flower" && tile.flower) return `flower-${tile.flower}`;
  return `${tile.suit}-${tile.rank}`;
}

export function tileLabel(tile: Tile): string {
  if (tile.suit === "honor" && tile.honor) {
    return tile.honor;
  }
  if (tile.rank !== undefined) {
    return `${tile.rank} ${SUIT_WORD[tile.suit] ?? tile.suit}`;
  }
  return tileToKind(tile);
}
