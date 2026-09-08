# Plan: Durable persistence and deterministic replay

## Brief
Add a durable, append-only per-game event log, atomic file writes that fail loud
on torn reads, a Postgres store layer selected by `DATABASE_URL`, a deterministic
`replayGame`, and a store injection seam on `createGateway`. The event log must
survive room reaping and must never be truncated.

## Changes

### store.ts
- Add `TornWriteError`.
- Add `atomicWriteJson` (async) and `atomicWriteJsonSync`: temp file + fsync + rename.
- Add `readJsonStrict<T>` (async): parse errors throw `TornWriteError`; a missing
  file throws ENOENT (the caller decides the empty case).
- Switch the legacy store writes to `atomicWriteJsonSync`.

### eventStore.ts (new)
- `GameEvent`, `EventInput`, `EventStore` contract.
- `createFileEventStore(dir)`: append-only, one JSON file per game, monotonic
  sequence, no truncation, atomic writes, strict reads.

### stores.ts (new)
- Async contracts: `OutcomeStore`, `AchievementStore`, `SnapshotStore`,
  `GatewayStores`, `LeaderboardEntry`.
- File factories for all four stores.
- `selectStores(env)`: Postgres when `DATABASE_URL` is set, else file.

### postgresStore.ts (new)
- Postgres factories for every contract. SQL leaderboard aggregation.
- No static `pg` import (pg is not installed and `npm run check` runs with no DB);
  load `pg` through a lazy dynamic import guarded behind `DATABASE_URL`.

### migrate.ts + migrations/001_create_game_tables.sql (new)
- `loadMigrations`, `runMigrations`; a numbered SQL runner records applied versions.
- SQL: games, game_players, game_events (unique `game_id, sequence`), plus
  game_achievements and game_snapshots.

### replay.ts (new)
- `replayGame(gameId, eventStore)`: reconstruct the engine state from the log with
  `createGame` then `applyAction`, and assert the `stateHash` at every step.

### rooms.ts
- Remove the 200-entry ring-buffer truncation in `applyMessage`.
- Add `reapRoom(room, eventStore)` that flushes the room log to the durable store.
- `RoomManager` takes an optional `eventStore` and flushes on reap.

### gateway.ts
- Injection seam: optional `outcomeStore`, `achievementStore`, `snapshotStore`,
  and new `eventStore`, defaulting to file-backed implementations.

## Tests
### Unit (vitest)
- `eventStore.test.ts`: torn-write fails loud (not empty history); a log of >200
  entries survives intact; monotonic sequence.
- `replay.test.ts`: replay of a completed scripted mahjong hand matches `stateHash`
  at every step; a tampered middle hash makes replay throw.
- `store.test.ts`: shared contract suite (EventStore + OutcomeStore leaderboard)
  runs file always, Postgres only when `DATABASE_URL` is set.
- Update the two rooms.test.ts truncation tests to assert the log is never truncated.

### Manual
- `npm run check` with no `DATABASE_URL` passes without a database.
- Postgres pass: set `DATABASE_URL`, run the contract suite; verify the migration
  and the unique `(game_id, sequence)` constraint.
