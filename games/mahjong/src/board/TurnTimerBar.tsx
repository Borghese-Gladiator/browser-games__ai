import { useEffect, useRef, useState } from "react";

export interface TurnTimerBarProps {
  remainingMs: number;
  totalMs: number;
}

// A soft turn clock driven only by the availableActions signature. It restarts
// whenever the actions change (a new decision) and counts down a fixed window.
// It reflects no server timer; it just paces the local turn.
export function useTurnClock(active: boolean, resetKey: string, totalMs = 20000): number {
  const [remaining, setRemaining] = useState(totalMs);
  const startRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setRemaining(totalMs);
      return;
    }
    startRef.current = Date.now();
    setRemaining(totalMs);
    const id = setInterval(() => {
      const left = Math.max(0, totalMs - (Date.now() - startRef.current));
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [active, resetKey, totalMs]);

  return remaining;
}

export function TurnTimerBar({ remainingMs, totalMs }: TurnTimerBarProps) {
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <div
      className="mj-timer"
      role="progressbar"
      aria-label="Turn timer"
      aria-valuemin={0}
      aria-valuemax={Math.round(totalMs / 1000)}
      aria-valuenow={seconds}
    >
      <div className="mj-timer-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
