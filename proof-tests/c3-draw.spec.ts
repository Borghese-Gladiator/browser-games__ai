// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const cell = (page: Page, name: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${name}`) });

const DRAW = [
  "top left",
  "top center",
  "top right",
  "middle center",
  "middle left",
  "middle right",
  "bottom center",
  "bottom left",
  "bottom right",
];

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C3: draw increments the Draws counter", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Click in order: top left, top center, top right, middle center, middle left, middle right, bottom center, bottom left, bottom right.
    for (const name of DRAW) {
      await cell(page, name).click();
    }
    await expect(page.getByRole("status")).toHaveText("It's a draw!");
    await expect(counter(page, "Draws")).toHaveText("1");
    await expect(counter(page, "X wins")).toHaveText("0");
    await expect(counter(page, "O wins")).toHaveText("0");
  });
});
