import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { tileAssetName, tileAssetUrl } from "./tileAsset.ts";

// A Taiwanese set has 42 distinct faces: 27 numbered, 4 winds, 3 dragons,
// 8 flowers. Board tile ids carry a copy index, which the asset name drops.
const WINDS = ["east", "south", "west", "north"];
const DRAGONS = ["red", "green", "white"];
const FLOWERS = [
  "plum",
  "orchid",
  "chrysanthemum",
  "bamboo",
  "spring",
  "summer",
  "autumn",
  "winter",
];

function everyTileId(): string[] {
  const ids: string[] = [];
  for (const suit of ["characters", "dots", "bamboo"]) {
    for (let rank = 1; rank <= 9; rank += 1) ids.push(`${suit}-${rank}-1`);
  }
  for (const honor of [...WINDS, ...DRAGONS]) ids.push(`honor-${honor}-1`);
  for (const flower of FLOWERS) ids.push(`flower-${flower}-1`);
  return ids;
}

const SHIPPED = new Set(
  readdirSync(resolve(import.meta.dirname, "../../../../public/tiles"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, "")),
);

describe("tileAsset", () => {
  it("maps every face of the set to a file that public/tiles/ ships", () => {
    const names = new Set(everyTileId().map(tileAssetName));
    expect(names.size).toBe(42);
    for (const name of names) {
      expect(SHIPPED.has(name), `${name}.svg is missing from public/tiles/`).toBe(true);
    }
  });

  it("ships no file the renderer cannot reach", () => {
    const names = new Set(everyTileId().map(tileAssetName));
    for (const shipped of SHIPPED) {
      expect(names.has(shipped), `public/tiles/${shipped}.svg is never rendered`).toBe(true);
    }
  });

  it("drops the copy index from a board tile id", () => {
    expect(tileAssetName("dots-5-2")).toBe("dots-5");
    expect(tileAssetName("honor-east-3")).toBe("honor-east");
    expect(tileAssetName("flower-plum-1")).toBe("flower-plum");
  });

  it("builds a root-absolute url so every game page resolves it", () => {
    expect(tileAssetUrl("characters-9-1")).toBe("/tiles/characters-9.svg");
  });
});
