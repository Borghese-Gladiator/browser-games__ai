import { test, expect } from "@playwright/test";
import path from "node:path";
import { createRoomAs, joinRoomByCode } from "./helpers/transport.js";
import { GATEWAY, gamePage } from "./ports.js";

// Plays part of a 4-player poker hand, then asserts the observability layer sees
// it: /stats lists the active room with the right member count and an appended
// event-log entry carrying a state hash, and the /admin live-ops page renders the
// room. Video + trace are recorded as proof.
test("active game is visible via /stats and the admin page with an event-log state hash", async ({ browser }) => {
  const artifactDir = path.resolve("e2e/artifacts");
  const API = GATEWAY;

  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ recordVideo: { dir: artifactDir } }),
    ),
  );
  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.start({ screenshots: true, snapshots: true, title: `OBS-Player${i + 1}` }),
    ),
  );

  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  await Promise.all(pages.map((p) => p.goto(gamePage("poker"))));

  const [host, ...guests] = pages;
  const code = await createRoomAs(host, "Player1");

  for (const [i, page] of guests.entries()) {
    await joinRoomByCode(page, code, `Player${i + 2}`);
  }

  await Promise.all(
    pages.map((p) =>
      p.getByRole("region", { name: "Your cards" }).waitFor({ timeout: 15_000 }),
    ),
  );

  // Apply at least one engine message so the event log has an entry. Click the
  // first available action on whichever page is to act.
  let acted = false;
  for (let attempt = 0; attempt < 40 && !acted; attempt++) {
    for (const page of pages) {
      for (const action of ["Check", "Call"]) {
        const btn = page.getByRole("button", { name: action });
        try {
          if (await btn.isEnabled({ timeout: 80 })) {
            await btn.click();
            acted = true;
            break;
          }
        } catch {
          /* button not present / not enabled */
        }
      }
      if (acted) break;
    }
    if (!acted) await host.waitForTimeout(150);
  }
  expect(acted, "no game action could be applied").toBe(true);

  // /stats: the active room is present with 4 members and an appended event-log
  // entry whose stateHash is a 16-char hex string.
  await expect
    .poll(
      async () => {
        const stats = await host.request.get(`${API}/stats`).then((r) => r.json());
        const room = stats.rooms.find((r) => r.code === code);
        return room?.eventLogSize ?? 0;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  const stats = await host.request.get(`${API}/stats`).then((r) => r.json());
  const activeRoom = stats.rooms.find((r) => r.code === code);
  expect(activeRoom, `room ${code} missing from /stats`).toBeTruthy();
  expect(activeRoom.memberCount).toBe(4);
  expect(activeRoom.eventLogSize).toBeGreaterThan(0);
  expect(activeRoom.lastEvent).toBeTruthy();
  expect(activeRoom.lastEvent.stateHash).toMatch(/^[0-9a-f]{16}$/);

  // Admin page: the room code is rendered in the live-ops table.
  const adminCtx = await browser.newContext();
  await adminCtx.tracing.start({ screenshots: true, snapshots: true, title: "OBS-Admin" });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${API}/admin`);
  await expect(adminPage.getByText(code)).toBeVisible({ timeout: 10_000 });

  await adminCtx.tracing.stop({ path: path.join(artifactDir, "trace-obs-admin.zip") });
  await adminCtx.close();

  await Promise.all(
    contexts.map((ctx, i) =>
      ctx.tracing.stop({ path: path.join(artifactDir, `trace-obs-player${i + 1}.zip`) }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.close()));
});
