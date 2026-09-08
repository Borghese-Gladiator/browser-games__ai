export interface NamePlateProps {
  wind: string;
  windName: string;
  name: string;
  isBot: boolean;
  isDealer: boolean;
  isTurn: boolean;
  score?: number;
}

export function NamePlate({
  wind,
  windName,
  name,
  isBot,
  isDealer,
  isTurn,
  score,
}: NamePlateProps) {
  return (
    <div className={`mj-plate${isTurn ? " mj-plate--turn" : ""}`}>
      <span className="mj-plate-wind" title={windName} aria-label={windName}>
        {wind}
      </span>
      <span className="mj-plate-name">{name}</span>
      <span className="mj-plate-badges">
        {isDealer && <span className="mj-badge mj-badge--dealer">Dealer</span>}
        {isBot && <span className="mj-badge mj-badge--bot">Bot</span>}
      </span>
      {score !== undefined && <span className="mj-plate-score">{score}</span>}
    </div>
  );
}
