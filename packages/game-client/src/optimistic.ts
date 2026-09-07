// Pure optimistic-action helpers. No React deps so they're unit-testable.

type Reducer<S, A> = (state: S, action: A) => S;

// Apply an action locally before the server confirms it.
export function applyOptimistic<S, A>(serverState: S, action: A, reduce: Reducer<S, A>): S {
  return reduce(serverState, action);
}

// When authoritative server state arrives, trust it: this drops the optimistic
// prediction and rolls back to the server's view if the action was rejected.
export function reconcile<S, A>(serverState: S, _pendingAction: A, _localState: S | null): S {
  return serverState;
}
