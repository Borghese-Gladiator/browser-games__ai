import { parseTile } from "./parseTile.ts";

// Real tile artwork lives in public/tiles/ and is served from the site root, so
// one absolute path works from the portal and from every game page. See
// bin/fetch-tiles.mjs for where the files come from.
export const TILE_ASSET_BASE = "/tiles";

// The file name for a tile id, without the directory or the extension. Board
// tile ids carry a copy index ("dots-5-2"); the artwork does not, so the index
// is dropped.
export function tileAssetName(tileId: string): string {
  const t = parseTile(tileId);
  switch (t.suit) {
    case "char":
      return `characters-${t.rank}`;
    case "dot":
      return `dots-${t.rank}`;
    case "bam":
      return `bamboo-${t.rank}`;
    case "flower":
      return `flower-${t.code}`;
    default:
      return `honor-${t.code}`;
  }
}

export function tileAssetUrl(tileId: string): string {
  return `${TILE_ASSET_BASE}/${tileAssetName(tileId)}.svg`;
}
