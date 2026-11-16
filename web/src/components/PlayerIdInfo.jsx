import { useState } from 'react';

export default function PlayerIdInfo({ playerId }) {
  const [copied, setCopied] = useState(false);
  if (!playerId) return null;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(playerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-[9px] font-mono font-semibold px-1 py-0.5 rounded border flex-shrink-0 cursor-pointer transition-colors ${
        copied
          ? 'bg-green-100 text-green-700 border-green-300'
          : 'bg-muted/40 text-muted-foreground/50 border-border hover:bg-muted hover:text-foreground'
      }`}
      title="Klicken zum Kopieren der Spieler-ID"
    >
      {copied ? '✓' : 'ID'}
    </button>
  );
}