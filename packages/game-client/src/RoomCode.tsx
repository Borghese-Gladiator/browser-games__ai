import { useState } from 'react';

// Shows the room code with one-click copy.
export function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <p className="room-code">
      Room: <strong>{code}</strong>{' '}
      <button className="btn btn-sm" type="button" onClick={copy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </p>
  );
}
