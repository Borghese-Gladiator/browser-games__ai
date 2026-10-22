// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C5: Reset scores on a fresh page is harmless", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Click 'Reset scores' with no games played.
    await page.getByRole("button", { name: "Reset scores" }).click();
    await expect(counter(page, "X wins")).toHaveText("0");
    await expect(counter(page, "O wins")).toHaveText("0");
    await expect(counter(page, "Draws")).toHaveText("0");
    await expect(page.getByRole("gridcell", { name: /, (X|O)$/ })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("X's turn");
  });
});
