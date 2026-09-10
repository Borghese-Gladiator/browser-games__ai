import { useEffect, useRef, useState } from "react";
import type {
  EstimatedPattern,
  TaiEstimate,
  Tier,
} from "@browser-games/engine-mahjong-analysis";

export interface FanPatternGuideProps {
  estimate: TaiEstimate;
  onClose: () => void;
}

interface TierMeta {
  key: Tier;
  label: string;
  accent: string;
  description: string;
}

const TIER_ORDER: Tier[] = ["guaranteed", "on-track", "potential"];

const TIER_META: Record<Tier, TierMeta> = {
  guaranteed: {
    key: "guaranteed",
    label: "Guaranteed",
    accent: "guaranteed",
    description: "Locked in for this hand right now.",
  },
  "on-track": {
    key: "on-track",
    label: "On track",
    accent: "on-track",
    description: "Every closest winning hand shares these.",
  },
  potential: {
    key: "potential",
    label: "Potential",
    accent: "potential",
    description: "Still reachable if the hand develops that way.",
  },
};

const INTRO =
  "This guide lists the fans your hand can score. Guaranteed fans are yours now. " +
  "On-track fans appear in every closest winning hand. Potential fans are still " +
  "reachable if the hand develops that way. Each fan shows its tai value and the " +
  "rule that earns it.";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function tierMeta(tier: Tier): TierMeta {
  return TIER_META[tier];
}

function totalForTier(tier: Tier, totals: TaiEstimate["totals"]): number {
  if (tier === "guaranteed") return totals.guaranteed;
  if (tier === "on-track") return totals.onTrack;
  return totals.potential;
}

function filterByTiers(
  patterns: EstimatedPattern[],
  active: ReadonlySet<Tier>,
): EstimatedPattern[] {
  return patterns.filter((pattern) => active.has(pattern.tier));
}

// Move focus into the dialog on open, trap Tab inside it, close on Escape, and
// return focus to the opener on close. The effect runs once for the dialog's
// lifetime; the latest onClose is read through a ref so a parent re-render never
// steals focus back into the dialog.
function useDialogFocus(
  dialogRef: React.RefObject<HTMLElement>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = dialogRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => !el.hasAttribute("disabled"),
      );

    (focusable()[0] ?? node)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        node?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [dialogRef]);
}

function TierBadge({ tier }: { tier: Tier }) {
  const meta = tierMeta(tier);
  return (
    <span className={`mj-badge mj-tier-badge mj-tier-badge--${meta.accent}`}>
      {meta.label}
    </span>
  );
}

export function FanPatternGuide({ estimate, onClose }: FanPatternGuideProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

  // The potential list is the cumulative superset: it holds every fan, each
  // tagged with its own tier. Rendering from it keeps the tiers nested, not
  // disjoint.
  const patterns = estimate.potential;
  const [active, setActive] = useState<ReadonlySet<Tier>>(
    () => new Set(TIER_ORDER),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    patterns[0]?.id ?? null,
  );

  const visible = filterByTiers(patterns, active);
  const selected =
    visible.find((pattern) => pattern.id === selectedId) ?? visible[0] ?? null;

  const toggleTier = (tier: Tier) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  };

  return (
    <div className="mj-guide-backdrop">
      <div
        className="mj-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mj-guide-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="mj-guide-header">
          <h2 id="mj-guide-title" className="mj-guide-title">
            Fan and pattern guide
          </h2>
        </div>
        <p className="mj-guide-intro">{INTRO}</p>

        <div className="mj-guide-summaries">
          {TIER_ORDER.map((tier) => {
            const meta = tierMeta(tier);
            return (
              <div
                key={tier}
                className={`mj-guide-summary mj-guide-summary--${meta.accent}`}
              >
                <span className="mj-guide-summary-label">
                  {meta.label.toUpperCase()}
                </span>
                <span className="mj-guide-summary-total">
                  <span className="mj-guide-summary-value">
                    {totalForTier(tier, estimate.totals)}
                  </span>
                  <span className="mj-guide-summary-unit">tai</span>
                </span>
                <span className="mj-guide-summary-desc">{meta.description}</span>
              </div>
            );
          })}
        </div>

        <div className="mj-guide-filters" role="group" aria-label="Filter tiers">
          {TIER_ORDER.map((tier) => {
            const meta = tierMeta(tier);
            const on = active.has(tier);
            return (
              <button
                key={tier}
                type="button"
                className={`mj-guide-chip mj-guide-chip--${meta.accent}${
                  on ? " mj-guide-chip--on" : ""
                }`}
                aria-pressed={on}
                onClick={() => toggleTier(tier)}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="mj-guide-body">
          <ul className="mj-guide-list" aria-label="Patterns">
            {visible.length === 0 ? (
              <li className="mj-guide-empty mj-muted">
                No fans match the selected filters.
              </li>
            ) : (
              visible.map((pattern) => {
                const meta = tierMeta(pattern.tier);
                const isSelected = selected?.id === pattern.id;
                return (
                  <li key={pattern.id}>
                    <button
                      type="button"
                      className={`mj-guide-card mj-guide-card--${meta.accent}${
                        isSelected ? " mj-guide-card--selected" : ""
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(pattern.id)}
                    >
                      <span className="mj-guide-card-head">
                        <span className="mj-guide-en">{pattern.english}</span>
                        <span className="mj-guide-zh" lang="zh">
                          {pattern.chinese}
                        </span>
                        <span className="mj-guide-tai">{pattern.tai} tai</span>
                      </span>
                      <span className="mj-guide-rule">{pattern.rule}</span>
                      <TierBadge tier={pattern.tier} />
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="mj-guide-detail" aria-label="Pattern detail">
            {selected ? (
              <>
                <div className="mj-guide-detail-head">
                  <h3 className="mj-guide-detail-title">
                    {selected.english}{" "}
                    <span className="mj-guide-zh" lang="zh">
                      {selected.chinese}
                    </span>
                  </h3>
                  <span className="mj-guide-detail-tai">{selected.tai} tai</span>
                </div>
                <TierBadge tier={selected.tier} />
                <p className="mj-guide-detail-rule">{selected.rule}</p>
                <p className="mj-guide-detail-desc mj-muted">
                  {tierMeta(selected.tier).description}
                </p>
              </>
            ) : (
              <p className="mj-muted">Select a fan to see its rule.</p>
            )}
          </div>
        </div>

        <div className="mj-guide-footer">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
