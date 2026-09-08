// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// The board reads everything from useGameSocket, so a stub socket drives the UI
// without a real gateway. Each test overrides the return value.
const socket = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@browser-games/game-client/useGameSocket", () => ({
  useGameSocket: () => socket.value,
}));

import { Mahjong } from "./Mahjong.tsx";

afterEach(cleanup);

// A seated, mid-hand view for seat 1. Opponents expose counts and public melds
// or discards only — never a concealed hand — matching the publicState
// projection the gateway sends.
function tableView() {
  return {
    phase: "PLAYING",
    activeSeat: 0,
    pendingSeats: [],
    wallCount: 42,
    lastDiscard: null,
    players: [
      { seat: 0, name: "Alice" },
      { seat: 1, name: "Me" },
      { seat: 2, name: "Bot 1" },
      { seat: 3, name: "Bot 2" },
    ],
    mySeat: 1,
    myHand: ["dots-1-1", "dots-2-1", "bamboo-5-3"],
    myMelds: [],
    myFlowers: [],
    myDiscards: [],
    opponents: [
      { seat: 0, name: "Alice", count: 16, melds: [], flowers: [], discards: ["characters-9-1"] },
      { seat: 2, name: "Bot 1", count: 16, melds: [], flowers: [], discards: [] },
      { seat: 3, name: "Bot 2", count: 16, melds: [], flowers: [], discards: [] },
    ],
    availableActions: [],
    result: null,
    isHost: false,
  };
}

function stubSocket(overrides: Record<string, unknown> = {}) {
  return {
    rooms: [],
    room: { code: "ABCD", seat: 1, isHost: false, options: {} },
    error: "",
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    quickMatch: vi.fn(),
    spectate: vi.fn(),
    startEarly: vi.fn(),
    lockRoom: vi.fn(),
    leaveRoom: vi.fn(),
    send: vi.fn(),
    restart: vi.fn(),
    needsRefresh: false,
    gameState: tableView(),
    ...overrides,
  };
}

describe("Mahjong board", () => {
  it("calls leaveRoom when the Leave control is pressed", () => {
    const leaveRoom = vi.fn();
    socket.value = stubSocket({ leaveRoom });
    render(<Mahjong />);

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(leaveRoom).toHaveBeenCalledTimes(1);
  });

  it("renders no opponent concealed tiles; only the local seat has hand tiles", () => {
    socket.value = stubSocket();
    const { container } = render(<Mahjong />);

    // The only interactive concealed tiles are the local seat's hand.
    const handTiles = container.querySelectorAll('section[aria-label="Your hand"] .mj-tile-btn');
    expect(handTiles).toHaveLength(3);
    // No opponent area ever renders a concealed hand tile.
    expect(container.querySelectorAll(".mj-opponent .mj-tile-btn")).toHaveLength(0);
    // Opponents expose a tile count instead of the tiles themselves.
    expect(screen.getByLabelText("Opponent Alice").textContent).toContain("16 tiles");
  });
});
