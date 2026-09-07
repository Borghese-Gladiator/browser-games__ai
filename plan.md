# Plan: game-client TypeScript + secret reconnectToken

## Brief
Convert `packages/game-client/src` from `.js`/`.jsx` to `.ts`/`.tsx`. Give
`useGameSocket` a real exported return type. Split identity into a public
`playerId` and a secret `reconnectToken`. Mint the token server-side with
`crypto.randomBytes`, return it only to the owning client, store it in
localStorage beside the id, and verify it with a timing-safe compare before a
seat restore or any host action. Never broadcast the token. Persist the room
code and auto-rejoin on connect. Keep the protocol-version refresh banner.
Remove the `joinIntent` useRef path.

Note: `game-core` and `shared` are already TypeScript and already use the
Socket.IO transport. The `game-client` package is the only `.js`/`.jsx` package
left, so the Socket.IO client migration is already present. This slice adds the
reconnectToken/identity work and the TS conversion.

## Changes

### Server (game-core + shared)
- `packages/shared/src/identity.ts`: `encodePlayerCode(playerId, reconnectToken,
  name?)` and `decodePlayerCode -> { playerId, reconnectToken, name }`. Drop the
  plaintext guest-only code. Add `PlayerCode` type.
- `packages/game-core/src/reconnectToken.ts` (new): `mintReconnectToken()` via
  `crypto.randomBytes`; `verifyReconnectToken(expected, presented)` via
  `crypto.timingSafeEqual`, false on null/length mismatch.
- `packages/game-core/src/rooms.ts`: store a secret token per member in a private
  `_tokens` map. Mint on first seat. On reconnect verify the presented token
  (timing-safe) before restoring the held seat, else throw. Add `tokenFor` and
  `assertOwner`. Adopt-and-mint when a snapshot-restored seat has no stored
  token. Keep the token out of `summary`/`presence`/`viewFor`/`snapshot`.
- `packages/game-core/src/socket.ts`: `Session` carries the presented
  `reconnectToken`. `joinRoom` passes it to `addPlayer`, then sets
  `session.reconnectToken` to the authoritative stored token and returns that
  token to the owner only in `joined`. Host cases call `assertOwner`.
  `registerSocketEvents` reads `playerId`+`reconnectToken` from
  `socket.handshake.auth` (query fallback for playerId).

### Client (game-client)
- Rename every `src/*.js` -> `*.ts` and `src/*.jsx` -> `*.tsx`.
- `protocol.ts` (new): `RoomSummary`, `Presence`, `GameState`, `ChatMessage`,
  `ServerMessage`, `ClientMessage`, `HandshakeAuth`.
- `useGameSocket.types.ts` (new): `ConnectionStatus`, `JoinedRoom`,
  `UseGameSocketApi`.
- `useIdentity.ts`: add `reconnectToken`/`setReconnectToken` and
  `lastRoom`/`setLastRoom`; `playerCode`/`importIdentity` carry the token.
- `useGameSocket.ts`: connect with `auth: { playerId, reconnectToken }`;
  auto-rejoin the persisted room on connect; persist token + room from `joined`;
  clear room on `left`; remove `joinIntent`; typed return; keep banner.
- `package.json`: repoint `exports` to `.ts`/`.tsx`; add `typescript` devDep and
  `typecheck` script.
- `tsconfig.json` (new): package typecheck config (noEmit, react-jsx, strict).

### Games
- `games/{poker,president,reversi,sheng-ji}/src/*.tsx`: drop the `: any` on the
  `useGameSocket(...)` destructure; keep game-state field access permissive.

## Tests
### Unit
- `packages/shared/src/identity.test.ts`: encode/decode round-trip with the
  reconnectToken; throw on invalid input.
- `packages/game-core/src/reconnectToken.test.ts` (new): mint uniqueness; verify
  timing-safe true/false on match, mismatch, length, null.
- `packages/game-core/src/rooms.test.ts`: mint on first seat; reject reconnect on
  token mismatch; `assertOwner` guard.
- `packages/game-core/src/gateway.test.ts`: fake session carries reconnectToken;
  `joined` returns the token to the owner; host action guarded.
- `packages/game-client/src/useGameSocket.test.ts` (new): outbox flush-on-connect
  + de-dupe; handshake auth carries playerId+reconnectToken; auto-rejoin with the
  persisted room code; `joined` persists the token.
### Manual
- `npm run dev`; open poker; create a room; reload the tab; confirm the same seat
  resumes with private state, no manual room-code re-type.

## Targeted checks
- `cd packages/game-client && npx tsc --noEmit -p tsconfig.json` -> zero errors.
- `npx vitest run packages/game-client` -> green.
- `git diff` grep: `reconnectToken` never in a broadcast/summary/presence/view.
