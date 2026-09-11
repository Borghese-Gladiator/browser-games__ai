export interface HudProps {
  round: number;
  prevailingWind: string;
  handNumber: number;
  tilesLeft: number;
  ruleset: string;
  paused: boolean;
  onPause: () => void;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mj-hud-stat">
      <span className="mj-hud-stat-label">{label}</span>
      <span className="mj-hud-stat-value">{value}</span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="mj-hud-btn"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Hud({
  round,
  prevailingWind,
  handNumber,
  tilesLeft,
  ruleset,
  paused,
  onPause,
  onToggleFullscreen,
  onOpenSettings,
}: HudProps) {
  return (
    <header className="mj-hud" aria-label="Game status">
      <div className="mj-hud-stats">
        <Stat label="Round" value={round} />
        <Stat label="Prevailing" value={prevailingWind} />
        <Stat label="Hand" value={handNumber} />
        <Stat label="Tiles left" value={tilesLeft} />
      </div>
      <div className="mj-hud-right">
        <span className="mj-badge mj-badge--ruleset">{ruleset}</span>
        <div className="mj-hud-controls">
          <IconButton label={paused ? "Resume" : "Pause"} onClick={onPause} pressed={paused}>
            {paused ? (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="mj-icon">
                <path d="M5 3.5v9l7-4.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="mj-icon">
                <rect x="4.5" y="3.5" width="2.5" height="9" />
                <rect x="9" y="3.5" width="2.5" height="9" />
              </svg>
            )}
          </IconButton>
          <IconButton label="Toggle fullscreen" onClick={onToggleFullscreen}>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="mj-icon">
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" strokeWidth="1.6" />
            </svg>
          </IconButton>
          <IconButton label="Settings" onClick={onOpenSettings}>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="mj-icon">
              <circle cx="8" cy="8" r="2.2" fill="none" strokeWidth="1.6" />
              <path
                d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
                strokeWidth="1.4"
              />
            </svg>
          </IconButton>
        </div>
      </div>
    </header>
  );
}
