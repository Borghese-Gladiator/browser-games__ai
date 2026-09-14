// Shown when the server's protocolVersion no longer matches ours (a deploy
// happened while this client was open). Reuses the disconnected banner styling.
//
// The stylesheet is imported here, not left to the page: mahjong and sheng-ji
// both render this alert without importing chrome.css, which left it as
// unstyled body text exactly when it mattered most.
import "./chrome.css";

export function RefreshBanner({ needsRefresh }: { needsRefresh: boolean }) {
  if (!needsRefresh) return null;
  return (
    <div role="alert" className="connection-banner" data-status="disconnected">
      Server updated — please refresh to continue.
    </div>
  );
}
