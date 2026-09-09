import { useState } from "react";
import type { TaiEstimate } from "@browser-games/engine-mahjong-analysis";
import { FanPatternGuide } from "./FanPatternGuide.tsx";

export interface TaiIndicatorProps {
  estimate: TaiEstimate;
}

// The pill reads its two numbers straight from the estimate the board computes
// once per render. It never recomputes tai. Activating it opens the fan and
// pattern guide.
export function TaiIndicator({ estimate }: TaiIndicatorProps) {
  const [open, setOpen] = useState(false);
  const guaranteed = estimate.totals.guaranteed;
  const potential = estimate.totals.potential;
  const label = `Fan and pattern guide: ${guaranteed} tai guaranteed, up to ${potential} tai. Open the guide.`;

  return (
    <section className="mj-panel mj-tai" aria-label="Tai">
      <p className="mj-panel-title">Tai</p>
      <button
        type="button"
        className="mj-tai-pill"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <span className="mj-tai-pill-guaranteed">{guaranteed} guaranteed</span>
        <span className="mj-tai-pill-sep" aria-hidden="true">
          ·
        </span>
        <span className="mj-tai-pill-potential">up to {potential} tai</span>
      </button>
      {open && (
        <FanPatternGuide estimate={estimate} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
