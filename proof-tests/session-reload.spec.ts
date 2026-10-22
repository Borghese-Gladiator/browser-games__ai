// spec: specs/ttt-scoreboard.md
// seed: proof-tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const counter = (page: Page, label: string) =>
  page.locator("dt").getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
const cell = (page: Page, name: string) =>
  page.getByRole("gridcell", { name: new RegExp(`^${name}`) });

test.describe("Tic-Tac-Toe scoreboard", () => {
  test("C1: scores are not kept after a page reload (negative)", async ({ page }) => {
    await page.goto("/games/tic-tac-toe/");

    // 1. Play the X win sequence, then reload the page.
    for (const name of ["top left", "middle left", "top center", "middle center", "top right"]) {
      await cell(page, name).click();
    }
    await expect(counter(page, "X wins")).toHaveText("1");
    await page.reload();
    await expect(counter(page, "X wins")).toHaveText("0");
    await expect(counter(page, "O wins")).toHaveText("0");
    await expect(counter(page, "Draws")).toHaveText("0");
    await expect(page.getByRole("gridcell", { name: /, (X|O)$/ })).toHaveCount(0);
  });
});
