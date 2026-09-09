import { TileFace } from "../TileFace.tsx";
import type { VisibleCopiesEntry } from "./visibleCopies.ts";

export interface VisibleCopiesPanelProps {
  entries: VisibleCopiesEntry[];
}

export function VisibleCopiesPanel({ entries }: VisibleCopiesPanelProps) {
  return (
    <section className="mj-panel" aria-label="Visible copies">
      <p className="mj-panel-title">Visible copies</p>
      {entries.length === 0 ? (
        <p className="mj-muted">No tiles seen yet</p>
      ) : (
        <ul className="mj-copies">
          {entries.map((entry) => (
            <li key={entry.kind} className="mj-copies-row">
              <TileFace tile={entry.tile} size="xs" decorative />
              <span className="mj-copies-label">{entry.label}</span>
              <span className="mj-copies-count">
                <strong>{entry.seen}</strong> seen · {entry.remaining} left
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
