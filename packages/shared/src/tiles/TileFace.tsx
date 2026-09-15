import type { TileSize, SeatPosition } from "./parseTile.ts";
import { parseTile, tileLabel } from "./parseTile.ts";
import { tileAssetUrl } from "./tileAsset.ts";

export interface TileFaceProps {
  tile: string;
  faceDown?: boolean;
  size?: TileSize;
  orientation?: SeatPosition;
  highlighted?: boolean;
  ariaLabel?: string;
  className?: string;
  decorative?: boolean;
}

export interface TileBackProps {
  count?: number;
  size?: TileSize;
  orientation?: SeatPosition;
  className?: string;
}

export function TileFace({
  tile,
  faceDown = false,
  size = "md",
  orientation = "bottom",
  highlighted = false,
  ariaLabel,
  className = "",
  decorative = false,
}: TileFaceProps) {
  const base = `mj-tile mj-tile--${size} mj-seat--${orientation}${
    highlighted ? " mj-tile--hl" : ""
  }${className ? ` ${className}` : ""}`;

  if (faceDown) {
    return (
      <span
        className={`${base} mj-tile--back`}
        data-face="down"
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? "img" : undefined}
      >
        <span className="mj-back-art" aria-hidden="true" />
      </span>
    );
  }

  const parsed = parseTile(tile);
  const label = ariaLabel ?? tileLabel(tile);
  return (
    <span
      className={`${base} mj-tile--${parsed.suit}`}
      data-suit={parsed.suit}
      data-tile={tile}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <img
        className="mj-tile-img"
        src={tileAssetUrl(tile)}
        alt=""
        draggable={false}
        loading="lazy"
      />
    </span>
  );
}

export function TileBack({
  count = 1,
  size = "sm",
  orientation = "top",
  className = "",
}: TileBackProps) {
  const n = Math.max(0, count);
  const shown = Math.min(n, 17);
  const stacked = orientation === "left" || orientation === "right";
  return (
    <div
      className={`mj-backs mj-backs--${orientation}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`${n} concealed tiles`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <TileFace
          key={i}
          tile=""
          faceDown
          size={size}
          orientation={stacked ? orientation : "top"}
          decorative
        />
      ))}
    </div>
  );
}
