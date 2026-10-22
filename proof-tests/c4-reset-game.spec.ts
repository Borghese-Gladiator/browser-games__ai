// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const cell = (page: Page, name: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${name}`) });

const X_WIN = ["top left", "middle left", "top center", "middle center", "top right"];

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C4: Reset game clears the board and keeps counters", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Play the X win sequence: top left, middle left, top center, middle center, top right.
    for (const name of X_WIN) {
      await cell(page, name).click();
    }
    await expect(counter(page, "X wins")).toHaveText("1");

    // 2. Click the 'Reset game' button.
    await page.getByRole("button", { name: "Reset game" }).click();
    for (const gridcell of await page.getByRole("gridcell").all()) {
      await expect(gridcell).toHaveText("");
    }
    await expect(page.getByRole("status")).toHaveText("X's turn");
    await expect(counter(page, "X wins")).toHaveText("1");
    await expect(counter(page, "O wins")).toHaveText("0");
    await expect(counter(page, "Draws")).toHaveText("0");

    // 3. Play a second X win on the new board.
    for (const name of X_WIN) {
      await cell(page, name).click();
    }
    await expect(counter(page, "X wins")).toHaveText("2");
  });
});
