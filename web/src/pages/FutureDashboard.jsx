import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { Sparkles, Trophy, Calendar, CalendarDays, TrendingUp, ArrowRight, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useSeasons } from '@/lib/useSeason';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { FUTURE_AGE_CLASSES, getFuturePoints } from '@/lib/tournamentPoints';
import { isWalkover } from '@/components/ScoreEntryCard';
import { getVenues } from '@/lib/venues';

const statusColors = {
  geplant: 'bg-blue-100 text-blue-700',
  laufend: 'bg-amber-100 text-amber-700',
  abgeschlossen: 'bg-green-100 text-green-700',
};

export default function FutureDashboard() {
  const { activeSeason } = useSeasons();
  const { playerMap, getPlayerName } = usePlayerMap();

  const { data: allTournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 500),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
  });
  const { data: results = [] } = useQuery({
    queryKey: ['all-results'],
    queryFn: () => base44.entities.TournamentResult.list('-created_date', 5000),
  });

  // Nur Future-Serie
  const futureTournaments = allTournaments.filter(t => t.series_type === 'future' && !t.deleted_at);

  const tournaments = activeSeason
    ? futureTournaments.filter(t => {
        if (!t.date) return false;
        const d = t.date.slice(0, 10);
        return d >= activeSeason.start_date && d <= activeSeason.end_date;
      })
    : futureTournaments;

  const today = new Date().toISOString().slice(0, 10);
  const runningTournaments = tournaments.filter(t => {
    if (t.status === 'abgeschlossen') return false;
    const start = t.date?.slice(0, 10);
    const end = (t.end_date || t.date)?.slice(0, 10);
    return start && today >= start && today <= end;
  });
  const activeTournaments = runningTournaments.length;
  const upcomingTournaments = tournaments.filter(t =>
    t.status !== 'abgeschlossen' && t.date?.slice(0, 10) > today
  );

  const dashboardTournaments = tournaments
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const finishedCount = tournaments.filter(t => t.status === 'abgeschlossen').length;

  // Abgeschlossene Turniere mit Ergebnissen
  const awardedIds = new Set(results.map(r => r.tournament_id));
  const finishedTournaments = tournaments.filter(t => t.status === 'abgeschlossen' && awardedIds.has(t.id));

  // Top-3 je Kategorie (Herren/Damen × Altersklasse)
  const top3ByCategory = useMemo(() => {
    if (!playerMap || Object.keys(playerMap).length === 0) return [];
    return ['Herren', 'Damen'].flatMap(gender =>
      FUTURE_AGE_CLASSES.map(ageClass => {
        const playerPoints = {};
        const playerTournaments = {};
        const playerTournamentScores = {};

        finishedTournaments.forEach(tournament => {
          const tResults = results.filter(r =>
            r.tournament_id === tournament.id && r.player_id && r.notes === ageClass &&
            playerMap[r.player_id]?.category === gender
          );
          tResults.forEach(r => {
            playerPoints[r.player_id] = (playerPoints[r.player_id] || 0) + (r.points || 0);
            playerTournaments[r.player_id] = (playerTournaments[r.player_id] || 0) + 1;
            const best = scores
              .filter(s => s.player_id === r.player_id && s.tournament_id === tournament.id && s.score != null && !isWalkover(s.notes))
              .reduce((max, s) => Math.max(max, s.score), 0);
            if (best > 0) (playerTournamentScores[r.player_id] ||= []).push(best);
          });
        });

        // Schnitt-Bonus (wie FutureRanking)
        const schnittData = Object.entries(playerTournamentScores).map(([playerId, tScores]) => {
          const best5 = [...tScores].sort((a, b) => b - a).slice(0, 5);
          const avg = best5.reduce((s, v) => s + v, 0) / best5.length;
          return { playerId, schnitt: avg, count: tScores.length };
        });
        const bonusData = schnittData.filter(e => e.count >= 3).sort((a, b) => b.schnitt - a.schnitt);
        const schnittBonus = {};
        bonusData.forEach((entry, idx) => { schnittBonus[entry.playerId] = getFuturePoints(idx + 1, bonusData.length); });

        const rows = Object.entries(playerPoints)
          .map(([playerId, points]) => ({
            playerId,
            name: getPlayerName(playerId),
            points: points + (schnittBonus[playerId] || 0),
            tournaments: playerTournaments[playerId] || 0,
          }))
          .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments)
          .slice(0, 3);

        return { gender, ageClass, rows };
      })
    );
  }, [finishedTournaments, results, scores, playerMap, getPlayerName]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-7 h-7 text-emerald-500" />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">9PinFuture Dashboard</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {activeSeason
              ? <>Saison <span className="font-semibold text-primary">{activeSeason.name}</span> · Nachwuchsserie</>
              : 'Nachwuchsserie der 9-Pin Tour'}
          </p>
        </div>
        <Link
          to="/future-ranking"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-colors text-sm"
        >
          <BarChart2 className="w-4 h-4" />
          Zur Rangliste
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-5 mb-8 md:mb-10">
        <StatCard
          icon={<Trophy className="w-5 h-5 text-emerald-600" />}
          label="Future-Turniere"
          value={tournaments.length}
          bg="bg-emerald-100"
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5 text-sky-600" />}
          label="Noch zu spielende Turniere"
          value={upcomingTournaments.length}
          bg="bg-sky-100"
        />
      </div>

      {/* Top 3 je Kategorie */}
      {top3ByCategory.some(g => g.rows.length > 0) && (
        <div className="mb-8 md:mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Top 3 je Kategorie</h2>
            <Link to="/future-ranking" className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
              Vollerklärung <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {['Herren', 'Damen'].map(gender => (
              <div key={gender} className="space-y-3 md:space-y-4">
                {[...FUTURE_AGE_CLASSES].reverse().map(ageClass => {
                  const entry = top3ByCategory.find(g => g.gender === gender && g.ageClass === ageClass);
                  if (!entry) return null;
                  return <Top3Card key={`${gender}-${ageClass}`} gender={gender} ageClass={ageClass} rows={entry.rows} />;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aktuelle Turniere */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Aktuelle Future-Turniere</h2>
          <Link to="/tournaments" className="text-sm text-primary hover:underline flex items-center gap-1">
            Alle anzeigen <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : dashboardTournaments.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {dashboardTournaments.map(t => {
              const isRunning = runningTournaments.find(r => r.id === t.id);
              const isFinished = t.status === 'abgeschlossen';
              const venues = getVenues(t);
              const venueText = venues.length > 1
                ? venues.map(v => v.name || v.location).filter(Boolean).join(' · ')
                : (t.location || '');
              return (
                <Link
                  key={t.id}
                  to={`/tournaments/${t.id}`}
                  className="flex items-center justify-between p-3 md:p-4 bg-card rounded-xl border border-border hover:border-emerald-400 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isRunning ? 'bg-amber-100' : isFinished ? 'bg-green-100' : 'bg-emerald-100'}`}>
                      <Trophy className={`w-4 h-4 md:w-5 md:h-5 ${isRunning ? 'text-amber-600' : isFinished ? 'text-green-600' : 'text-emerald-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground group-hover:text-emerald-600 transition-colors text-sm md:text-base truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {t.date ? format(new Date(t.date), 'dd.MM.yyyy', { locale: de }) : ''}
                        {venueText && <span className="hidden sm:inline"> · {venueText}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isRunning ? 'bg-amber-100 text-amber-700' : isFinished ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {isRunning ? 'laufend' : isFinished ? 'abgeschlossen' : 'geplant'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Abgeschlossene Turniere (Vorschau) */}
      {finishedCount > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {finishedCount} abgeschlossene{finishedCount !== 1 ? '' : 's'} Turnier{finishedCount !== 1 ? 'e' : ''}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tournaments.filter(t => t.status === 'abgeschlossen').slice(0, 6).map(t => (
              <Link
                key={t.id}
                to={`/tournaments/${t.id}`}
                className="bg-card rounded-xl border border-border px-4 py-3 hover:border-emerald-400 transition-colors"
              >
                <p className="font-semibold text-sm truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.date ? format(new Date(t.date), 'dd. MMM yyyy', { locale: de }) : ''}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, bg }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-6">
      <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl ${bg} flex items-center justify-center mb-3 md:mb-4`}>
        {icon}
      </div>
      <p className="text-2xl md:text-3xl font-bold text-foreground">{value}</p>
      <p className="text-xs md:text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

const medalColors = ['bg-amber-500 text-white', 'bg-gray-400 text-white', 'bg-amber-700 text-white'];
const classColor = (cls) =>
  cls === 'U-10' ? 'text-sky-600' : cls === 'U-15' ? 'text-emerald-600' : 'text-violet-600';
const genderColor = (g) => g === 'Herren' ? 'text-blue-600' : 'text-pink-600';

function Top3Card({ gender, ageClass, rows }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="font-bold text-sm">
          <span className={genderColor(gender)}>{gender}</span>{' '}
          <span className={classColor(ageClass)}>{ageClass}</span>
        </h3>
      </div>
      {rows.length === 0 ? (
        <div className="py-5 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
          <BarChart2 className="w-6 h-6 text-muted-foreground/30" />
          Noch keine Daten
        </div>
      ) : (
        <table className="w-full">
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.playerId} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="py-2 px-3 w-10">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold ${medalColors[i] || 'bg-muted text-foreground'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="py-2 px-1 font-medium text-sm text-foreground truncate">{row.name}</td>
                <td className="py-2 px-3 text-right font-bold text-sm text-foreground">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
      <Sparkles className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">Noch keine Future-Turniere vorhanden.</p>
      <Link to="/tournaments/new" className="mt-3 inline-block text-sm text-emerald-600 hover:underline">
        Erstes Turnier anlegen →
      </Link>
    </div>
  );
}