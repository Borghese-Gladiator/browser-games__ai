// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@portal/shared/registry", () => ({
  games: [
    { id: "a", title: "A", description: "", emoji: "", path: "/a/", enabled: true },
    { id: "b", title: "B", description: "", emoji: "", path: "/b/", enabled: true },
    { id: "c", title: "C", description: "", emoji: "", path: "/c/", enabled: false },
    { id: "d", title: "D", description: "", emoji: "", path: "/d/" },
  ],
}));

const { Portal } = await import("./Portal.jsx");

afterEach(() => {
  cleanup();
});

describe("Portal", () => {
  it("renders the subtitle with the enabled-game count", () => {
    render(<Portal />);
    const subtitle = screen.getByText("Pick a game to play. · 3 games available");
    expect(subtitle).toBeTruthy();
  });
});
