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

export function tileLabel(tile: Tile): string {
  if (tile.suit === "honor" && tile.honor) {
    return tile.honor;
  }
  if (tile.rank !== undefined) {
    return `${tile.rank} ${SUIT_WORD[tile.suit] ?? tile.suit}`;
  }
  return tileToKind(tile);
}
