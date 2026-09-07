import { games } from "@portal/shared/registry";

export function Portal() {
  return (
    <main className="portal">
      <header className="portal-header">
        <h1>Browser Games</h1>
        <p className="portal-subtitle">Pick a game to play.</p>
      </header>
      <ul className="game-grid">
        {games.filter((g) => g.enabled !== false).map((game) => (
          <li key={game.id}>
            <a className="game-card" href={game.path}>
              <span className="game-emoji" aria-hidden="true">
                {game.emoji}
              </span>
              <span className="game-title">{game.title}</span>
              <span className="game-description">{game.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
