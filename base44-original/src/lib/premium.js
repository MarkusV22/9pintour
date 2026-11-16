// Prüft, ob der angemeldete Nutzer ein aktives Werbefrei-Abo hat.
export function isPremiumActive(user) {
  if (!user) return false;
  if (user.premium_type === 'lifetime') return true;
  if (user.premium_type === 'yearly' && user.premium_expires_at) {
    return new Date(user.premium_expires_at) > new Date();
  }
  return false;
}

// Formatiert das Ablaufdatum für die Anzeige.
export function formatPremiumExpiry(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return null;
  }
}