// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C1: scoreboard starts at zero", async ({ page }) => {
    // 1. Navigate to /games/tic-tac-toe/.
    await page.goto("/games/tic-tac-toe/");
    await expect(page.getByLabel("Scoreboard")).toBeVisible();
    for (const label of ["X wins", "O wins", "Draws"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(counter(page, label)).toHaveText("0");
    }

    // 2. Reload the page after no moves.
    await page.reload();
    for (const label of ["X wins", "O wins", "Draws"]) {
      await expect(counter(page, label)).toHaveText("0");
    }
  });
});
