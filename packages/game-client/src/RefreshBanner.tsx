// Shown when the server's protocolVersion no longer matches ours (a deploy
// happened while this client was open). Reuses the disconnected banner styling.
export function RefreshBanner({ needsRefresh }: { needsRefresh: boolean }) {
  if (!needsRefresh) return null;
  return (
    <div role="alert" className="connection-banner" data-status="disconnected">
      Server updated — please refresh to continue.
    </div>
  );
}
