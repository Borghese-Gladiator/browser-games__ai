// Hand-maintained registry of games shown on the portal. This is the single
// source of truth: the portal grid, the Vite multi-page `input` map, and the
// gateway's game routing all derive from it.
//
// To add a game:
//   1. Create games/<id>/ (index.html + src/).
//   2. Add an entry here. That's it for the portal and the Vite build.
//   3. For a multiplayer game, also register an adapter in
//      packages/game-core/src/games.js so the gateway can host it.
export interface GameMeta {
  id: string;
  title: string;
  description: string;
  emoji: string;
  path: string;
  multiplayer: boolean;
  enabled: boolean;
}

// Non-game top-level pages (e.g. the post-game review). Like `games`, this is the
// single source of truth: the Vite multi-page `input` map and the gateway's
// static fallback both derive from it. A `dynamic` page serves its one built
// entry for every sub-path (/history/ and /history/:gameId), so the client reads
// the sub-path itself.
export interface PageMeta {
  id: string;
  title: string;
  path: string;
  entry: string;
  dynamic: boolean;
}

export const pages: PageMeta[] = [
  {
    id: "history",
    title: "Game Review",
    path: "/history/",
    entry: "history/index.html",
    dynamic: true,
  },
];

export const games: GameMeta[] = [
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "Two-player X and O on a 3×3 grid. First to three in a row wins.",
    emoji: "⭕",
    path: "/games/tic-tac-toe/",
    multiplayer: false,
    // enabled: false hides the game on the portal and prevents new room creation
    enabled: true,
  },
  {
    id: "fps",
    title: "DOOM-style FPS",
    description: "Single-player 3D shooter. Survive waves of demons. WASD to move, click to fire.",
    emoji: "🔫",
    path: "/games/fps/",
    multiplayer: false,
    enabled: true,
  },
  {
    id: "poker",
    title: "Texas Hold'em",
    description: "4-player online poker. Create a room and share the code.",
    emoji: "🃏",
    path: "/games/poker/",
    multiplayer: true,
    enabled: true,
  },
  {
    id: "sheng-ji",
    title: "Sheng Ji (升级)",
    description: "4-player online trick-taking card game. Create a room and share the code.",
    emoji: "🀄",
    path: "/games/sheng-ji/",
    multiplayer: true,
    enabled: true,
  },
  {
    id: "president",
    title: "President",
    description: "2–4 player shedding card game. Play or pass to beat the trick; first to empty their hand is President.",
    emoji: "👑",
    path: "/games/president/",
    multiplayer: true,
    enabled: true,
  },
  {
    id: "reversi",
    title: "Reversi",
    description: "2-player strategy. Flip your opponent's pieces to claim the board. Most pieces wins.",
    emoji: "⚫",
    path: "/games/reversi/",
    multiplayer: true,
    enabled: true,
  },
  {
    id: "mahjong",
    title: "Mahjong (台灣麻將)",
    description: "4-player Taiwanese 16-tile mahjong. Draw, discard, and claim to win. Create a room and share the code.",
    emoji: "🀄",
    path: "/games/mahjong/",
    multiplayer: true,
    enabled: true,
  },
  {
    id: "mahjong-trainer",
    title: "Discard Trainer",
    description: "Single-player mahjong drill. Pick a discard, then compare your choice against the ranked analysis.",
    emoji: "🎯",
    path: "/games/mahjong-trainer/",
    multiplayer: false,
    enabled: true,
  },
];
