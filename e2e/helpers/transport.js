// Socket.IO-transport-aware E2E helpers. The gateway now speaks Socket.IO, so
// the specs read seat, private state, and identity from the rendered app and
// from localStorage instead of parsing raw WebSocket frames. Create/join go
// through the shared lobby UI so every spec drives the same path a player does.

const ID_KEY = 'browser-games:playerId';
const TOKEN_KEY = 'browser-games:reconnectToken';
const ROOM_KEY = 'browser-games:lastRoom';

// Read the room code out of the RoomCode header ("Room: ABCD Copy").
async function readRoomCode(page, timeout = 5000) {
  const roomText = await page.getByText(/^Room: /).textContent({ timeout });
  return roomText.replace('Room:', '').replace(/Copy.*/i, '').trim();
}

// Create a room as a named player and return its code.
export async function createRoomAs(page, name) {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  return readRoomCode(page);
}

// Join an existing room by code as a named player.
export async function joinRoomByCode(page, code, name) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Room code').fill(code);
  await page.getByRole('button', { name: 'Join by code' }).click();
}

// Read the player's current seat from the rendered roster. PlayerList tags the
// owning seat with data-you="true" and carries the seat index in data-seat.
export async function readSeat(page, timeout = 10_000) {
  const you = page.locator('.player-list-item[data-you="true"]').first();
  await you.waitFor({ timeout });
  return Number(await you.getAttribute('data-seat'));
}

// Read the seat's private view ("Your cards") so a reload can assert it survives.
export async function readPrivateState(page, timeout = 15_000) {
  const region = page.getByRole('region', { name: 'Your cards' });
  await region.waitFor({ timeout });
  const items = region.getByRole('listitem');
  const count = await items.count();
  const cards = [];
  for (let i = 0; i < count; i++) cards.push((await items.nth(i).textContent())?.trim());
  return cards;
}

// Read the persisted identity and room code from localStorage.
export async function readStoredIdentity(page) {
  return page.evaluate(
    (keys) => ({
      playerId: localStorage.getItem(keys.id),
      reconnectToken: localStorage.getItem(keys.token),
      lastRoom: localStorage.getItem(keys.room),
    }),
    { id: ID_KEY, token: TOKEN_KEY, room: ROOM_KEY },
  );
}
