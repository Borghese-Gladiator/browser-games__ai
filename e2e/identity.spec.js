import { test, expect } from '@playwright/test';
import path from 'node:path';
import { createRoomAs, joinRoomByCode, readSeat, readStoredIdentity } from './helpers/transport.js';

test('identity persists across reload and reconnect reclaims seat', async ({ browser }) => {
  const artifactDir = path.resolve('e2e/artifacts');
  const [ctx1, ctx2] = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  await Promise.all([
    ctx1.tracing.start({ screenshots: true, snapshots: true, title: 'Identity-P1' }),
    ctx2.tracing.start({ screenshots: true, snapshots: true, title: 'Identity-P2' }),
  ]);
  const [page1, page2] = await Promise.all([ctx1.newPage(), ctx2.newPage()]);

  // AC1: stable playerId across reload.
  await page1.goto('http://localhost:5173/games/poker/');
  const id1 = await page1.evaluate(() => localStorage.getItem('browser-games:playerId'));
  expect(id1).toMatch(/^[0-9a-f-]{36}$/);
  await page1.reload();
  const id1After = await page1.evaluate(() => localStorage.getItem('browser-games:playerId'));
  expect(id1After).toBe(id1);

  // AC2: a reload reclaims the same seat via the persisted room code + secret
  // reconnectToken — no raw-frame interception, no manual room-code re-type.
  await page1.goto('http://localhost:5173/games/poker/');
  await page2.goto('http://localhost:5173/games/poker/');

  const code = await createRoomAs(page1, 'Alice');
  const seatBefore = await readSeat(page1);
  expect(seatBefore).toBe(0); // host takes seat 0

  // The room code and the secret token are persisted beside the identity, which
  // is what lets the auto-rejoin work without any typed input.
  const stored = await readStoredIdentity(page1);
  expect(stored.lastRoom).toBe(code);
  expect(stored.reconnectToken).toBeTruthy();

  // Page2 joins so the room survives page1's disconnect.
  await joinRoomByCode(page2, code, 'Bob');
  await page2.getByText(/^Room: /).waitFor({ timeout: 5000 });

  // page1 "disconnects" by reloading (drops the socket). On reconnect the client
  // auto-rejoins the persisted room with playerId + reconnectToken and the server
  // restores the held seat — the player never re-types the code.
  await page1.reload();
  await page1.getByText(/^Room: /).waitFor({ timeout: 10_000 });
  const seatAfter = await readSeat(page1);
  expect(seatAfter).toBe(seatBefore); // same seat reclaimed

  await Promise.all([
    ctx1.tracing.stop({ path: path.join(artifactDir, 'trace-identity-p1.zip') }),
    ctx2.tracing.stop({ path: path.join(artifactDir, 'trace-identity-p2.zip') }),
  ]);
  await Promise.all([ctx1.close(), ctx2.close()]);
});
