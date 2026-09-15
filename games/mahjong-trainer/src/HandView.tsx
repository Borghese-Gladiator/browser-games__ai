import { useMemo } from "react";
import type { Tile } from "@browser-games/engine-mahjong";
import { TileFace, tileKind, sortTiles } from "@portal/shared/tiles";
import { tileLabel, tileToId } from "./tiles.ts";

// Show the hand the way a player holds it: suits together, ranks ascending.
// sortTiles orders board tile ids; this walks that order and takes one tile per
// id from a bucket, so duplicate tiles keep their own identity.
function sortHand(hand: readonly Tile[]): Tile[] {
  const buckets = new Map<string, Tile[]>();
  for (const tile of hand) {
    const id = tileToId(tile);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(tile);
    else buckets.set(id, [tile]);
  }
  return sortTiles(hand.map(tileToId)).map((id) => buckets.get(id)!.shift()!);
}

export function HandView({
  hand,
  onDiscard,
  disabled,
}: {
  hand: readonly Tile[];
  onDiscard: (tile: Tile) => void;
  disabled: boolean;
}): JSX.Element {
  const sorted = useMemo(() => sortHand(hand), [hand]);

  return (
    <section className="dt-hand-section mj-felt-surface" aria-label="Your hand">
      <div className="dt-hand-head">
        <p className="eyebrow">Your hand · {hand.length} tiles</p>
        <p className="dt-hand-hint">{disabled ? "Locked in" : "Tap a tile to discard it"}</p>
      </div>
      <ul className="dt-hand">
        {sorted.map((tile) => {
          const id = tileToId(tile);
          return (
            <li key={tile.id}>
              <button
                type="button"
                className="dt-tile-btn"
                data-tile={id}
                aria-label={disabled ? tileLabel(tile) : `Discard ${tileLabel(tile)}`}
                disabled={disabled}
                onClick={() => onDiscard(tile)}
              >
                <TileFace tile={id} size="lg" decorative />
                <span className="dt-tile-kind" aria-hidden="true">
                  {tileKind(id)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
