// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const cell = (page: Page, name: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${name}`) });

const X_WIN = ["top left", "middle left", "top center", "middle center", "top right"];

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C6: clicking a filled cell after the game ends does not change counters", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Play the X win sequence: top left, middle left, top center, middle center, top right.
    for (const name of X_WIN) {
      await cell(page, name).click();
    }
    await expect(counter(page, "X wins")).toHaveText("1");
    const before = await page.getByRole("grid").textContent();

    // 2. Click a filled cell (top left), then an empty cell (bottom right), then a filled cell again several times.
    for (const name of ["top left", "bottom right", "top left", "middle left", "top left"]) {
      await cell(page, name).click({ force: true });
    }
    await expect(counter(page, "X wins")).toHaveText("1");
    await expect(counter(page, "O wins")).toHaveText("0");
    await expect(counter(page, "Draws")).toHaveText("0");
    await expect(page.getByRole("grid")).toHaveText(before ?? "");
    await expect(page.getByRole("gridcell", { name: "bottom right" })).toHaveText("");
  });
});
