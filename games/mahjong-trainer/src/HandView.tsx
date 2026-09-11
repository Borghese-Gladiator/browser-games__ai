import type { Tile } from "@browser-games/engine-mahjong";
import { TileFace } from "@portal/shared/tiles";
import { tileLabel, tileToId } from "./tiles.ts";

export function HandView({
  hand,
  onDiscard,
  disabled,
}: {
  hand: readonly Tile[];
  onDiscard: (tile: Tile) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <section className="dt-hand-section" aria-label="Your hand">
      <p className="dt-label">Choose a tile to discard</p>
      <ul className="dt-hand">
        {hand.map((tile) => (
          <li key={tile.id}>
            <button
              type="button"
              className="dt-tile-btn"
              aria-label={disabled ? tileLabel(tile) : `Discard ${tileLabel(tile)}`}
              disabled={disabled}
              onClick={() => onDiscard(tile)}
            >
              <TileFace tile={tileToId(tile)} size="lg" decorative />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
