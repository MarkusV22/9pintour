// Liest die Mitveranstalter-E-Mails als Array. Verträgt sowohl das neue
// Array-Feld als auch alte JSON-String-Werte (robust während der Umstellung).
export function getCoOrganizerEmails(tournament) {
  const val = tournament?.co_organizer_emails;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.length > 0) {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p)) return p;
    } catch {}
  }
  return [];
}