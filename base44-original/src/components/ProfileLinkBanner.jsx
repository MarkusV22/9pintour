import { Link, useLocation } from 'react-router-dom';
import { Link2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

/**
 * Hinweishinweisbanner: Wird eingeblendet, sobald ein angemeldeter Nutzer
 * noch kein Spielerprofil verknüpft hat. Bleibt sichtbar, bis die Verknüpfung
 * abgeschlossen ist (auf /player-profile wird es ausgeblendet, da dort der
 * Verknüpfungs-Flow selbst läuft).
 */
export default function ProfileLinkBanner({ profile, loading }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || loading || profile || location.pathname === '/player-profile') return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
        <span className="text-sm font-semibold">Dein Profil ist noch nicht verknüpft.</span>
        <span className="text-xs text-amber-800 hidden sm:inline">
          Verknüpfe dein Spielerprofil, um dich für Turniere anzumelden und deine Ergebnisse zu sehen.
        </span>
        <Link
          to="/player-profile"
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />Jetzt verknüpfen
        </Link>
      </div>
    </div>
  );
}