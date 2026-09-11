import type { ConnectionStatus } from './useGameSocket.types.ts';

// Driven by useGameSocket's connectionStatus. Hidden when connected;
// role="alert" so assistive tech announces drops/reconnects.
export function ConnectionBanner({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  if (connectionStatus === 'connected') return null;
  const msg =
    connectionStatus === 'reconnecting'
      ? 'Connection lost — reconnecting…'
      : 'Unable to reconnect. Please refresh.';
  return (
    <div role="alert" className="connection-banner" data-status={connectionStatus}>
      {msg}
    </div>
  );
}
