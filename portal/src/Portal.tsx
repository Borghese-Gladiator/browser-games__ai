import { games, groups } from "@portal/shared/registry";
import type { GameMeta } from "@portal/shared/registry";
import { TileFace } from "@portal/shared/tiles";

function GameCard({ game }: { game: GameMeta }) {
  return (
    <a className="game-card" href={game.path} data-game={game.id}>
      <span className="game-art" aria-hidden="true">
        {game.tile ? (
          <TileFace tile={game.tile} size="lg" decorative />
        ) : (
          <span className="game-emoji">{game.emoji}</span>
        )}
      </span>
      <span className="game-body">
        <span className="game-title">{game.title}</span>
        <span className="game-description">{game.description}</span>
      </span>
      <span className="game-foot">
        <span className={`game-tag game-tag--${game.multiplayer ? "online" : "solo"}`}>
          {game.multiplayer ? "Online" : "Solo"}
        </span>
        <span className="game-go" aria-hidden="true">
          Play →
        </span>
      </span>
    </a>
  );
}

export function Portal() {
  const enabled = games.filter((g) => g.enabled !== false);
  const sections = groups
    .map((group) => ({ group, items: enabled.filter((g) => g.group === group.id) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="portal-page">
      <header className="portal-masthead">
        <p className="eyebrow">A small parlor of browser games</p>
        <h1 className="portal-title">
          <span className="portal-title-cjk">遊戲館</span>
          <span>Browser Games</span>
        </h1>
        <p className="portal-subtitle">
          Everything runs in the tab. Multiplayer tables fill with bots so a game
          never waits for a fourth.
        </p>
      </header>

      <main className="portal">
        {sections.map(({ group, items }) => (
          <section className="portal-group" key={group.id} aria-labelledby={`group-${group.id}`}>
            <div className="group-head">
              <h2 className="group-title" id={`group-${group.id}`}>
                {group.title}
              </h2>
              <span className="group-rule" aria-hidden="true" />
              <span className="group-count">{items.length}</span>
            </div>
            <p className="group-blurb">{group.blurb}</p>
            <ul className="game-grid">
              {items.map((game) => (
                <li key={game.id}>
                  <GameCard game={game} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
