import { test, expect } from "@playwright/test";
import { BASE as DEFAULT_BASE } from "./ports.js";

const BASE = process.env.TRAINER_BASE_URL ?? DEFAULT_BASE;
const URL = `${BASE}/games/mahjong-trainer/`;
const REASON = /improve the hand|steps? from a win|good shapes?|waits on|penalty/;

// QA scenario qa-discard-trainer-flow: the single-player trainer loads a hand,
// the player selects a discard, the full ranking and an explanation appear, and
// the player advances to a fresh puzzle.
test("select a discard, see the ranking and an explanation, then get a next puzzle", async ({
  page,
}) => {
  await page.goto(URL);

  const hand = page.getByRole("region", { name: "Your hand" });
  await hand.waitFor({ timeout: 15_000 });

  // No ranking before a choice is made.
  await expect(page.getByRole("region", { name: "Discard ranking" })).toHaveCount(0);

  const firstDiscard = page.getByRole("button", { name: /^Discard / }).first();
  const firstLabel = await firstDiscard.getAttribute("aria-label");
  await firstDiscard.click();

  // The ranking is revealed with the player's position marked.
  const ranking = page.getByRole("region", { name: "Discard ranking" });
  await expect(ranking).toBeVisible();
  await expect(ranking.getByRole("heading", { name: "Full ranking" })).toBeVisible();
  await expect(ranking.locator('[aria-current="true"]')).toHaveCount(1);

  // An explanation renders as a readable sentence.
  await expect(ranking.getByText(REASON).first()).toBeVisible();

  // Advance to a next puzzle: the ranking hides and the hand is selectable again.
  await page.getByRole("button", { name: "Next puzzle" }).click();
  await expect(page.getByRole("region", { name: "Discard ranking" })).toHaveCount(0);

  const nextDiscards = page.getByRole("button", { name: /^Discard / });
  await expect(nextDiscards.first()).toBeEnabled();
  await expect(await nextDiscards.count()).toBeGreaterThan(0);
  expect(firstLabel).toBeTruthy();
});
