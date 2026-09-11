import { useState, useRef, useCallback } from 'react';
import { reconcile } from './optimistic.ts';

// Apply an action locally for snappy UI, then reconcile against authoritative
// server state when it arrives (rolling back if the server rejected the action).
export function useOptimistic<S, A>(
  serverState: S,
  reduce: (state: S, action: A) => S,
): [S, (action: A, sendFn: () => void) => void] {
  const [localState, setLocalState] = useState<S | null>(null);
  const pending = useRef<A | null>(null);
  const prevServer = useRef<S | null>(null);

  if (serverState !== prevServer.current) {
    prevServer.current = serverState;
    if (pending.current) {
      reconcile(serverState, pending.current, localState);
      setLocalState(null);
      pending.current = null;
    }
  }

  const apply = useCallback(
    (action: A, sendFn: () => void) => {
      pending.current = action;
      setLocalState((prev) => reduce(prev ?? serverState, action));
      sendFn();
    },
    [serverState, reduce],
  );

  return [localState ?? serverState, apply];
}
