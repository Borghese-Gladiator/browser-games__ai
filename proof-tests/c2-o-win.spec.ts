// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const cell = (page: Page, name: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${name}`) });

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C2: O win increments only the O wins counter (symmetry check)", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Click in order: top left (X), middle left (O), top center (X), middle center (O), bottom right (X), middle right (O).
    for (const name of [
      "top left",
      "middle left",
      "top center",
      "middle center",
      "bottom right",
      "middle right",
    ]) {
      await cell(page, name).click();
    }
    await expect(page.getByRole("status")).toHaveText("O wins!");
    await expect(counter(page, "O wins")).toHaveText("1");
    await expect(counter(page, "X wins")).toHaveText("0");
    await expect(counter(page, "Draws")).toHaveText("0");
  });
});
