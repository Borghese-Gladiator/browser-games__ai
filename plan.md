# Plan: Mahjong felt-table visual pass

## Brief
Give the Mahjong board a visual design pass. Build a reusable tile-face UI as
CSS plus inline SVG. Keep `tileLabel` as the aria-label and keep the existing
roles and section labels intact. Restyle the board into a dark-green felt table
seen from above. Add name plates, a player area, a HUD, a Visible-copies panel,
and a tai indicator.

The board reads a per-seat public projection (`mahjongPublicState`). That view
gives phase, activeSeat, wallCount, lastDiscard, players, mySeat, myHand,
myMelds, myFlowers, myDiscards, opponents (count, melds, flowers, discards),
availableActions, and result. The view carries no scores, seat winds, dealer
flag, bot flag, round number, or turn timer. This slice derives only honest
values from the data that exists:
- seat wind and prevailing wind from the fixed Taiwanese config (dealer seat 0,
  East round): `["E","S","W","N"][seat]`.
- dealer badge: seat 0.
- bot badge: player name matches `Bot N` (the gateway's bot naming).
- just-drawn tile: the last raw `myHand` tile while a discard action exists
  (the reducer appends the drawn tile last and does not re-sort).
- tiles-left: `wallCount`.
- turn timer: a local countdown that restarts when `availableActions` changes.
- tai: `scoreHand` from `@browser-games/engine-mahjong`, computed from the local
  hand only; the panel shows the ruleset tai reference until the hand wins.
- visible copies: counted only from public tiles, never `myHand`.

## Changes
- `games/mahjong/src/tiles.ts` (new): `Suit`, `TileSize`, `SeatPosition`,
  `ParsedTile`, `parseTile`, `tileLabel` (verbatim old logic), `tileShort`,
  `suitColor`, `sortTiles`, copy-count and kind helpers.
- `games/mahjong/src/TileFace.tsx` (new): `TileFace`, `TileBack`, `CornerIndex`,
  and the inline-SVG glyphs (`CharacterGlyph`, `DotGlyph`, `BambooGlyph`,
  `HonourGlyph`, `FlowerGlyph`). `TileFace` sets `role="img"` and the tileLabel
  aria-label unless it is decorative.
- `games/mahjong/src/TileFace.test.tsx` (new): one glyph per suit and aria-label
  parity with `tileLabel`.
- `games/mahjong/src/board/visibleCopies.ts` (new): `computeVisibleCopies` from
  a public projection only.
- `games/mahjong/src/board/visibleCopies.test.ts` (new): counts and the
  never-myHand rule.
- `games/mahjong/src/board/NamePlate.tsx` (new): seat wind, name, Bot/Dealer
  badges, score slot, amber turn outline.
- `games/mahjong/src/board/Hud.tsx` (new): prevailing wind, tiles-left, ruleset
  badge, pause/fullscreen/settings controls.
- `games/mahjong/src/board/VisibleCopiesPanel.tsx` (new): the tally panel.
- `games/mahjong/src/board/TaiIndicator.tsx` (new): reads the scoring module.
- `games/mahjong/src/board/TurnTimerBar.tsx` (new): depleting bar from
  availableActions timing only.
- `games/mahjong/src/Mahjong.tsx` (edit): restyle OpponentArea, TileButton,
  ActionBar; compose the felt table, seat grid, player area, HUD, and panels.
  Keep every existing section aria-label, button name, and the `.mj-tile-btn`
  and `.mj-opponent` hooks the test uses.
- `games/mahjong/src/mahjong.css` (edit): dark-green felt table, seat grid,
  name plates, HUD, panels, tile faces/backs, responsive rules.
- `games/mahjong/src/Mahjong.test.tsx` (edit): keep the role/name assertions;
  add a felt-layout smoke test.
- `games/mahjong/package.json` (edit): add `@browser-games/engine-mahjong`.

Out of scope: the trainer and history restyle, and shared-package tile module.
The trainer and history use engine `Tile` objects, not the board's string ids;
a shared string-based module would force a cross-package refactor that the slice
objective and the required checks do not cover.

## Tests
### Unit (`npm run test`)
- `TileFace.test.tsx`: `data-suit` per suit; `aria-label` equals `tileLabel`;
  a face-down back exposes no tile label.
- `visibleCopies.test.ts`: seen and remaining counts; a hidden `myHand` tile is
  never counted.
- `Mahjong.test.tsx`: keep Leave, hand-tile count, no opponent concealed tiles,
  and the "16 tiles" text; add a felt-table smoke render.

### Types (`npm run typecheck`)
- The engine import resolves and the board typechecks.

### Build (`npm run build`)
- Vite builds the mahjong page.

### Manual (browser)
- `npm run dev`, open the mahjong page, quick-match with bots.
- Confirm the felt table, three opponent seats, backs, discard rivers, name
  plates, HUD, player hand, action bar, timer bar, panels, and responsive
  layout at a narrow width.
