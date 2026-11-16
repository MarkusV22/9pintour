import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Erwartet CSV mit Spalten (Reihenfolge egal, Header-Zeile erforderlich):
 * vorname, nachname, kategorie, verein, nummer
 * Alternativ: first_name, last_name, category, club, number
 */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV leer oder keine Daten');

  const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const colMap = {
    first_name: ['vorname', 'first_name', 'firstname', 'vname'],
    last_name:  ['nachname', 'last_name', 'lastname', 'nname', 'name'],
    category:   ['kategorie', 'category', 'kat', 'geschlecht', 'gender'],
    club:       ['verein', 'club', 'klub'],
    number:     ['nummer', 'number', 'nr', 'no'],
  };

  const idx = {};
  Object.entries(colMap).forEach(([field, aliases]) => {
    const found = headers.findIndex(h => aliases.includes(h));
    if (found !== -1) idx[field] = found;
  });

  if (idx.first_name === undefined && idx.last_name === undefined) {
    throw new Error('Spalten "Vorname" und "Nachname" (oder "first_name"/"last_name") nicht gefunden.');
  }

  const normalizeCategory = (v = '') => {
    const lower = v.toLowerCase().trim();
    if (lower.includes('dam') || lower === 'w' || lower === 'f' || lower === 'female') return 'Damen';
    return 'Herren';
  };

  return lines.slice(1).map(line => {
    const cols = line.split(/[;,]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const first_name = idx.first_name !== undefined ? cols[idx.first_name] || '' : '';
    const last_name  = idx.last_name  !== undefined ? cols[idx.last_name]  || '' : '';
    if (!first_name && !last_name) return null;
    return {
      first_name,
      last_name,
      name: `${first_name} ${last_name}`.trim(),
      category: normalizeCategory(idx.category !== undefined ? cols[idx.category] : ''),
      club:     idx.club   !== undefined ? cols[idx.club]   || '' : '',
      number:   idx.number !== undefined ? (cols[idx.number] ? Number(cols[idx.number]) : null) : null,
    };
  }).filter(Boolean);
}

export default function CsvImportDialog({ open, onOpenChange, onImported }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const reset = () => { setPreview(null); setError(''); setDone(false); setProgress(0); setSkippedCount(0); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target.result);
        setPreview(rows);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    setProgress(0);

    // Load existing players to check for duplicates
    const existing = await base44.entities.Player.list('created_date', 99999);
    const existingNames = new Set(
      existing.map(p => {
        const name = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
        return `${name.toLowerCase()}__${(p.category || '').toLowerCase()}`;
      })
    );

    const newPlayers = preview.filter(p => {
      const key = `${p.name.toLowerCase()}__${(p.category || '').toLowerCase()}`;
      return !existingNames.has(key);
    });

    const skipped = preview.length - newPlayers.length;

    const BATCH_SIZE = 100;
    const total = newPlayers.length;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = newPlayers.slice(i, i + BATCH_SIZE);
      await base44.entities.Player.bulkCreate(batch);
      setProgress(Math.min(i + BATCH_SIZE, total));
    }
    setImporting(false);
    
    // Auto-assign numbers to players without numbers (Herren ab 1001, Damen ab 2001)
    try {
      await base44.functions.invoke('renumberAllPlayers', {});
    } catch (err) {
      console.error('Error auto-assigning numbers:', err);
    }
    
    setDone(true);
    setSkippedCount(skipped);
    onImported?.();
    setTimeout(() => { onOpenChange(false); reset(); }, 3000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Spieler per CSV importieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format hint */}
          <div className="bg-muted/40 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Erwartetes CSV-Format (Semikolon oder Komma):</p>
            <code className="block bg-background rounded px-2 py-1 font-mono">
              Vorname;Nachname;Kategorie;Verein;Nummer
            </code>
            <p>Kategorie: <strong>Herren</strong> oder <strong>Damen</strong> (oder weiblich/männlich, w/m)</p>
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-muted/20 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">CSV-Datei auswählen oder hierher ziehen</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {preview && !done && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{preview.length} Spieler erkannt:</p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium">{p.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {p.club && <span>{p.club}</span>}
                      <span className={p.category === 'Damen' ? 'text-pink-600' : 'text-blue-600'}>{p.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importing && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Importiere...</span>
                <span>{progress} / {preview?.length ?? 0}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${preview?.length ? (progress / preview.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {preview.length - skippedCount} Spieler importiert
                {skippedCount > 0 && <span className="text-muted-foreground ml-1">· {skippedCount} bereits vorhanden (übersprungen)</span>}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Abbrechen</Button>
          <Button
            onClick={handleImport}
            disabled={!preview?.length || importing || done}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importiere...' : `${preview?.length ?? 0} Spieler importieren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}