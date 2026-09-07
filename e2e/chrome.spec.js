import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";

// Proves the shared client framework works end-to-end against poker:
//  - <ConnectionBanner> reacts to a drop and a reconnect
//  - <PlayerList> shows presence dots + deterministic avatars
//  - chat delivers a message from one client to another
test("shared chrome: reconnect banner, presence/avatars, and chat delivery", async ({
  browser,
}) => {
  const artifactDir = path.resolve("e2e/artifacts");

  const contexts = await Promise.all([
    browser.newContext({ recordVideo: { dir: artifactDir } }),
    browser.newContext({ recordVideo: { dir: artifactDir } }),
  ]);
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `Chrome${i + 1}` }),
    ),
  );

  const [host, guest] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  await Promise.all([
    host.goto("http://localhost:5173/games/poker/"),
    guest.goto("http://localhost:5173/games/poker/"),
  ]);

  // Host creates a room; guest joins by code.
  const code = await createRoomAs(host, "Host");
  await joinRoomByCode(guest, code, "Guest");

  // Host fills the table with bots so the hand goes live.
  await host.getByRole("button", { name: "Start with bots" }).click();
  await host.getByRole("region", { name: "Your cards" }).waitFor({ timeout: 15_000 });

  // --- PlayerList: presence dots + avatars ---
  await expect(host.locator(".player-list-item").first()).toBeVisible({ timeout: 5_000 });
  await expect(host.locator(".player-avatar").first()).toBeVisible();
  await expect(host.locator(".presence-dot.is-live").first()).toBeVisible();

  // --- Chat delivery between two clients ---
  await guest.getByLabel("Chat message").fill("Hello from guest!");
  await guest.getByRole("button", { name: "Send" }).click();
  await expect(host.locator('[role="log"]')).toContainText("Hello from guest!", {
    timeout: 5_000,
  });

  // --- ConnectionBanner reacts to a drop/reconnect ---
  // No banner while connected.
  await expect(host.getByRole("alert")).toHaveCount(0);
  // Go offline first so the client's reconnect attempts can't immediately
  // succeed, then drop the live gateway socket through the Socket.IO client's own
  // disconnect(). That fires the hook's disconnect handler synchronously (no
  // dependence on a raw-WebSocket close handshake that offline can stall), so the
  // reconnecting banner appears and stays.
  await host.context().setOffline(true);
  await host.waitForFunction(() => Boolean(window.__gameSocket));
  await host.evaluate(() => window.__gameSocket.disconnect());
  await expect(host.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  await expect(host.getByRole("alert")).toContainText(/reconnecting/i);
  // Restore connectivity → banner clears once the socket re-opens.
  await host.context().setOffline(false);
  await expect(host.getByRole("alert")).toHaveCount(0, { timeout: 20_000 });

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `trace-chrome-${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
