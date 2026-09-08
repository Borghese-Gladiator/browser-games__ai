# Plan: make Taiwanese mahjong fully playable

## Brief
The mahjong engine, adapter, registry entry, and board already exist. This slice
closes the remaining gaps so a human plus AI seats play a full hand, a claim
window resolves by engine precedence or deadline, a reload resumes the same seat,
and the board offers a Leave control.

## Changes
1. `packages/game-core/src/games.ts`
   - Lower `mahjongAdapter.minPlayers` from 4 to 2. The host "Start with bots"
     control (`host:start` -> `startEarly` -> `fillWithBots`) requires
     `playerCount >= minPlayers`. At 2 the shared AI-seat-fill control works with
     two humans (or the host waits for one guest), and `fillWithBots` still fills
     to `maxPlayers` 4 and `autoStart` still deals only at four seats.
2. `games/mahjong/src/Mahjong.tsx`
   - Destructure `leaveRoom` from `useGameSocket`.
   - Add a Leave button that calls `leaveRoom`.
   - Add `data-my-seat={view.mySeat}` on the board `<main>` so a reload spec can
     read the resumed seat without a player roster.
3. `games/mahjong/src/Mahjong.test.tsx` (new)
   - Mock `useGameSocket`. Assert the Leave button calls `leaveRoom`, and that no
     opponent concealed tile renders (only the local seat renders hand tiles).
4. `packages/game-core/src/games.test.ts`
   - Room-level AI-seat-fill test: two humans + `startEarly` seats two bots, fills
     the table, and deals (phase PLAYING).
   - Claim-window non-blocking test: `botMove` and `timeoutAction` for a pending
     eligible seat return a pass, so bots and dark seats never stall the window.
5. `e2e/mahjong.spec.js` (replace the single 4-human spec with the two required)
   - `mahjong two-context AI fill; a claim window resolves`.
   - `mahjong reload mid-hand resumes the same seat with no opponent tiles`.

## Tests
### Unit (`npm run test`)
- New adapter/room tests above, beside the code.
- Existing suites stay green; `publicState` projection is unchanged.
### E2E (`npm run test:e2e`)
- Two-context AI-fill claim resolution.
- Mid-hand reload: same seat (`data-my-seat`), same concealed hand, zero opponent
  concealed tiles in the DOM.
### Build
- `npm run build`.
