import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";
import { gamePage } from "./ports.js";

test("4-player Sheng Ji plays a full deal", async ({ browser }) => {
  const artifactDir = path.resolve("e2e/artifacts");

  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ recordVideo: { dir: artifactDir } }),
    ),
  );
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `SJPlayer${i + 1}` }),
    ),
  );

  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  await Promise.all(pages.map((p) => p.goto(gamePage("sheng-ji"))));

  // Player 1 creates a room; the rest join it by its code.
  const [host, ...guests] = pages;
  const code = await createRoomAs(host, "Player1");

  for (const [i, page] of guests.entries()) {
    await joinRoomByCode(page, code, `Player${i + 2}`);
  }

  // Wait for hands to be dealt — each page shows the "Your hand" region.
  await Promise.all(
    pages.map((p) =>
      p.getByRole("region", { name: "Your hand" }).waitFor({ timeout: 15_000 }),
    ),
  );

  async function playUntilDone(page) {
    for (let attempt = 0; attempt < 600; attempt++) {
      const text = await page.getByRole("status").textContent().catch(() => "");
      if (text?.includes("wins")) return;
      const all = await page.getByRole("button", { name: /^Play / }).all();
      for (const btn of all) {
        try {
          if (await btn.isEnabled({ timeout: 80 })) {
            await btn.click();
            break;
          }
        } catch {
          /* not enabled */
        }
      }
      await page.waitForTimeout(150);
    }
  }

  await Promise.all(pages.map(playUntilDone));

  // All 4 clients show a deal result.
  for (const page of pages) {
    await expect(page.getByRole("status")).toContainText(/wins/, { timeout: 30_000 });
  }

  // All 4 agree on the same outcome.
  const statuses = await Promise.all(pages.map((p) => p.getByRole("status").textContent()));
  expect(new Set(statuses.map((t) => t.trim())).size).toBe(1);

  // The deal completed all 13 tricks.
  const scoreText = await pages[0].getByRole("region", { name: "Score" }).textContent();
  expect(scoreText).toMatch(/Tricks played: 13/);

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `sj-trace-player${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
