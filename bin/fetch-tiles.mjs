#!/usr/bin/env node
// Download the mahjong tile artwork into public/tiles/ and draw the 8 flower
// tiles the source set does not carry.
//
// Source: https://github.com/FluffyStuff/riichi-mahjong-tiles (CC0, public
// domain). It covers the 34 suit and honour tiles of a riichi set. Taiwanese
// 16-tile mahjong also uses 8 flowers, so this script draws those 8 in the same
// shape with the traditional character.
//
// Every file holds the tile face ink only, on a transparent ground, in a
// 300x400 viewBox. The ivory tile body, the bevel, and the shadow are CSS, so
// the app themes the body without touching the artwork.
//
// Run once. The output is committed, so neither the Vite build nor the Docker
// image needs the network.
//
//   node bin/fetch-tiles.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/tiles");
const BASE = "https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular";

// Source file -> the name this app asks for. The app's names follow its own
// tile ids so the renderer needs no lookup table beyond tileAsset.ts.
const DOWNLOAD = {
  "Man1.svg": "characters-1.svg",
  "Man2.svg": "characters-2.svg",
  "Man3.svg": "characters-3.svg",
  "Man4.svg": "characters-4.svg",
  "Man5.svg": "characters-5.svg",
  "Man6.svg": "characters-6.svg",
  "Man7.svg": "characters-7.svg",
  "Man8.svg": "characters-8.svg",
  "Man9.svg": "characters-9.svg",
  "Pin1.svg": "dots-1.svg",
  "Pin2.svg": "dots-2.svg",
  "Pin3.svg": "dots-3.svg",
  "Pin4.svg": "dots-4.svg",
  "Pin5.svg": "dots-5.svg",
  "Pin6.svg": "dots-6.svg",
  "Pin7.svg": "dots-7.svg",
  "Pin8.svg": "dots-8.svg",
  "Pin9.svg": "dots-9.svg",
  "Sou1.svg": "bamboo-1.svg",
  "Sou2.svg": "bamboo-2.svg",
  "Sou3.svg": "bamboo-3.svg",
  "Sou4.svg": "bamboo-4.svg",
  "Sou5.svg": "bamboo-5.svg",
  "Sou6.svg": "bamboo-6.svg",
  "Sou7.svg": "bamboo-7.svg",
  "Sou8.svg": "bamboo-8.svg",
  "Sou9.svg": "bamboo-9.svg",
  "Ton.svg": "honor-east.svg",
  "Nan.svg": "honor-south.svg",
  "Shaa.svg": "honor-west.svg",
  "Pei.svg": "honor-north.svg",
  "Chun.svg": "honor-red.svg",
  "Hatsu.svg": "honor-green.svg",
};

// The ink the source set uses for the wind characters. The white dragon frame
// below matches it so the honours read as one group.
const HONOR_BLUE = "#142896";

// The 8 flowers, drawn on the set's blank front. Seasons take vermilion ink and
// the four gentlemen take jade, which is how most Taiwanese sets ink them.
const FLOWERS = [
  ["flower-spring", "春", "#c0392b"],
  ["flower-summer", "夏", "#c0392b"],
  ["flower-autumn", "秋", "#c0392b"],
  ["flower-winter", "冬", "#c0392b"],
  ["flower-plum", "梅", "#1d7a4c"],
  ["flower-orchid", "蘭", "#1d7a4c"],
  ["flower-chrysanthemum", "菊", "#1d7a4c"],
  ["flower-bamboo", "竹", "#1d7a4c"],
];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

// The white dragon (白板). The source set is riichi, where haku is a blank tile.
// A Taiwanese set inks a blue double frame instead, so draw that.
function whiteDragonSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">` +
    `<g fill="none" stroke="${HONOR_BLUE}" stroke-linejoin="miter">` +
    `<rect x="48" y="58" width="204" height="284" stroke-width="15"/>` +
    `<rect x="76" y="86" width="148" height="228" stroke-width="7"/>` +
    `</g></svg>\n`
  );
}

// A flower face: the character alone, in the same 300x400 viewBox the source set
// uses, so it sits on the CSS tile body like every other face.
function flowerSvg(char, ink) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">` +
    `<text x="150" y="272" fill="${ink}" ` +
    `font-family="Noto Serif TC, Songti TC, PingFang TC, Hiragino Mincho ProN, serif" ` +
    `font-size="215" font-weight="700" text-anchor="middle">${char}</text>` +
    `</svg>\n`
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const entries = Object.entries(DOWNLOAD);
  let done = 0;
  for (const [source, target] of entries) {
    const svg = await fetchText(`${BASE}/${source}`);
    await writeFile(resolve(OUT, target), svg);
    done += 1;
    process.stdout.write(`\r  tiles ${done}/${entries.length}`);
  }
  process.stdout.write("\n");

  for (const [name, char, ink] of FLOWERS) {
    await writeFile(resolve(OUT, `${name}.svg`), flowerSvg(char, ink));
  }
  console.log(`  flowers ${FLOWERS.length}/${FLOWERS.length}`);

  await writeFile(resolve(OUT, "honor-white.svg"), whiteDragonSvg());
  console.log("  white dragon 1/1");
  console.log(`Wrote ${entries.length + FLOWERS.length + 1} files to public/tiles/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
