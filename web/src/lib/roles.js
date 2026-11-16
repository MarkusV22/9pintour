// Zentrale Rollenlogik
// admin       → alles
// turnier_admin → Turniere, Startpläne, Ergebnisse, Spielerdatenbank verwalten
// user        → eigenes Profil + sich selbst/andere in Startpläne einplanen

export const isAdmin = (user) => user?.role === 'admin';
export const isTurnierAdmin = (user) => user?.role === 'admin' || user?.role === 'turnier_admin';
export const isUser = (user) => !!user; // jeder eingeloggte Nutzer

// Turnier-spezifische Berechtigung: Admin, Turnier-Admin, Ersteller oder Mitveranstalter
export const isTournamentOrganizer = (user, tournament) => {
  if (!user || !tournament) return false;
  if (isTurnierAdmin(user)) return true;
  if (user.id === tournament.created_by_id) return true;
  try {
    const emails = JSON.parse(tournament.co_organizer_emails || '[]');
    return emails.includes(user.email);
  } catch { return false; }
};