import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";
import { GATEWAY, gamePage } from "./ports.js";

// Plays a full 4-player poker hand to showdown, then asserts the framework's
// leaderboard/stats layer recorded the result: the winner tops the per-game
// board (all-time and daily) and the completed game appears in their history.
test("completed game reflects in leaderboard scope and match history", async ({ browser }) => {
  const artifactDir = path.resolve("e2e/artifacts");
  const API = GATEWAY;

  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ recordVideo: { dir: artifactDir } }),
    ),
  );
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `LB-Player${i + 1}` }),
    ),
  );

  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  await Promise.all(pages.map((p) => p.goto(gamePage("poker"))));

  const [host, ...guests] = pages;
  const code = await createRoomAs(host, "Player1");

  for (const [i, page] of guests.entries()) {
    await joinRoomByCode(page, code, `Player${i + 2}`);
  }

  await Promise.all(
    pages.map((p) =>
      p.getByRole("region", { name: "Your cards" }).waitFor({ timeout: 15_000 }),
    ),
  );

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

  for (const page of pages) {
    await expect(page.getByRole("status")).toContainText(/wins the pot/, {
      timeout: 10_000,
    });
  }

  // Identify the winner's stable playerId. The announcement names the winner;
  // match that name to the page whose own seat label shows it, then read that
  // page's localStorage playerId.
  const announcement = (await host.getByRole("status").textContent()).trim();
  const winnerName = announcement.match(/^(\S+) wins the pot/)?.[1];
  expect(winnerName, `could not parse winner from "${announcement}"`).toBeTruthy();

  const names = ["Player1", "Player2", "Player3", "Player4"];
  const winnerPageIndex = names.indexOf(winnerName);
  expect(winnerPageIndex).toBeGreaterThanOrEqual(0);

  const winnerId = await pages[winnerPageIndex].evaluate(() =>
    localStorage.getItem("browser-games:playerId"),
  );
  expect(winnerId).toBeTruthy();

  // Leaderboard (all-time, per-game): the winner tops this room's board. Scope by
  // roomCode so a sibling spec's concurrent poker hand on the shared gateway can't
  // outrank this room's winner.
  const allTime = await host.request
    .get(`${API}/api/leaderboard?gameId=poker&roomCode=${code}&window=all-time`)
    .then((r) => r.json());
  const allEntry = allTime.entries.find((e) => e.playerId === winnerId);
  expect(allEntry, "winner missing from all-time board").toBeTruthy();
  expect(allEntry.rank).toBe(1);
  expect(allEntry.wins).toBeGreaterThanOrEqual(1);

  // Daily window: same game is within the day, so the winner appears here too.
  const daily = await host.request
    .get(`${API}/api/leaderboard?gameId=poker&roomCode=${code}&window=daily`)
    .then((r) => r.json());
  expect(daily.entries.some((e) => e.playerId === winnerId)).toBe(true);

  // Match history: the completed game is present with a rank-1 outcome.
  const history = await host.request
    .get(`${API}/api/history?playerId=${encodeURIComponent(winnerId)}`)
    .then((r) => r.json());
  expect(history.games.length).toBeGreaterThanOrEqual(1);
  expect(history.games.some((g) => g.gameId === "poker" && g.outcome.rank === 1)).toBe(true);

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `trace-lb-player${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
