import { test, expect } from '@playwright/test';
import path from 'node:path';
import {
  createRoomAs,
  joinRoomByCode,
  readSeat,
  readPrivateState,
  readStoredIdentity,
} from './helpers/transport.js';

// QA scenario reload-mid-game-resume-seat-private-state: a player who reloads the
// tab mid-hand resumes the same seat with the same private hole cards. The reload
// drops the socket; on reconnect the client auto-rejoins the persisted room with
// playerId + reconnectToken and the server returns a fresh snapshot for the held
// seat. No manual room-code re-entry is involved.
test('reload mid-game resumes the same seat with private state intact', async ({ browser }) => {
  const artifactDir = path.resolve('e2e/artifacts');
  const [ctxHost, ctxGuest] = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  await Promise.all([
    ctxHost.tracing.start({ screenshots: true, snapshots: true, title: 'Reload-Host' }),
    ctxGuest.tracing.start({ screenshots: true, snapshots: true, title: 'Reload-Guest' }),
  ]);
  const [host, guest] = await Promise.all([ctxHost.newPage(), ctxGuest.newPage()]);
  await Promise.all([
    host.goto('http://localhost:5173/games/poker/'),
    guest.goto('http://localhost:5173/games/poker/'),
  ]);

  // Seat two humans (poker's minPlayers) so the host can start the hand; bots
  // fill the remaining seats. The guest takes a non-zero seat, which makes the
  // reload a real proof of seat restoration (not the default seat 0).
  const code = await createRoomAs(host, 'Alice');
  await joinRoomByCode(guest, code, 'Bob');
  await host.getByText(/^Room: /).waitFor({ timeout: 5000 });
  await host.getByRole('button', { name: 'Start with bots' }).click();
  await guest.getByRole('region', { name: 'Your cards' }).waitFor({ timeout: 15_000 });

  const seatBefore = await readSeat(guest);
  const privateBefore = await readPrivateState(guest);
  expect(seatBefore).toBeGreaterThan(0); // a non-default seat
  expect(privateBefore).toHaveLength(2); // two hole cards

  // The room code and secret token are persisted, which drives the auto-rejoin.
  const stored = await readStoredIdentity(guest);
  expect(stored.lastRoom).toBe(code);
  expect(stored.reconnectToken).toBeTruthy();

  // Reload mid-hand. The client reconnects and auto-rejoins the held seat with
  // playerId + reconnectToken; no room code is re-typed.
  await guest.reload();
  await guest.getByRole('region', { name: 'Your cards' }).waitFor({ timeout: 15_000 });

  const seatAfter = await readSeat(guest);
  const privateAfter = await readPrivateState(guest);

  expect(seatAfter).toBe(seatBefore); // same seat resumed
  expect(privateAfter).toEqual(privateBefore); // private hole cards intact

  await Promise.all([
    ctxHost.tracing.stop({ path: path.join(artifactDir, 'trace-reload-host.zip') }),
    ctxGuest.tracing.stop({ path: path.join(artifactDir, 'trace-reload-guest.zip') }),
  ]);
  await Promise.all([ctxHost.close(), ctxGuest.close()]);
});
