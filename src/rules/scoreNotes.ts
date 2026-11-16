// Score-Notizen (JSON in scores.notes): Bahndaten, W.O., No-Show
// Format: Array je Bahn [{voll, abraeumen, fehlwurf?}] oder Gesamt {gesamt:true, voll, abraeumen, fehlwurf}
// oder Markierung {wo:true} / {no_show:true}.

export interface ScoreRow {
  id?: string;
  tournament_id?: string;
  player_id: string | null;
  team_id?: string | null;
  schedule_id?: string | null;
  score: number | null;
  notes: string | null;
  category?: string | null;
  grp?: string | null; // Finalturnier-Gruppe ("A", "B", "KO-…")
}

function parse(notes: string | null | undefined): unknown {
  try { return JSON.parse(notes || ""); } catch { return undefined; }
}
const int = (v: unknown) => parseInt(String(v ?? ""), 10) || 0;
const filled = (v: unknown) => String(v ?? "").trim() !== "";

export function isWalkover(notes: string | null | undefined): boolean {
  return (parse(notes) as { wo?: unknown } | undefined)?.wo === true;
}
export function isNoShow(notes: string | null | undefined): boolean {
  return (parse(notes) as { no_show?: unknown } | undefined)?.no_show === true;
}

/** Abräumen + Fehlwurf (Summe über Bahnen oder Gesamtangabe) */
export function lanes(notes: string | null | undefined): { voll: number; abraeumen: number; fehlwurf: number } {
  const p = parse(notes) as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (Array.isArray(p)) {
    return {
      voll: p.reduce((s, b) => s + int(b?.voll), 0),
      abraeumen: p.reduce((s, b) => s + int(b?.abraeumen), 0),
      fehlwurf: p.reduce((s, b) => s + int(b?.fehlwurf), 0),
    };
  }
  if (p && typeof p === "object" && (p as { gesamt?: unknown }).gesamt === true) {
    return { voll: int(p.voll), abraeumen: int(p.abraeumen), fehlwurf: int(p.fehlwurf) };
  }
  return { voll: 0, abraeumen: 0, fehlwurf: 0 };
}

/** Leerer Datensatz (kein Ergebnis eingetragen) – zählt wie keine Teilnahme. W.O./No-Show sind echte Datensätze. */
export function isEmptyScore(s: Pick<ScoreRow, "score" | "notes"> | null | undefined): boolean {
  if (!s) return true;
  if (s.score != null && s.score !== 0) return false;
  const p = parse(s.notes) as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (p && !Array.isArray(p) && (p.wo === true || p.no_show === true)) return false;
  if (Array.isArray(p)) return p.every((b) => !filled(b?.voll) && !filled(b?.abraeumen));
  if (p && typeof p === "object" && p.gesamt === true) return !filled(p.voll) && !filled(p.abraeumen) && !filled(p.fehlwurf);
  return true;
}
