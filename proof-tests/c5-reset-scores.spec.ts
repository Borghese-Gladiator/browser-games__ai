// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const cell = (page: Page, name: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${name}`) });

const X_WIN = ["top left", "middle left", "top center", "middle center", "top right"];
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
  test("C5: Reset scores zeroes counters and does not clear the board", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");
    const resetGame = page.getByRole("button", { name: "Reset game" });

    // 1. Play the X win sequence, click Reset game, then play the draw sequence.
    for (const name of X_WIN) {
      await cell(page, name).click();
    }
    await resetGame.click();
    for (const name of DRAW) {
      await cell(page, name).click();
    }
    await expect(counter(page, "X wins")).toHaveText("1");
    await expect(counter(page, "Draws")).toHaveText("1");

    // 2. Reset game, then click top left (X) and top center (O) to leave a game in progress.
    await resetGame.click();
    await cell(page, "top left").click();
    await cell(page, "top center").click();
    await expect(page.getByRole("gridcell", { name: /, (X|O)$/ })).toHaveCount(2);

    // 3. Click the 'Reset scores' button.
    await page.getByRole("button", { name: "Reset scores" }).click();
    await expect(counter(page, "X wins")).toHaveText("0");
    await expect(counter(page, "O wins")).toHaveText("0");
    await expect(counter(page, "Draws")).toHaveText("0");
    await expect(page.getByRole("gridcell", { name: "top left, X" })).toBeVisible();
    await expect(page.getByRole("gridcell", { name: "top center, O" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("X's turn");
  });
});
