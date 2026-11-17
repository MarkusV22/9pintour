// Einmaliger Datenimport (/einrichtung) – nur aktiv, solange das Secret IMPORT_KEY gesetzt ist
import { useState } from "react";
import { CheckCircle2, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Setup() {
  const [key, setKey] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const busy = progress !== null && !result && !error;

  const call = async (path, body) => {
    const res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Import-Key": key.trim() },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
    return data;
  };

  const run = async (e) => {
    e.preventDefault();
    setError(""); setResult(null);
    try {
      await call("/setup/check");
      const lines = (await file.text()).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
      const chunks = [];
      for (let i = 0; i < lines.length; i += 100) chunks.push(lines.slice(i, i + 100));
      for (let i = 0; i < chunks.length; i++) {
        setProgress({ done: i, total: chunks.length });
        await call("/setup/import/chunk", { statements: chunks[i] });
      }
      setProgress({ done: chunks.length, total: chunks.length });
      setResult(await call("/setup/import/finish"));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto"><Database className="w-6 h-6 text-primary" /></div>
          <h1 className="text-2xl font-bold">Datenimport</h1>
          <p className="text-sm text-muted-foreground">Einmalige Übernahme der Base44-Daten</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
                <div>Import abgeschlossen: {result.counts.users} Konten, {result.counts.players} Spieler, {result.counts.tournaments} Turniere, {result.counts.teams} Mannschaften, {result.counts.scores} Ergebnisse, {result.counts.results} Wertungen.</div>
              </div>
              {result.admin_links.map((a) => (
                <div key={a.link} className="space-y-1">
                  <p>Passwort setzen für <b>{a.name}</b> (Admin):</p>
                  <a href={a.link} className="block break-all text-primary hover:underline">{a.link}</a>
                </div>
              ))}
              <p className="text-muted-foreground">Danach das Secret IMPORT_KEY in GitHub löschen und neu veröffentlichen – dann ist diese Seite wieder gesperrt.</p>
            </div>
          ) : (
            <form onSubmit={run} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="key">Import-Schlüssel</Label><Input id="key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="file">Importdatei (.sql)</Label><Input id="file" type="file" accept=".sql,text/plain" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
              {progress && <p className="text-sm text-muted-foreground">Block {progress.done} von {progress.total} …</p>}
              <Button type="submit" className="w-full gap-2" disabled={!key || !file || busy}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? "Importiere …" : "Daten importieren"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
