# Plan: Repo cleanup, agent docs, and lobby overhaul

Supersedes the historical planning log (moved to `docs/history.md`).

## Brief
Four workstreams, low-risk → high-risk:
1. **Cleanup + validation** — remove runtime-state cruft from the tree, gitignore
   it, give the repo one health command, and make e2e start from clean state.
2. **Agent docs** — lean README + new `AGENTS.md`; move the deep adapter contract
   and planning history into `docs/`.
3. **Lobby logic (F1–F4)** — quick-match-with-bots primary CTA, remember name,
   live room-list broadcast, explicit leave.
4. **Lobby UI** — restructure `Lobby.jsx` + `lobby.css` around one primary CTA,
   a private-lobby block, and a live public-tables list.

## Changes

### 1. Cleanup + validation
- Delete the stray empty `${QA_SPEC_DIR}/` directory.
- Delete leftover untracked `snapshots/*.json` (leftover local rooms).
- `.gitignore`: add `snapshots/` and stray-var guard.
- `package.json`: add `check` script (unit tests) and `check:all` (unit + e2e);
  add a `clean:state` script that removes runtime state.
- `bin/dev-server.js`: read `OUTCOMES_PATH`, `ACHIEVEMENTS_PATH`, `SNAPSHOTS_PATH`
  from env and pass to `createGateway` (already parameterized) — lets e2e point
  at a scratch dir.
- `playwright.config.js`: point the gateway at a throwaway state dir per run so
  the suite starts hermetic (TODO C4/#4).

### 2. Agent docs
- Rewrite `README.md`: orientation + the four commands + one-paragraph "add a
  game" pointer. ~60 lines, link out for depth.
- New `AGENTS.md`: workspace map, where things live, validation commands, the
  golden rules an agent needs (registry is source of truth; engines are pure;
  one gateway; how to run/validate).
- New `docs/adding-a-game.md`: the full adapter contract currently inline in
  README.
- Move `plan.md` planning history → `docs/history.md`.

### 3. Lobby logic
- `useIdentity.js` (or Lobby): persist last-used name in localStorage; prefill.
- Gateway: broadcast a fresh `rooms` frame to all lobby watchers of a game on
  any membership change (create/join/leave/lock).
- Add `lobby:leave` protocol + `leaveRoom` client action; free seat, return to
  lobby, keep name.
- Portal/Lobby: make quick-match the dominant CTA (bots fill), create/join
  demoted.

### 4. Lobby UI
- Rebuild `Lobby.jsx` layout: hero Quick-Match card, "Private Lobby"
  (host/join-by-code), "Public Tables" live list. One primary button.
- `lobby.css`: match the mockups (dark cards, single accent CTA).

## Tests
### Unit
- Existing ~250 vitest pass unchanged after cleanup/docs.
- Lobby logic: new tests for name persistence, `rooms` re-broadcast on
  membership change, `lobby:leave` frees the seat.
### Manual (browser)
- `npm run dev`; portal → poker: "Play now" fills bots and starts immediately.
- Second tab creates a room → its code shows in the first tab's public list
  without pressing Refresh (live broadcast).
- Leave room → back to lobby, name still prefilled.
