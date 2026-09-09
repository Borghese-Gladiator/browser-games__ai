import { GamesList } from "./GamesList.tsx";
import { ReviewPage } from "./ReviewPage.tsx";

// /history/ shows the list of reviewable games; /history/:gameId shows one
// review. The dynamic page is served by the gateway/Vite fallback, so we read
// the game id straight from the path.
function gameIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/history\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function HistoryApp() {
  const gameId = gameIdFromPath(window.location.pathname);
  return gameId ? <ReviewPage gameId={gameId} /> : <GamesList />;
}
