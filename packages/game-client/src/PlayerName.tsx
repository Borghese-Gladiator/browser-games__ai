import { useState } from 'react';
import { useIdentity } from './useIdentity.ts';
import { PlayerCodeModal } from './PlayerCodeModal.tsx';

// In-game identity chip: colored avatar + optional display name + the
// export/import player-code affordance.
export function PlayerName({ name }: { name?: string }) {
  const { color, playerCode, importIdentity } = useIdentity();
  const [showCode, setShowCode] = useState(false);
  return (
    <span className="player-name-chip">
      <span className="lobby-avatar" style={{ background: color }} aria-hidden="true" />
      {name && <span>{name}</span>}
      <button className="btn btn-sm" type="button" onClick={() => setShowCode(true)}>
        Player code
      </button>
      {showCode && (
        <PlayerCodeModal
          playerCode={playerCode}
          onImport={importIdentity}
          onClose={() => setShowCode(false)}
        />
      )}
    </span>
  );
}
