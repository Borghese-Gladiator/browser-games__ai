// Boots the single game gateway that hosts every multiplayer game. Replaces the
// former per-game servers (poker-server, sheng-ji-server).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway } from '@browser-games/game-core';

// Serve the built client from the same process only in production (or when an
// explicit STATIC_DIR is given). In dev, Vite serves the client on :5173, so we
// leave staticDir null to avoid this process handing out a stale dist/ build.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.env.STATIC_DIR ?? path.join(repoRoot, 'dist');
const serveStatic = process.env.STATIC_DIR != null || process.env.NODE_ENV === 'production';
const staticDir = serveStatic && fs.existsSync(distDir) ? distDir : null;

const { shutdown } = createGateway({
  port: process.env.PORT || 3001,
  staticDir,
  outcomesPath: process.env.OUTCOMES_PATH,
  achievementsPath: process.env.ACHIEVEMENTS_PATH,
  snapshotsPath: process.env.SNAPSHOTS_PATH,
});

// On a deploy signal, drain gracefully (snapshot rooms, warn clients) before exit.
function onSignal() {
  shutdown(5_000).then(() => process.exit(0)).catch(() => process.exit(1));
}
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
