import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Save, Trophy, CheckCircle2, Settings2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TIERS, POINTS_TABLE, getTierStyle } from '@/lib/tournamentPoints';
import PointsTableEditor from '@/components/PointsTableEditor';
import { useAuth } from '@/lib/AuthContext';

export default function RankingPoints() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [savedId, setSavedId] = useState(null);
  const isAdmin = user?.role === 'admin';

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 100),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, tier }) => base44.entities.Tournament.update(id, { tier }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setSavedId(id);
      setTimeout(() => setSavedId(null), 1500);
    },
  });

  const finishedTournaments = tournaments.filter(t =>
    t.status === 'abgeschlossen' && !t.deleted_at
  );

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Punkte-Verwaltung</h1>
        <p className="text-muted-foreground mt-1">
          Turniergröße festlegen · Punkte werden automatisch nach ATP-System vergeben
        </p>
      </div>

      {/* Editable Points table */}
      {isAdmin ? (
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">Punkteschlüssel bearbeiten</h2>
          </div>
          <PointsTableEditor />
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Admin-Zugriff erforderlich</p>
            <p className="text-sm text-amber-800 mt-0.5">Nur Administratoren können den Punkteschlüssel bearbeiten.</p>
          </div>
        </div>
      )}

      {/* Points reference table (read-only preview) */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-8">
        <h2 className="font-semibold text-foreground mb-4 text-sm">Punktetabelle (nach Platzierung)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-semibold">Turniergröße</th>
                {[1,2,3,4,5,6,7,8].map(p => (
                  <th key={p} className="text-center py-2 px-2 text-xs text-muted-foreground font-semibold w-12">
                    {p === 3 ? '3–4' : p === 5 ? '5–8' : p > 5 ? '' : p}{p <= 2 || p === 4 ? '.' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map(tier => (
                <tr key={tier.value} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tier.color}`}>
                      {tier.label}
                    </span>
                  </td>
                  {POINTS_TABLE[tier.value].map((pts, i) => (
                    <td key={i} className={`text-center py-2.5 px-2 font-mono font-bold text-foreground`}>
                      {pts}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          * Plätze 3–4 erhalten gleiche Punkte (beide Halbfinalisten), Plätze 5–8 ebenfalls.
        </div>
      </div>


    </div>
  );
}

function TournamentPointsCard({ tournament, scores, onSaveTier, isSaving, saved }) {
  const [selectedTier, setSelectedTier] = useState(tournament.tier || 'Masters 250');

  // Compute rankings per category from scores
  const buildRanking = (category) => {
    const catScores = scores.filter(s => s.category === category);
    const playerBest = {};
    catScores.forEach(s => {
      if (s.player_id && (playerBest[s.player_id] === undefined || s.score > playerBest[s.player_id].score)) {
        playerBest[s.player_id] = { score: s.score, name: s.player_name };
      }
    });
    return Object.entries(playerBest)
      .map(([playerId, { name, score }]) => ({ playerId, name, score }))
      .sort((a, b) => b.score - a.score);
  };

  const herren = buildRanking('Herren');
  const damen  = buildRanking('Damen');

  const getPoints = (placement) => {
    const table = POINTS_TABLE[selectedTier] || POINTS_TABLE['Masters 250'];
    return table[placement - 1] ?? 0;
  };

  const hasChanged = selectedTier !== (tournament.tier || 'Masters 250');

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground">{tournament.name}</span>
            {tournament.date && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(tournament.date), 'dd. MMM yyyy', { locale: de })}
              </span>
            )}
          </div>
          {tournament.location && (
            <p className="text-xs text-muted-foreground mt-0.5">{tournament.location}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 flex-wrap">
            {TIERS.map(tier => (
              <button
                key={tier.value}
                onClick={() => setSelectedTier(tier.value)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                  selectedTier === tier.value
                    ? `${tier.color} border-transparent scale-105 shadow-sm`
                    : 'bg-background text-muted-foreground border-border hover:border-primary'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
          {hasChanged && (
            <Button size="sm" onClick={() => onSaveTier(selectedTier)} disabled={isSaving} className="gap-1.5">
              {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Gespeichert' : 'Speichern'}
            </Button>
          )}
          {!hasChanged && tournament.tier && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getTierStyle(tournament.tier)}`}>
              {tournament.tier} ✓
            </span>
          )}
        </div>
      </div>

      {/* Rankings preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <RankList title="Herren" players={herren} getPoints={getPoints} color="text-blue-600" />
        <RankList title="Damen"  players={damen}  getPoints={getPoints} color="text-pink-600" />
      </div>
    </div>
  );
}

function RankList({ title, players, getPoints, color }) {
  if (players.length === 0) return (
    <div className="px-5 py-4">
      <p className={`text-sm font-semibold mb-2 ${color}`}>{title}</p>
      <p className="text-xs text-muted-foreground">Keine Ergebnisse</p>
    </div>
  );
  return (
    <div className="px-5 py-4">
      <p className={`text-sm font-semibold mb-3 ${color}`}>{title}</p>
      <div className="space-y-1.5">
        {players.slice(0, 16).map((p, i) => {
          const pts = getPoints(i + 1);
          return (
            <div key={p.playerId || p.name} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
              <span className="text-sm flex-1 font-medium truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">Score: {p.score}</span>
              <span className={`text-xs font-bold w-14 text-right ${pts > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                +{pts} Pkt
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}