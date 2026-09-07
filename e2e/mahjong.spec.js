import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";

// Four browser clients play one legal Taiwanese-mahjong hand end to end. Only
// the active seat (or a seat with an open claim window) acts each tick; every
// action comes from a button the engine's availableActions produced, so the
// play is engine-legal. The spec asserts a legal discard advanced a turn and
// that at least one claim window opened and resolved.
test("4-player Mahjong plays a legal hand with a claim window", async ({ browser }) => {
  const artifactDir = path.resolve("e2e/artifacts");

  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ recordVideo: { dir: artifactDir } }),
    ),
  );
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `MJPlayer${i + 1}` }),
    ),
  );

  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  await Promise.all(pages.map((p) => p.goto("http://localhost:5173/games/mahjong/")));

  // Player 1 creates a room; the rest join it by its code. The server
  // auto-starts the hand once all four seats are filled.
  const [host, ...guests] = pages;
  const code = await createRoomAs(host, "Player1");
  for (const [i, page] of guests.entries()) {
    await joinRoomByCode(page, code, `Player${i + 2}`);
  }

  await Promise.all(
    pages.map((p) =>
      p.getByRole("region", { name: "Your hand" }).waitFor({ timeout: 15_000 }),
    ),
  );

  const flags = { sawDiscard: false, sawClaimWindow: false };

  // Take the one legal action this seat owns right now, read from the status
  // line. Returns true once this page shows a finished hand.
  async function act(page) {
    const status = ((await page.getByRole("status").textContent().catch(() => "")) ?? "").trim();
    if (/wins/.test(status) || status.startsWith("Draw")) return true;

    if (status === "Your turn") {
      const draw = page.getByRole("button", { name: "Draw", exact: true });
      if (await draw.isEnabled({ timeout: 200 }).catch(() => false)) {
        await draw.click();
        return false;
      }
      // Discard the first tile the engine offered as a legal discard.
      const discards = page.getByRole("button", { name: /^Discard / });
      const n = await discards.count();
      for (let i = 0; i < n; i++) {
        const btn = discards.nth(i);
        if (await btn.isEnabled({ timeout: 200 }).catch(() => false)) {
          await btn.click();
          flags.sawDiscard = true;
          return false;
        }
      }
      return false;
    }

    if (status === "Claim the discard?") {
      flags.sawClaimWindow = true;
      // Take a real claim when one is offered, otherwise pass. Either way the
      // window resolves.
      for (const name of ["Pong", "Chow", "Kong", "Win"]) {
        const btn = page.getByRole("button", { name, exact: true });
        if (await btn.isEnabled({ timeout: 200 }).catch(() => false)) {
          await btn.click();
          return false;
        }
      }
      const pass = page.getByRole("button", { name: "Pass", exact: true });
      if (await pass.isEnabled({ timeout: 200 }).catch(() => false)) {
        await pass.click();
      }
      return false;
    }

    return false;
  }

  let done = false;
  for (let round = 0; round < 2000 && !done; round++) {
    const results = await Promise.all(pages.map((p) => act(p)));
    done = results.some(Boolean);
    await host.waitForTimeout(40);
  }

  // A legal discard advanced play, and at least one claim window opened.
  expect(flags.sawDiscard).toBe(true);
  expect(flags.sawClaimWindow).toBe(true);

  // Every client agrees the hand finished on the same outcome.
  for (const page of pages) {
    await expect(page.getByRole("status")).toContainText(/wins|Draw/, { timeout: 30_000 });
  }
  const statuses = await Promise.all(
    pages.map((p) => p.getByRole("status").textContent()),
  );
  expect(new Set(statuses.map((t) => t.trim())).size).toBe(1);

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `mj-trace-player${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
