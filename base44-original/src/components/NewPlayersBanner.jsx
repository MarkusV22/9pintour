import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { UserPlus, X, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'admin_new_players_seen_at';

export default function NewPlayersBanner() {
  const queryClient = useQueryClient();
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [dismissed, setDismissed] = useState(false);

  const { data: players = [] } = useQuery({
    queryKey: ['admin-new-players', seenAt],
    queryFn: () => base44.entities.Player.list('-created_date', 50),
  });

  const newPlayers = seenAt
    ? players.filter((p) => new Date(p.created_date) > new Date(seenAt))
    : players;

  useEffect(() => {
    if (players.length === 0) return;
    // On mount with no prior seenAt, seed it to the newest creation date so we
    // only surface players created AFTER this visit.
    if (!seenAt) {
      const newest = players.reduce((max, p) => {
        const d = new Date(p.created_date);
        return d > max ? d : max;
      }, new Date(0));
      const iso = newest.toISOString();
      localStorage.setItem(STORAGE_KEY, iso);
      setSeenAt(iso);
    }
  }, [players, seenAt]);

  const handleDismiss = () => {
    const iso = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, iso);
    setSeenAt(iso);
    setDismissed(true);
    queryClient.invalidateQueries({ queryKey: ['admin-new-players'] });
  };

  if (dismissed || newPlayers.length === 0) return null;

  return (
    <div className="relative border border-emerald-300 bg-emerald-50 rounded-xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
        <UserPlus className="w-4 h-4 text-emerald-700" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-emerald-800">
          {newPlayers.length} neuer Spieler{newPlayers.length === 1 ? '' : ' angelegt'}
        </h3>
        <p className="text-xs text-emerald-700/80 mt-0.5 truncate">
          {newPlayers.slice(0, 6).map((p) => p.name || `${p.first_name} ${p.last_name}`.trim()).join(', ')}
          {newPlayers.length > 6 ? ` +${newPlayers.length - 6} weitere` : ''}
        </p>
        <Link
          to="/players"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-800 hover:text-emerald-900 mt-1.5"
        >
          Zur Spieler-Verwaltung <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-emerald-700/60 hover:text-emerald-900"
        title="Als gelesen markieren"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}