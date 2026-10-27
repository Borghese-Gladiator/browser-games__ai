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
  test("C6: repeated clicks after a draw do not change counters", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Play the draw sequence.
    for (const name of DRAW) {
      await cell(page, name).click();
    }
    await expect(counter(page, "Draws")).toHaveText("1");

    // 2. Click several filled cells.
    for (const name of ["top left", "middle center", "bottom right", "top left", "top right"]) {
      await cell(page, name).click({ force: true });
    }
    await expect(counter(page, "Draws")).toHaveText("1");
    await expect(counter(page, "X wins")).toHaveText("0");
    await expect(counter(page, "O wins")).toHaveText("0");
  });
});
