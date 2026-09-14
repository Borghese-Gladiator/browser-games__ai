# Plan: delete the leaderboard and stats layer

## Brief

Remove the leaderboard, the match history API, the head-to-head API, the
achievement system, and the unused Postgres store layer. The product does not
need them.

Keep the outcome log. The `/history/` page calls `/api/reviews`, which reads the
outcome log to list finished mahjong rooms. Events are keyed by room code, and
`EventStore` exposes only `append` and `readLog`, so the outcome log is the only
index of reviewable games.

Keep room snapshots. They let a redeploy resume an in-flight game. They do not
belong to the leaderboard.

After this change the gateway needs no database. `render.yaml` stays a single
free web service.

### Deliberate non-change

Keep the `OutcomeRecord` shape as it is, including the `outcomes` array.
`/api/reviews` reads only `gameId`, `roomCode`, and `ts`. A slimmer record
forces edits to the engine `Outcome` type, the runtime guards, and the room
adapters. That cost is larger than the benefit.

## Changes

### Delete these files

| File | Reason |
| --- | --- |
| `packages/shared/src/leaderboard.ts` | `computeBoard`, `matchHistory`, `headToHead`, `checkAchievements` |
| `packages/shared/src/leaderboard.test.ts` | tests for the file above |
| `packages/game-client/src/Leaderboard.tsx` | board UI that no game imports |
| `packages/game-client/src/leaderboard.ts` | `fetchLeaderboard` client |
| `packages/game-core/src/stores.ts` | async store contracts, reachable only from tests |
| `packages/game-core/src/postgresStore.ts` | Postgres stores, reachable only from tests |
| `packages/game-core/src/migrate.ts` | migration runner for the above |
| `packages/game-core/migrations/` | both SQL files |
| `e2e/leaderboard.spec.js` | board and history assertions |

### Edit these files

| File | Change |
| --- | --- |
| `packages/game-core/src/http.ts` | Delete the `/api/leaderboard`, `/api/history`, and `/api/h2h` routes. Delete the `@portal/shared/leaderboard` imports. Keep `/api/reviews` and `/api/review/:gameId`. Update the header comment. |
| `packages/game-core/src/gateway.ts` | Delete the achievement block in `onGameEnd`. Delete `achievementStore`, the `achievementStore` option, and `achievementsPath`. Delete the re-exports of `selectStores`, `createFileStores`, `runMigrations`, `loadMigrations`, and `GatewayStores`. |
| `packages/game-core/src/store.ts` | Delete the `AchievementStore` class and the `isAchievementUnlockArray` import. |
| `packages/game-core/src/store.test.ts` | Delete the two `contractSuite` calls, the `selectStores` suite, and the `AchievementStore` imports. Keep the `SnapshotStore` and `OutcomeStore` suites. |
| `packages/game-core/src/types.ts` | Delete `AchievementUnlock` and the `achievements?` adapter field. Delete the `Achievement` import. |
| `packages/game-core/src/guards.ts` | Delete `isAchievementUnlock` and `isAchievementUnlockArray`. |
| `packages/game-core/src/guards.test.ts` | Delete the unlock guard cases. |
| `packages/game-core/src/games.ts` | Delete `isFirstWin`, the `GameRecord` import, and the `achievements:` field on all 5 adapters. |
| `packages/game-client/src/chrome.css` | Delete the `.leaderboard*` rules. |
| `packages/game-client/package.json` | Delete the `./leaderboard` and `./Leaderboard` exports. |
| `packages/shared/package.json` | Delete the `./leaderboard` export. |
| `vitest.config.js` | Delete the `@portal/shared/leaderboard` alias. |
| `playwright.config.js` | Delete `ACHIEVEMENTS_PATH`. Update the comment. |
| `bin/dev-server.js` | Delete `achievementsPath`. |
| `package.json` | Drop `achievements.json` from `clean:state`. |
| `.gitignore`, `.dockerignore` | Drop `achievements.json`. |
| `render.yaml` | Update the health check comment, which names `/api/leaderboard`. |
| `README.md`, `AGENTS.md` | Drop the leaderboard and achievement references. |
| `docs/TODO.md` | Rewrite D3. Delete the stale D1 and D2, which the code already fixed. |

## Tests

### Unit

Run `npm run check` (typecheck, lint, vitest).

New or changed assertions:

1. `http.test.ts` — assert that `GET /api/leaderboard`, `/api/history`, and
   `/api/h2h` each return 404.
2. `http.test.ts` — assert that `GET /api/reviews` still lists a finished
   mahjong room. This is the regression guard for the kept path.
3. `store.test.ts` — the `OutcomeStore` and `SnapshotStore` suites must pass
   unchanged.
4. Confirm that no test imports `@portal/shared/leaderboard`.

### Manual

Frontend, in the browser:

1. Run `npm run dev`.
2. Open `/`. Confirm that the portal lists every game.
3. Open `/games/poker/`. Create a room. Confirm that no board appears.
4. Open `/history/`. Confirm that the page loads and lists reviewable games.
5. Open the browser network tab. Confirm no request to `/api/leaderboard`.

Deploy artifact:

6. Run `npm run verify:image`. It builds the Docker image, probes every page,
   probes `/api/leaderboard`, and runs a socket smoke test.
7. The script probes `/api/leaderboard` and expects 200. Update that probe to
   the review endpoint before the run.
