// Export/import affordance for the player code. Export shows the current code
// (which carries the secret reconnectToken) with a copy button; import accepts a
// pasted code and reloads so the new identity takes effect on the next socket
// connection.
import { useState } from 'react';

interface PlayerCodeModalProps {
  playerCode: string;
  onImport: (code: string) => boolean;
  onClose: () => void;
}

export function PlayerCodeModal({ playerCode, onImport, onClose }: PlayerCodeModalProps) {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [importErr, setImportErr] = useState('');

  const copy = () => {
    navigator.clipboard.writeText(playerCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doImport = () => {
    if (onImport(input.trim())) {
      window.location.reload();
    } else {
      setImportErr('Invalid player code.');
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="player-code-modal">
      <h2>Your Player Code</h2>
      <p>Copy this code to carry your identity to another browser or device.</p>
      <pre className="player-code-text">{playerCode}</pre>
      <button className="btn" onClick={copy}>
        {copied ? 'Copied!' : 'Copy code'}
      </button>
      <hr />
      <p>Paste a code here to import an identity:</p>
      <input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setImportErr('');
        }}
        placeholder="Paste player code"
        aria-label="Import player code"
      />
      <button className="btn" onClick={doImport} disabled={!input.trim()}>
        Import
      </button>
      {importErr && (
        <p role="alert" className="lobby-error">
          {importErr}
        </p>
      )}
      <button className="btn" onClick={onClose} style={{ marginLeft: '0.5rem' }}>
        Close
      </button>
    </div>
  );
}
