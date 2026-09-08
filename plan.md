# Plan: discard trainer page (slice 2)

## Brief
Add the client-only discard trainer page. It uses the slice-1 pure logic. The
page presents a generated hand, takes a discard, reveals the full ranking
best-first, marks the player position, renders the structured reasons as
sentences, shows the delta and severity, and offers a next puzzle. Register the
page in the shared registry. Add a Playwright spec.

## Location
- New Vite page: `games/mahjong-trainer/` (index.html + src). The route is
  `/games/mahjong-trainer/` per the Vite multi-page convention (not
  `/train/discard`).
- Registry: `packages/shared/src/registry.ts` (source of truth; never edit
  `vite.config.js`).
- E2E: `e2e/discard-trainer.spec.js`.

## Changes
- `games/mahjong-trainer/index.html` — page shell with `#root`, loads main.tsx.
- `games/mahjong-trainer/src/vite-env.d.ts` — vite client types for css imports.
- `games/mahjong-trainer/src/main.tsx` — mount TrainerPage, import theme + css.
- `games/mahjong-trainer/src/tiles.ts` — tile glyph and accessible label.
- `games/mahjong-trainer/src/TrainerPage.tsx` — flow container; owns
  seed/puzzle/choice state.
- `games/mahjong-trainer/src/HandView.tsx` — selectable hand tiles.
- `games/mahjong-trainer/src/RankingView.tsx` — reveal ranking, mark position,
  show reasons and severity.
- `games/mahjong-trainer/src/trainer.css` — layout and severity styling.
- `games/mahjong-trainer/package.json` — add react/react-dom deps.
- `packages/shared/src/registry.ts` — add the mahjong-trainer entry.
- `e2e/discard-trainer.spec.js` — load, select a tile, assert ranking +
  explanation, request next puzzle.

## Tests
### Unit
- `src/TrainerPage.test.tsx` — choose a tile, ranking and explanation appear,
  next puzzle advances to a new hand.

### Manual / targeted checks
- `npm run build` compiles and emits the trainer page.
- `npx playwright test e2e/discard-trainer.spec.js` passes.
- `npx vitest run games/mahjong-trainer` passes.
