// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { games, groups } from "@portal/shared/registry";
import { Portal } from "./Portal.tsx";

afterEach(cleanup);

const enabled = games.filter((g) => g.enabled !== false);

describe("Portal", () => {
  it("renders one section per group, in registry order", () => {
    render(<Portal />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(groups.map((g) => g.title));
  });

  it("lists every enabled game exactly once, under its own group", () => {
    render(<Portal />);
    for (const group of groups) {
      const section = screen.getByRole("region", { name: group.title });
      const hrefs = within(section)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href"));
      expect(hrefs).toEqual(enabled.filter((g) => g.group === group.id).map((g) => g.path));
    }
    expect(screen.getAllByRole("link")).toHaveLength(enabled.length);
  });

  it("names each card by its game title", () => {
    render(<Portal />);
    for (const game of enabled) {
      expect(screen.getByText(game.title)).toBeTruthy();
    }
  });

  it("marks each card as online or solo", () => {
    render(<Portal />);
    const online = enabled.filter((g) => g.multiplayer).length;
    expect(screen.getAllByText("Online")).toHaveLength(online);
    expect(screen.getAllByText("Solo")).toHaveLength(enabled.length - online);
  });

  it("draws real tile artwork for the games that declare a tile", () => {
    const { container } = render(<Portal />);
    const withTile = enabled.filter((g) => g.tile);
    expect(withTile.length).toBeGreaterThan(0);
    for (const game of withTile) {
      const card = container.querySelector(`[data-game="${game.id}"]`);
      expect(card?.querySelector("img.mj-tile-img")).not.toBeNull();
    }
  });
});
