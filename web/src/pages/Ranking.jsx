import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart2, Star, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPoints, getTierStyle, TIERS } from '@/lib/tournamentPoints';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import PlayerStatsPanel from '@/components/PlayerStatsPanel';
import { useSeasons } from '@/lib/useSeason';

export default function Ranking() {
  const { playerMap, getPlayerName } = usePlayerMap();
  const { user } = useAuth();
  const [selectedHerren, setSelectedHerren] = useState(null);
  const [selectedDamen, setSelectedDamen] = useState(null);
  const [rankingCategory, setRankingCategory] = useState('Herren');
  const { activeSeason } = useSeasons();

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 500),
  });

  const { data: scores = [], isLoading: scoresLoading } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
  });
  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ['all-results'],
    queryFn: () => base44.entities.TournamentResult.list('-created_date', 5000),
  });
  // Also wait for playerMap to be ready before building ranking
  const { data: playersRaw = [], isLoading: playersLoading } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('name', 9999),
  });
  const isLoading = scoresLoading || playersLoading || resultsLoading;

  // Build a direct playerMap from the raw data (guaranteed ready when isLoading=false)
  const directPlayerMap = useMemo(() => {
    const map = {};
    playersRaw.forEach(p => { map[p.id] = p; });
    return map;
  }, [playersRaw]);

  // Filter tournaments to active season if one exists
  const seasonTournaments = activeSeason
    ? tournaments.filter(t => {
        if (!t.date) return false;
        const d = t.date.slice(0, 10);
        return d >= activeSeason.start_date && d <= activeSeason.end_date;
      })
    : tournaments;

  // Only include tournaments with formally awarded results (TournamentResult records)
  // Only standard series tournaments (exclude 9PinFuture)
  const standardTournaments = seasonTournaments.filter(t => t.series_type !== 'future');
  const awardedTournamentIds = useMemo(() => new Set(results.map(r => r.tournament_id)), [results]);
  const finishedTournaments = standardTournaments.filter(t =>
    t.status === 'abgeschlossen' &&
    !t.deleted_at &&
    awardedTournamentIds.has(t.id)
  );
  const finishedIds = new Set(finishedTournaments.map(t => t.id));

  // Build ranking from TournamentResult records (formally awarded points only)
  const buildRanking = (category) => {
    const playerPoints = {};
    const playerTournaments = {};
    const playerBestScore = {}; // best single score across all tournaments (tiebreaker)

    finishedTournaments.forEach(tournament => {
      const tournamentResults = results.filter(r =>
        r.tournament_id === tournament.id && r.player_id && r.notes === category
      );

      tournamentResults.forEach(r => {
        playerPoints[r.player_id] = (playerPoints[r.player_id] || 0) + (r.points || 0);
        playerTournaments[r.player_id] = (playerTournaments[r.player_id] || 0) + 1;
        // Track best score for tiebreaker
        const best = scores
          .filter(s => s.player_id === r.player_id && s.tournament_id === tournament.id && s.score != null)
          .reduce((max, s) => Math.max(max, s.score), 0);
        if (playerBestScore[r.player_id] === undefined || best > playerBestScore[r.player_id]) {
          playerBestScore[r.player_id] = best;
        }
      });
    });

    const sorted = Object.entries(playerPoints)
      .map(([playerId, points]) => ({
        playerId,
        name: getPlayerName(playerId),
        points,
        tournaments: playerTournaments[playerId] || 0,
        bestScore: playerBestScore[playerId] || 0,
      }))
      .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments);

    // Konkurrenz-Rang: bei Punktgleichheit gleicher Rang, folgende überspringen (1, 2, 2, 4 …)
    let prevPoints = null;
    let prevRank = 0;
    return sorted.map((row, i) => {
      const rank = row.points === prevPoints ? prevRank : i + 1;
      prevPoints = row.points;
      prevRank = rank;
      return { ...row, rank };
    });
  };

  const herren = buildRanking('Herren');
  const damen  = buildRanking('Damen');

  if (isLoading) {
    return (
      <div className="p-8 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
         <div>
           <h1 className="text-3xl font-bold text-foreground tracking-tight">Rangliste</h1>
           <p className="text-muted-foreground mt-1">
             {activeSeason ? <span className="font-semibold text-primary">{activeSeason.name}</span> : 'Alle Saisonen'} · ATP-System · {finishedTournaments.length} Turnier{finishedTournaments.length !== 1 ? 'e' : ''}
           </p>
         </div>
         {isTurnierAdmin(user) && (
           <Link
             to="/ranking/points"
             className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
           >
             <Star className="w-4 h-4" />
             Punkte vergeben
           </Link>
         )}
       </div>

      {/* Tier legend */}
      <div className="flex gap-2 flex-wrap mb-6">
        {TIERS.map(t => (
          <span key={t.value} className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.color}`}>
            {t.label}
          </span>
        ))}
        <span className="text-xs text-muted-foreground self-center ml-1">→ Sieger erhält {['2000','1000','500','250','125','0'].join(' / ')} Punkte</span>
      </div>

      {finishedTournaments.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-semibold text-foreground">Keine Daten verfügbar</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Schließe ein Turnier ab, damit es hier erscheint.</p>
          <Link to="/tournaments" className="text-sm text-primary hover:underline">Zu den Turnieren →</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Toggle – mobile only */}
          <div className="flex lg:hidden items-center justify-center gap-2">
            <button
              onClick={() => setRankingCategory('Herren')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${rankingCategory === 'Herren' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              Herren
            </button>
            <button
              onClick={() => setRankingCategory('Damen')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${rankingCategory === 'Damen' ? 'bg-pink-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              Damen
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`${rankingCategory === 'Herren' ? 'block' : 'hidden'} lg:block`}>
              <RankingTable
                title="Herren" rows={herren} color="blue"
                onSelect={setSelectedHerren} selectedId={selectedHerren?.playerId}
                selectedPlayer={selectedHerren} playerMap={playerMap}
                scores={scores} results={results} finishedTournaments={finishedTournaments}
                relevantTournaments={standardTournaments}
                tournaments={tournaments}
                onClose={() => setSelectedHerren(null)}
              />
            </div>
            <div className={`${rankingCategory === 'Damen' ? 'block' : 'hidden'} lg:block`}>
              <RankingTable
                title="Damen" rows={damen} color="pink"
                onSelect={setSelectedDamen} selectedId={selectedDamen?.playerId}
                selectedPlayer={selectedDamen} playerMap={playerMap}
                scores={scores} results={results} finishedTournaments={finishedTournaments}
                relevantTournaments={standardTournaments}
                tournaments={tournaments}
                onClose={() => setSelectedDamen(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recent tournaments */}
      {finishedTournaments.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Abgeschlossene Turniere</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {finishedTournaments.map(t => (
              <Link
                key={t.id}
                to={`/tournaments/${t.id}`}
                className="bg-card rounded-xl border border-border px-4 py-3 hover:border-primary transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.date ? format(new Date(t.date), 'dd. MMM yyyy', { locale: de }) : ''}
                  </p>
                </div>
                {t.tier && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${getTierStyle(t.tier)}`}>
                    {t.tier}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const medalColors = ['bg-amber-500 text-white', 'bg-gray-400 text-white', 'bg-amber-700 text-white'];

function RankingTable({ title, rows, color, onSelect, selectedId, selectedPlayer, playerMap, scores, results, finishedTournaments, relevantTournaments, tournaments, onClose }) {
  const headerColor = color === 'blue' ? 'text-blue-600' : 'text-pink-600';
  const accentColor = color === 'blue' ? 'text-blue-600' : 'text-pink-600';

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className={`font-bold text-base ${headerColor}`}>{title}</h2>
        <Link to="/ranking" className="text-xs text-primary hover:underline flex items-center gap-1">
          Alle <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <BarChart2 className="w-8 h-8 text-muted-foreground/30" />
          Noch keine Daten
        </div>
      ) : (
        <table className="w-full">
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedId === row.playerId;
              const showPanel = isSelected && selectedPlayer && rows.some(r => r.playerId === selectedPlayer.playerId);
              return (
                <>
                  <tr
                    key={row.playerId}
                    onClick={() => onSelect(isSelected ? null : row)}
                    className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold ${medalColors[row.rank - 1] || 'bg-muted text-foreground'}`}>
                        {row.rank}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-medium text-sm text-foreground">{row.name}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground text-center">{row.tournaments}T</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${row.rank === 1 ? accentColor : 'text-foreground'}`}>
                      {row.points}
                    </td>
                  </tr>
                  {showPanel && (
                    <tr key={`panel-${row.playerId}`}>
                      <td colSpan={4} className="p-3 bg-muted/10">
                        <PlayerStatsPanel
                           playerId={selectedPlayer.playerId}
                           playerName={selectedPlayer.name}
                           player={playerMap[selectedPlayer.playerId]}
                           scores={scores}
                           results={results}
                           finishedTournaments={finishedTournaments}
                           relevantTournaments={relevantTournaments}
                           tournaments={tournaments}
                           onClose={onClose}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}