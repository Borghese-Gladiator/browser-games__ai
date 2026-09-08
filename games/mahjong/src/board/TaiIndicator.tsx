import { TAI_REFERENCE, type TaiState } from "./tai.ts";

export interface TaiIndicatorProps {
  state: TaiState;
}

export function TaiIndicator({ state }: TaiIndicatorProps) {
  const winning = state.tai !== null;
  return (
    <section className="mj-panel mj-tai" aria-label="Tai">
      <div className="mj-tai-head">
        <p className="mj-panel-title">Tai</p>
        <span className={`mj-tai-value${winning ? " mj-tai-value--live" : ""}`}>
          {winning ? state.tai : "—"}
        </span>
      </div>
      {winning ? (
        <ul className="mj-tai-patterns">
          {state.patterns.map((p) => (
            <li key={p} className="mj-badge mj-badge--pattern">
              {p}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mj-muted mj-tai-note">Hand not yet winning. Ruleset values:</p>
          <ul className="mj-tai-ref">
            {TAI_REFERENCE.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <span className="mj-tai-ref-val">{row.tai}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
