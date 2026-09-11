// Host control: close the room to new joiners, or reopen it. One button whose
// label and aria-pressed follow the room's actual lock state, which arrives on
// the state frame — boards previously hardcoded lockRoom(true), so a host could
// lock once and had no way to tell it had happened.

export interface LockRoomButtonProps {
  locked?: boolean;
  onToggle: (locked: boolean) => void;
}

export function LockRoomButton({ locked, onToggle }: LockRoomButtonProps) {
  const isLocked = !!locked;
  return (
    <button
      className="btn"
      type="button"
      aria-pressed={isLocked}
      onClick={() => onToggle(!isLocked)}
    >
      {isLocked ? 'Unlock room' : 'Lock room'}
    </button>
  );
}
