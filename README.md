# Browser Games

A small gaming portal: a landing page listing games, each game on its own page.
An npm-workspaces monorepo (Vite + React). Multiplayer games share a single
WebSocket gateway with a built-in lobby; local games (tic-tac-toe, FPS) run
entirely in the browser.

## Quick start

```
npm install
npm run dev        # portal + all games (Vite :5173) + gateway (:3001)
```

Open the printed Vite URL and click a game card.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Everything for local dev (Vite + gateway). |
| `npm run check` | Unit tests (Vitest) — fast, run this to validate a change. |
| `npm run check:all` | Unit + E2E (Playwright boots the stack and plays full games). |
| `npm run build` / `npm run preview` | Production build / preview. |
| `npm run clean:state` | Wipe generated runtime state (snapshots, outcomes, achievements). |

## Layout

```
index.html            Portal entry (root page)
packages/
  shared/             @portal/shared — registry (source of truth) + theme
  game-core/          Gateway, rooms, lobby, matchmaking, persistence
  game-client/        Shared React client (useGameSocket, Lobby)
  engines/            Pure, transport-free game engines (poker, sheng-ji, reversi)
portal/               The landing page (React)
games/                One folder per game (thin UI)
bin/dev-server.js     Boots the single multiplayer gateway
```

## Adding a game

The registry (`packages/shared/src/registry.js`) is the single source of truth —
the portal grid and the Vite build both derive from it, so adding a game is
mostly a registry entry plus (for multiplayer) a pure engine and a small adapter.
See **[docs/adding-a-game.md](docs/adding-a-game.md)** for the full contract.

## More docs

- **[AGENTS.md](AGENTS.md)** — orientation for AI agents and new contributors.
- **[docs/adding-a-game.md](docs/adding-a-game.md)** — engine + adapter contract.
- **[docs/TODO.md](docs/TODO.md)** — known remaining work (verified against code).
- **[docs/history.md](docs/history.md)** — superseded planning notes.
