import { playerColor } from '@portal/shared/identity';
import type { Presence } from './protocol.ts';

interface PlayerListPlayer {
  seat: number;
  name: string;
}

interface PlayerListProps {
  players?: PlayerListPlayer[];
  presence?: Presence[];
  mySeat?: number;
  activeSeat?: number;
}

// Generic seat roster: deterministic avatar color from name + presence dot
// from heartbeat. Names are unique within a room, so color is stable.
export function PlayerList({ players = [], presence, mySeat, activeSeat }: PlayerListProps) {
  return (
    <ul className="player-list">
      {players.map((p) => {
        const pres = presence?.find((x) => x.seat === p.seat);
        const live = pres ? pres.isBot || pres.latencyMs >= 0 : true;
        const color = playerColor(p.name);
        return (
          <li
            key={p.seat}
            data-seat={p.seat}
            data-you={p.seat === mySeat ? 'true' : undefined}
            aria-current={p.seat === activeSeat ? 'true' : undefined}
            className="player-list-item"
          >
            <span className="player-avatar" style={{ background: color }} aria-hidden="true" />
            <span className={`presence-dot ${live ? 'is-live' : 'is-dark'}`} aria-hidden="true" />
            {p.name}
            {pres?.isBot ? ' 🤖' : ''}
            {p.seat === mySeat ? ' (you)' : ''}
          </li>
        );
      })}
    </ul>
  );
}
