# Plan: Replay-driven post-game review (milestone 11)

## Brief
The target repo is `browser-games`. All milestone-8/9 prerequisites are present:
`replayGame` + append-only `game_events` (`packages/game-core/src/replay.ts`,
`eventStore.ts`, `migrations/001_create_game_tables.sql`), `rankDiscards`
(`packages/engines/mahjong-analysis`), and the trainer `severity.ts` /
`reasons.ts`. The repo matches, so this slice builds the review, not an
escalation.

Add a post-game review. Replay a stored mahjong game step-by-step against
`stateHash`. For each actual discard, rank the discard with `rankDiscards` using
only that player's public information (that seat's own concealed hand + exposed
melds). Compute `mistakeScore = best.score - chosen.score`, classify it with the
shared severity thresholds, and render chosen vs best plus structured reasons.
Show Previous/Next turn stepping and per-player severity counts on a `/history`
page derived from the registry.

## Changes
- `packages/shared/src/severity.ts` (new): move `MistakeSeverity`,
  `SEVERITY_THRESHOLDS`, `severityForDelta` here (shared single source). Export
  `./severity` from the package.
- `games/mahjong-trainer/src/severity.ts`: re-import the moved symbols from
  `@portal/shared/severity`; keep `scoreChoice`/`PlayerChoiceResult`.
- `packages/engines/mahjong-analysis/src/explanations/render.ts` (new): move
  `renderReason`/`renderReasons` here; export from the engine index.
- `games/mahjong-trainer/src/reasons.ts`: re-export the renderers from the
  analysis engine.
- `packages/game-core/src/review.ts` (new): `discardPositionForSeat` (public
  info only) + `reviewGame` (step-by-step replay + per-discard analysis +
  per-seat summary).
- `packages/game-core/src/http.ts`: add `GET /api/reviews` and
  `GET /api/review/:gameId`; add optional `eventStore` to `HttpDeps`.
- `packages/game-core/src/gateway.ts`: pass `eventStore` to the HTTP routes and
  add a registry-driven static fallback for dynamic pages.
- `packages/shared/src/registry.ts`: add a `pages` list (single source of truth
  for non-game top-level pages) with the `/history` page.
- `vite.config.js`: derive the input map from `games` + `pages`; add a
  registry-driven dev SPA fallback for dynamic pages.
- `history/` (new): `index.html`, `package.json`, `src/` React review UI
  (games list + review detail with Previous/Next stepping).
- `package.json`: add `history` to workspaces. `tsconfig.json`: include
  `history`. `vitest.config.js`: alias `@portal/shared/severity`.

## Tests
### Unit (`npm run test`)
- `packages/shared/src/severity.test.ts`: `SEVERITY_THRESHOLDS` boundary values
  classify as intended.
- `packages/game-core/src/review.test.ts`:
  - `discardPositionForSeat` returns only that seat's hand + melds. Build a case
    where pooling hidden hands flips the best discard; assert the verdict does
    not flip.
  - `reviewGame` on a small canonical log yields chosen vs best, `mistakeScore`,
    severity, and a per-seat summary.
- Existing trainer `severity.test.ts` / `reasons.test.ts` keep passing through
  the re-exports.

### Build (`npm run build`)
- Vite builds `/history` through the registry-derived input map, no hand edit of
  the input list.

### E2E (`e2e/history-review.spec.js`)
- Seed a fixture mahjong event log. Open the game's review. Step forward one
  turn. Assert a chosen-versus-best comparison renders.

### Manual
- `node bin/dev-all.js`, open `http://localhost:5173/history/`, open a game,
  click Next, confirm chosen vs best and reasons render.
