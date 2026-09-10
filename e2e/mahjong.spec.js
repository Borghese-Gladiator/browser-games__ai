import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";

const URL = "http://localhost:5173/games/mahjong/";
const HAND = 'section[aria-label="Your hand"]';

// Read the local seat the board resumed. The board tags <main> with data-my-seat
// so a reload can prove the same seat came back without a player roster.
async function readSeat(page) {
  const value = await page.locator("main.mj").getAttribute("data-my-seat");
  return Number(value);
}

// Read the concealed hand as the sorted list of tile glyphs. Only the local seat
// renders concealed hand tiles (.mj-tile-btn); opponents never do.
async function readHand(page) {
  const tiles = page.locator(`${HAND} .mj-tile-btn`);
  const count = await tiles.count();
  const out = [];
  for (let i = 0; i < count; i += 1) out.push((await tiles.nth(i).textContent())?.trim());
  return out.sort();
}

// The one legal action this human seat owns right now, read from the status line.
// Returns true once this page shows a finished hand. Sets flags.sawClaimWindow
// when this seat is offered a claim.
async function act(page, flags) {
  const status = ((await page.getByRole("status").textContent().catch(() => "")) ?? "").trim();
  if (/wins/.test(status) || status.startsWith("Draw")) return true;

  if (status === "Your turn") {
    const draw = page.getByRole("button", { name: "Draw", exact: true });
    if (await draw.isEnabled({ timeout: 200 }).catch(() => false)) {
      await draw.click();
      return false;
    }
    const discards = page.getByRole("button", { name: /^Discard / });
    const n = await discards.count();
    for (let i = 0; i < n; i += 1) {
      const btn = discards.nth(i);
      if (await btn.isEnabled({ timeout: 200 }).catch(() => false)) {
        await btn.click();
        return false;
      }
    }
    return false;
  }

  if (status === "Claim the discard?") {
    flags.sawClaimWindow = true;
    for (const name of ["Pong", "Chow", "Kong", "Win"]) {
      const btn = page.getByRole("button", { name, exact: true });
      if (await btn.isEnabled({ timeout: 200 }).catch(() => false)) {
        await btn.click();
        return false;
      }
    }
    const pass = page.getByRole("button", { name: "Pass", exact: true });
    if (await pass.isEnabled({ timeout: 200 }).catch(() => false)) await pass.click();
    return false;
  }

  return false;
}

// QA scenario mahjong-two-context-ai-fill-claim-resolves: two humans in separate
// browser contexts start a table, the host fills the two empty seats with bots
// (the shared AI-seat-fill control), and a claim window opens and resolves while
// the hand plays to an agreed outcome.
test("two humans plus AI fill play a hand where a claim window resolves", async ({ browser }) => {
  test.setTimeout(120_000);
  const artifactDir = path.resolve("e2e/artifacts");
  const [ctxHost, ctxGuest] = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  const [host, guest] = await Promise.all([ctxHost.newPage(), ctxGuest.newPage()]);
  await Promise.all([host.goto(URL), guest.goto(URL)]);

  const code = await createRoomAs(host, "Player1");
  await joinRoomByCode(guest, code, "Player2");
  await guest.getByText(/^Room: /).waitFor({ timeout: 5000 });

  // The AI-seat-fill control: two humans, the host fills the last two seats with
  // bots, then the hand deals.
  await host.getByRole("button", { name: "Start with bots" }).click();

  const pages = [host, guest];
  await Promise.all(
    pages.map((p) => p.getByRole("region", { name: "Your hand" }).waitFor({ timeout: 15_000 })),
  );

  // Two seats really are bots.
  await expect(host.getByLabel(/Opponent Bot/).first()).toBeVisible({ timeout: 5000 });

  // Drive the two human seats until a claim window opens for a human and then
  // resolves. A claim window holds activeSeat at -1, so no seat shows a "turn"
  // status while it is open; a turn (or terminal) status reappearing after a
  // human was offered a claim proves the window resolved and play advanced.
  const flags = { sawClaimWindow: false };
  let resolved = false;
  for (let round = 0; round < 6000 && !resolved; round += 1) {
    const results = await Promise.all(pages.map((p) => act(p, flags)));
    if (results.some(Boolean)) {
      resolved = flags.sawClaimWindow;
      break;
    }
    if (flags.sawClaimWindow) {
      const statuses = await Promise.all(
        pages.map((p) => p.getByRole("status").textContent().catch(() => "")),
      );
      if (statuses.some((s) => /turn|wins|Draw/.test((s ?? "").trim()))) {
        resolved = true;
        break;
      }
    }
    await host.waitForTimeout(40);
  }

  expect(flags.sawClaimWindow).toBe(true);
  expect(resolved).toBe(true);

  await Promise.all([ctxHost.close(), ctxGuest.close()]);
});

// QA scenario mahjong-reload-resumes-same-seat-no-opponent-tiles: a seated player
// reloads mid-hand and resumes the same seat with the same concealed hand, and no
// opponent concealed tile ever renders in the DOM (the hidden-information
// projection holds across the reconnect).
test("reload mid-hand resumes the same seat with the same hand and no opponent tiles", async ({
  browser,
}) => {
  const artifactDir = path.resolve("e2e/artifacts");
  const [ctxHost, ctxGuest] = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  const [host, guest] = await Promise.all([ctxHost.newPage(), ctxGuest.newPage()]);
  await Promise.all([host.goto(URL), guest.goto(URL)]);

  const code = await createRoomAs(host, "Alice");
  await joinRoomByCode(guest, code, "Bob");
  await guest.getByText(/^Room: /).waitFor({ timeout: 5000 });

  // The host fills the last two seats with bots and deals. The guest takes seat 1,
  // a non-default seat, so the reload really proves seat restoration.
  await host.getByRole("button", { name: "Start with bots" }).click();
  await guest.getByRole("region", { name: "Your hand" }).waitFor({ timeout: 15_000 });

  const seatBefore = await readSeat(guest);
  const handBefore = await readHand(guest);
  expect(seatBefore).toBeGreaterThan(0);
  expect(handBefore.length).toBeGreaterThan(0);
  // No opponent concealed tile is ever in the DOM.
  await expect(guest.locator(".mj-opponent .mj-tile-btn")).toHaveCount(0);

  // Reload mid-hand. The client auto-rejoins the held seat with playerId plus
  // reconnectToken and the server returns a fresh per-seat snapshot.
  await guest.reload();
  await guest.getByRole("region", { name: "Your hand" }).waitFor({ timeout: 15_000 });

  const seatAfter = await readSeat(guest);
  const handAfter = await readHand(guest);

  expect(seatAfter).toBe(seatBefore);
  expect(handAfter).toEqual(handBefore);
  // The hidden-information projection still holds after the reconnect.
  await expect(guest.locator(".mj-opponent .mj-tile-btn")).toHaveCount(0);

  await Promise.all([ctxHost.close(), ctxGuest.close()]);
});

// QA scenario qa-fan-pattern-guide-open-filter-close: a seated player opens the
// fan and pattern guide from the tai pill, sees the three tier summaries and the
// pattern list with Chinese names, filters down to Guaranteed, and closes with
// Escape. Focus returns to the pill and the pill's accessible name states the
// guaranteed and potential numbers.
test("opens the fan and pattern guide from the pill, filters, and closes with Escape", async ({
  browser,
}) => {
  const artifactDir = path.resolve("e2e/artifacts");
  const [ctxHost, ctxGuest] = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  const [host, guest] = await Promise.all([ctxHost.newPage(), ctxGuest.newPage()]);
  await Promise.all([host.goto(URL), guest.goto(URL)]);

  const code = await createRoomAs(host, "Player1");
  await joinRoomByCode(guest, code, "Player2");
  await guest.getByText(/^Room: /).waitFor({ timeout: 5000 });

  await host.getByRole("button", { name: "Start with bots" }).click();
  await host.getByRole("region", { name: "Your hand" }).waitFor({ timeout: 15_000 });

  // The tai pill states the guaranteed and potential numbers in its name.
  const pill = host.getByRole("button", { name: /Open the guide/ });
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAccessibleName(/\d+ tai guaranteed, up to \d+ tai/);

  await pill.click();

  const dialog = host.getByRole("dialog", { name: "Fan and pattern guide" });
  await expect(dialog).toBeVisible();

  // The three tier summary headings.
  await expect(dialog.getByText("GUARANTEED", { exact: true })).toBeVisible();
  await expect(dialog.getByText("ON TRACK", { exact: true })).toBeVisible();
  await expect(dialog.getByText("POTENTIAL", { exact: true })).toBeVisible();

  // At least one pattern with its Chinese name beside the English name.
  const chineseNames = dialog.locator(".mj-guide-list .mj-guide-zh");
  await expect(chineseNames.first()).toBeVisible();
  expect((await chineseNames.first().textContent())?.trim().length).toBeGreaterThan(0);

  // Filter to Guaranteed: turn off the other two chips.
  await dialog.getByRole("button", { name: "On track", exact: true }).click();
  await dialog.getByRole("button", { name: "Potential", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Guaranteed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "On track", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    dialog.getByRole("button", { name: "Potential", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  // Escape closes the dialog and returns focus to the pill.
  await host.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(pill).toBeFocused();

  await Promise.all([ctxHost.close(), ctxGuest.close()]);
});
