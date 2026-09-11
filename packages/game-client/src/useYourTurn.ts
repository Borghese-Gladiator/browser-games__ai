import { useEffect, useRef } from 'react';
import { isYourTurn } from './yourTurn.ts';
import type { GameState } from './protocol.ts';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// Generic "your turn" notifier: beeps and blinks the tab title when the active
// seat becomes the local player's. Stops as soon as the turn moves on.
export function useYourTurn(gameState: GameState | null | undefined, mySeat: number | null | undefined): void {
  const prevActiveSeat = useRef<number | null | undefined>(null);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const originalTitle = useRef(document.title);

  useEffect(() => {
    const next = gameState?.activeSeat;
    if (isYourTurn(prevActiveSeat.current, next, mySeat)) {
      try {
        const Ctor = window.AudioContext ?? window.webkitAudioContext;
        if (!Ctor) throw new Error('Web Audio unavailable');
        const ctx = new Ctor();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 440;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        /* Web Audio unavailable — skip the beep */
      }
      clearInterval(blinkTimer.current);
      let on = false;
      blinkTimer.current = setInterval(() => {
        document.title = on ? originalTitle.current : '⚡ Your turn!';
        on = !on;
      }, 600);
    } else {
      clearInterval(blinkTimer.current);
      document.title = originalTitle.current;
    }
    prevActiveSeat.current = next;
    return () => clearInterval(blinkTimer.current);
  }, [gameState?.activeSeat, mySeat]);
}
