import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";

test("4-player Texas Hold'em plays a full hand to showdown", async ({ browser }) => {
  const artifactDir = path.resolve("e2e/artifacts");

  // 4 independent browser contexts, each recording video.
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ recordVideo: { dir: artifactDir } }),
    ),
  );

  // Start a trace per context.
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `Player${i + 1}` }),
    ),
  );

  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  await Promise.all(
    pages.map((p) => p.goto("http://localhost:5173/games/poker/")),
  );

  // Player 1 creates a room; the rest join it by its code.
  const [host, ...guests] = pages;
  const code = await createRoomAs(host, "Player1");

  for (const [i, page] of guests.entries()) {
    await joinRoomByCode(page, code, `Player${i + 2}`);
  }

  // Server auto-starts the hand once all 4 are seated — wait for hole cards.
  await Promise.all(
    pages.map((p) =>
      p.getByRole("region", { name: "Your cards" }).waitFor({ timeout: 15_000 }),
    ),
  );

  // Each page plays until a winner is announced. Prefer Check, then Call, to
  // keep everyone in for a showdown.
  async function playUntilDone(page) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const statusText = await page
        .getByRole("status")
        .textContent()
        .catch(() => "");
      if (statusText && statusText.includes("wins")) return;

      for (const action of ["Check", "Call"]) {
        const btn = page.getByRole("button", { name: action });
        try {
          if (await btn.isEnabled({ timeout: 80 })) {
            await btn.click();
            break;
          }
        } catch {
          /* button not present / not enabled */
        }
      }
      await page.waitForTimeout(150);
    }
  }

  await Promise.all(pages.map(playUntilDone));

  // All 4 clients must display the winner announcement.
  for (const page of pages) {
    await expect(page.getByRole("status")).toContainText(/wins the pot/, {
      timeout: 10_000,
    });
  }

  // Exactly one winner name should appear consistently across clients.
  const announcements = await Promise.all(
    pages.map((p) => p.getByRole("status").textContent()),
  );
  const unique = new Set(announcements.map((t) => t.trim()));
  expect(unique.size).toBe(1);

  // Save traces and close.
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `trace-player${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
