import { test, expect } from "@playwright/test";
import { mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.HISTORY_BASE_URL ?? "http://localhost:5173";
const GAME_ID = "E2EREVIEW";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Seed the gateway's event store with a completed mahjong game so the review can
// replay it. The gateway reads EVENTS_PATH=.state/e2e/events (playwright.config).
function seedFixture() {
  const dir = join(repoRoot, ".state", "e2e", "events");
  mkdirSync(dir, { recursive: true });
  copyFileSync(
    join(repoRoot, "e2e", "fixtures", "mahjong-review.json"),
    join(dir, `${GAME_ID}.json`),
  );
}

// QA scenario qa-review-step-forward-chosen-vs-best: open a completed game's
// review, step forward one turn, and confirm a chosen-versus-best comparison
// renders.
test("open a review, step forward a turn, and see chosen vs best", async ({ page }) => {
  seedFixture();
  await page.goto(`${BASE}/history/${GAME_ID}`);

  const review = page.getByRole("region", { name: "Move review" });
  await review.waitFor({ timeout: 15_000 });

  // Turn 1: the chosen and best discards render side by side.
  await expect(review.getByText("Turn 1 of 72")).toBeVisible();
  await expect(review.getByRole("heading", { name: "Chosen discard" })).toBeVisible();
  await expect(review.getByRole("heading", { name: "Best discard" })).toBeVisible();

  const chosen = review.locator(".rv-move-chosen .rv-move-tile");
  const best = review.locator(".rv-move-best .rv-move-tile");
  const firstChosen = await chosen.textContent();
  const firstBest = await best.textContent();
  expect(firstChosen).toBeTruthy();
  expect(firstBest).toBeTruthy();

  // Step forward one turn: the comparison re-renders for the next discard.
  await review.getByRole("button", { name: "Next turn" }).click();
  await expect(review.getByText("Turn 2 of 72")).toBeVisible();
  await expect(review.getByRole("heading", { name: "Chosen discard" })).toBeVisible();
  await expect(review.getByRole("heading", { name: "Best discard" })).toBeVisible();
  await expect(chosen).not.toHaveText("");
  await expect(best).not.toHaveText("");
});
