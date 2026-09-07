import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";

test("4-player President plays through at least one trick", async ({ browser }) => {
  const artifactDir = path.resolve("e2e/artifacts");

  // 4 independent browser contexts, each recording video.
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ recordVideo: { dir: artifactDir } }),
    ),
  );

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `Player${i + 1}` }),
    ),
  );

  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  await Promise.all(
    pages.map((p) => p.goto("http://localhost:5173/games/president/")),
  );

  // Player 1 creates a room; the rest join it by its code.
  const [host, ...guests] = pages;
  const code = await createRoomAs(host, "Player1");

  for (const [i, page] of guests.entries()) {
    await joinRoomByCode(page, code, `Player${i + 2}`);
  }

  // Server auto-starts the round once all 4 are seated — wait for hands.
  await Promise.all(
    pages.map((p) =>
      p.getByRole("region", { name: "Your cards" }).waitFor({ timeout: 15_000 }),
    ),
  );

  // Take an action for whichever page it's currently the turn of. Passing is the
  // deterministic choice: only the trick leader must play, and after the leader
  // plays, everyone else passing resets the trick — which is exactly the
  // advance we assert. So: if Pass is available, pass; otherwise (we're leading)
  // play the lowest single card. Returns true if it acted.
  async function actIfMyTurn(page) {
    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    const passBtn = page.getByRole("button", { name: "Pass", exact: true });

    // Actions region only renders on our turn.
    const hasActions = await page
      .getByRole("region", { name: "Your actions" })
      .isVisible()
      .catch(() => false);
    if (!hasActions) return false;

    if (await passBtn.isEnabled().catch(() => false)) {
      await passBtn.click();
      return true;
    }

    // We must be leading a fresh trick — play the lowest single card.
    const cardButtons = page.getByRole("button", { name: /^Card / });
    if ((await cardButtons.count()) > 0) {
      await cardButtons.first().click();
      if (await playBtn.isEnabled().catch(() => false)) {
        await playBtn.click();
        return true;
      }
      await cardButtons.first().click();
    }
    return false;
  }

  // The current play indicator: read seat 0's view of who played what.
  async function currentPlayCards(page) {
    const region = page.getByRole("region", { name: "Current play" });
    const items = region.getByRole("listitem");
    const n = await items.count();
    const out = [];
    for (let i = 0; i < n; i++) out.push((await items.nth(i).textContent())?.trim());
    return out;
  }

  // Drive the table until at least one card has been played AND the trick has
  // advanced past its first play (either a second play landed on top or the
  // trick reset after passes). We track transitions on the host's view.
  let sawFirstPlay = false;
  let sawTrickAdvance = false;
  const before = { cards: null };

  for (let round = 0; round < 300 && !sawTrickAdvance; round++) {
    // Whoever's turn it is acts.
    await Promise.all(pages.map((p) => actIfMyTurn(p)));

    const cards = await currentPlayCards(host).catch(() => []);
    if (!sawFirstPlay && cards.length > 0) {
      sawFirstPlay = true;
      before.cards = cards.join(",");
    } else if (sawFirstPlay) {
      const now = cards.join(",");
      // Trick advanced: a different play is on top, or the trick reset (empty).
      if (now !== before.cards) sawTrickAdvance = true;
    }

    await host.waitForTimeout(120);
  }

  expect(sawFirstPlay).toBe(true);
  expect(sawTrickAdvance).toBe(true);

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `trace-player${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
