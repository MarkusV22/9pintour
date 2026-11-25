// Berechtigungen (1:1 aus Base44 src/lib/roles.js)
// admin → alles · turnier_admin → Turniere, Startpläne, Ergebnisse, Spielerdatenbank
// Veranstalter eines Turniers (Ersteller oder Mitveranstalter) → dieses Turnier bearbeiten

export interface RoleUser { id: string; email: string; role: string; base44_id?: string | null }
export interface OrganizedTournament { created_by?: string | null; co_organizer_emails?: string | string[] | null }

export const isAdmin = (u: RoleUser | null | undefined) => u?.role === "admin";
export const isTurnierAdmin = (u: RoleUser | null | undefined) => u?.role === "admin" || u?.role === "turnier_admin";

export function coOrganizerEmails(t: OrganizedTournament | null | undefined): string[] {
  const v = t?.co_organizer_emails;
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(String); } catch { /* ignorieren */ }
  }
  return [];
}

export function isTournamentOrganizer(u: RoleUser | null | undefined, t: OrganizedTournament | null | undefined): boolean {
  if (!u || !t) return false;
  if (isTurnierAdmin(u)) return true;
  if (t.created_by && (t.created_by === u.id || t.created_by === u.base44_id)) return true;
  const mail = u.email.toLowerCase();
  return coOrganizerEmails(t).some((e) => e.toLowerCase() === mail);
}

/**
 * Geschützte Mitveranstalter: der erste Eintrag (vom Admin bei der Freigabe bestimmt) und der Ersteller des Turniers
 * (falls er in der Liste steht). Nur Admin/Turnier-Admin dürfen sie entfernen.
 */
export function protectedCoOrganizers(list: string[], creatorEmail?: string | null): string[] {
  const out: string[] = [];
  if (list[0]) out.push(list[0].trim().toLowerCase());
  const c = creatorEmail?.trim().toLowerCase();
  if (c && list.some((e) => e.trim().toLowerCase() === c) && !out.includes(c)) out.push(c);
  return out;
}

/** Fehlertext, wenn eine Änderung der Mitveranstalter-Liste geschützte Personen entfernt oder den ersten verdrängt – sonst null */
export function coOrganizerChangeError(before: string[], after: string[], creatorEmail?: string | null): string | null {
  const prot = protectedCoOrganizers(before, creatorEmail);
  const next = after.map((e) => String(e).trim().toLowerCase());
  if (prot.some((p) => !next.includes(p))) return "Der Hauptveranstalter und der erste Mitveranstalter können nur vom Admin entfernt werden.";
  if (prot[0] && next[0] !== prot[0]) return "Der erste Mitveranstalter muss an erster Stelle bleiben.";
  return null;
}
