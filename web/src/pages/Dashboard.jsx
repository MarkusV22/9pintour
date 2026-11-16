import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, TrendingUp, ArrowRight, BarChart2, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { getPoints } from '@/lib/tournamentPoints';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { useSeasons } from '@/lib/useSeason';
import NewsletterSignup from '@/components/NewsletterSignup';
import DiscordCard from '@/components/DiscordCard';
import AdBanner from '@/components/AdBanner';
import { useNewsletterEnabled } from '@/lib/useNewsletterEnabled';
import { useState, useEffect } from 'react';

function parseNotes(notesStr) {
  try {
    return JSON.parse(notesStr || '');
  } catch {}
  return null;
}

// Abräumen aus score notes (Bahnen-Modus oder Gesamt-Modus) für Tie-Breaker
function parseAbraeumen(notesStr) {
  const n = parseNotes(notesStr);
  if (!n) return 0;
  if (Array.isArray(n)) return n.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0);
  if (n.gesamt === true) return parseInt(n.abraeumen) || 0;
  return 0;
}

const statusColors = {
  geplant: 'bg-blue-100 text-blue-700',
  laufend: 'bg-amber-100 text-amber-700',
  abgeschlossen: 'bg-green-100 text-green-700',
};

export default function Dashboard() {
  const { playerMap, getPlayerName } = usePlayerMap();
  const { activeSeason } = useSeasons();
  const [bannerUrl, setBannerUrl] = useState('');
  const [rankingCategory, setRankingCategory] = useState('Herren');
  const { isEnabled: newsletterEnabled } = useNewsletterEnabled();

  const { data: allTournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 50),
  });

  // Fetch dashboard banner from AppSetting
  useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const data = await base44.entities.AppSetting.filter({ key: 'dashboard_banner_url' });
      if (data.length > 0) {
        setBannerUrl(data[0].value);
      }
    },
  });

  // Only 9PinTour (standard) tournaments – 9PinFuture is shown on its own dashboard
  const tourTournaments = allTournaments.filter(t => (t.series_type || 'standard') === 'standard' && !t.deleted_at);

  // Filter to active season
  const tournaments = activeSeason
    ? tourTournaments.filter(t => {
        if (!t.date) return false;
        const d = t.date.slice(0, 10);
        return d >= activeSeason.start_date && d <= activeSeason.end_date;
      })
    : tourTournaments;

  const { data: scores = [] } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
  });

  const tournamentIds = new Set(tournaments.map(t => t.id));
  const validScores = scores.filter(s => s.tournament_id && tournamentIds.has(s.tournament_id));

  const today = new Date().toISOString().slice(0, 10);
  const runningTournaments = tournaments.filter(t => {
    if (t.status === 'abgeschlossen') return false;
    const start = t.date?.slice(0, 10);
    const end = (t.end_date || t.date)?.slice(0, 10);
    return start && today >= start && today <= end;
  });
  const activeTournaments = runningTournaments.length;

  // Next upcoming tournament (earliest future date, not yet started)
  const nextTournament = tournaments
    .filter(t => t.status !== 'abgeschlossen' && t.date?.slice(0, 10) > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;

  // Dashboard shows: running tournaments + next upcoming
  const dashboardTournaments = [
    ...runningTournaments,
    ...(nextTournament && !runningTournaments.find(t => t.id === nextTournament.id) ? [nextTournament] : []),
  ];

  const finishedTournaments = tournaments.filter(t => t.status === 'abgeschlossen');

  const buildRanking = (category) => {
    const playerPoints = {};
    const playerTournaments = {};
    finishedTournaments.forEach(tournament => {
      const tier = tournament.tier || 'Masters 250';
      const catScores = validScores.filter(s => {
        if (!s.player_id || s.score == null) return false;
        if (s.tournament_id !== tournament.id) return false;
        const playerCategory = playerMap?.[s.player_id]?.category;
        return s.category === category || playerCategory === category;
      });
      const playerBest = {};
      catScores.forEach(s => {
        const cur = playerBest[s.player_id];
        if (cur === undefined || s.score > cur.score || (s.score === cur.score && parseAbraeumen(s.notes) > parseAbraeumen(cur.notes))) {
          playerBest[s.player_id] = s;
        }
      });
      Object.entries(playerBest).sort((a, b) => {
        if (b[1].score !== a[1].score) return b[1].score - a[1].score;
        return parseAbraeumen(b[1].notes) - parseAbraeumen(a[1].notes);
      }).forEach(([playerId], i) => {
        const pts = getPoints(tier, i + 1);
        playerPoints[playerId] = (playerPoints[playerId] || 0) + pts;
        playerTournaments[playerId] = (playerTournaments[playerId] || 0) + 1;
      });
    });
    const sorted = Object.entries(playerPoints)
      .map(([playerId, points]) => ({ name: getPlayerName(playerId), points, tournaments: playerTournaments[playerId] || 0 }))
      .sort((a, b) => b.points - a.points);

    // Konkurrenz-Rang: bei Punktgleichheit gleicher Rang, folgende überspringen (1, 2, 2, 4 …)
    let prevPoints = null;
    let prevRank = 0;
    const withRank = sorted.map((row, i) => {
      const rank = row.points === prevPoints ? prevRank : i + 1;
      prevPoints = row.points;
      prevRank = rank;
      return { ...row, rank };
    });
    return withRank.slice(0, 10);
  };

  const playerMapReady = Object.keys(playerMap || {}).length > 0;
  const herrenTop10 = playerMapReady ? buildRanking('Herren') : [];
  const damenTop10  = playerMapReady ? buildRanking('Damen')  : [];

  // All-time statistics (overall)
  const allTimeStats = (() => {
    let totalWurfe = 0;
    let totalFehlwurf = 0;
    let totalScore = 0;

    validScores.forEach(s => {
      if (!s.player_id || s.score == null || s.score <= 0) return;

      totalScore += s.score;
      totalWurfe += 120; // 120 Würfe pro Spieler mit Gesamtscore

      const notes = parseNotes(s.notes);
      if (Array.isArray(notes)) {
        // Bahnen-Modus: Fehlwürfe aus jedem Bahnen-Eintrag
        totalFehlwurf += notes.reduce((sum, b) => sum + (parseInt(b.fehlwurf) || 0), 0);
      } else if (notes && notes.gesamt === true) {
        // Gesamt-Modus: Fehlwürfe direkt im notes-Objekt
        totalFehlwurf += parseInt(notes.fehlwurf) || 0;
      }
    });

    return { totalWurfe, totalFehlwurf, totalScore };
  })();

  return (
    <div className="p-4 md:p-8">
      {/* Banner */}
      {bannerUrl && (
        <div className="mb-8 md:mb-10 rounded-2xl overflow-hidden border border-border shadow-lg">
          <img
            src={bannerUrl}
            alt="SpinTour Banner"
            className="w-full h-auto object-cover"
          />
        </div>
      )}

      <AdBanner className="mb-6 md:mb-8" />

      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {activeSeason
            ? <>Saison <span className="font-semibold text-primary">{activeSeason.name}</span></>
            : 'Überblick über alle Turniere und Ergebnisse'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-5 mb-8 md:mb-10">
        <StatCard
          icon={<Trophy className="w-5 h-5 text-primary" />}
          label="Turniere gesamt"
          value={tournaments.length}
          bg="bg-primary/10"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-amber-500" />}
          label="Aktive Turniere"
          value={activeTournaments}
          bg="bg-amber-100"
        />
      </div>

      {/* Top 10 Rankings */}
      <div className="mb-8 md:mb-10">
        {/* Toggle – mobile only */}
        <div className="flex lg:hidden items-center justify-center gap-2 mb-4">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Desktop: both visible; Mobile: only selected */}
          <div className={`${rankingCategory === 'Herren' ? 'block' : 'hidden'} lg:block`}>
            <MiniRankingTable title="Herren – Top 10" rows={herrenTop10} color="blue" />
          </div>
          <div className={`${rankingCategory === 'Damen' ? 'block' : 'hidden'} lg:block`}>
            <MiniRankingTable title="Damen – Top 10" rows={damenTop10} color="pink" />
          </div>
        </div>
      </div>

      {/* All-Time Statistics */}
      <div className="mb-8 md:mb-10">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          All-Time Statistik
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={<Trophy className="w-5 h-5 text-primary" />}
            label="Gesamte Würfe"
            value={allTimeStats.totalWurfe}
            bg="bg-primary/10"
          />
          <StatCard
            icon={<Zap className="w-5 h-5 text-amber-500" />}
            label="Fehlwürfe"
            value={allTimeStats.totalFehlwurf}
            bg="bg-amber-100"
          />
          <StatCard
            icon={<Trophy className="w-5 h-5 text-green-600" />}
            label="Gesamte Kegel"
            value={allTimeStats.totalScore}
            bg="bg-green-100"
          />
        </div>
      </div>

      {/* Active & Next Tournaments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Aktuelle Turniere</h2>
          <Link to="/tournaments" className="text-sm text-primary hover:underline flex items-center gap-1">
            Alle anzeigen <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {dashboardTournaments.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {dashboardTournaments.map(t => {
              const isRunning = runningTournaments.find(r => r.id === t.id);
              return (
                <Link
                  key={t.id}
                  to={`/tournaments/${t.id}`}
                  className="flex items-center justify-between p-3 md:p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isRunning ? 'bg-amber-100' : 'bg-primary/10'}`}>
                      <Trophy className={`w-4 h-4 md:w-5 md:h-5 ${isRunning ? 'text-amber-600' : 'text-primary'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm md:text-base truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {format(new Date(t.date), 'dd.MM.yyyy', { locale: de })}
                        {t.location && <span className="hidden sm:inline"> · {t.location}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isRunning ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {isRunning ? 'laufend' : 'nächstes'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Newsletter Signup */}
      {newsletterEnabled && (
        <div className="mt-8 md:mt-10 max-w-md">
          <NewsletterSignup />
        </div>
      )}

      {/* Discord Hinweis */}
      <div className="mt-6 md:mt-8 max-w-md">
        <DiscordCard />
      </div>
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

function MiniRankingTable({ title, rows, color }) {
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
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
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
      <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">Noch keine Turniere vorhanden.</p>
      <Link to="/tournaments/new" className="mt-3 inline-block text-sm text-primary hover:underline">
        Erstes Turnier anlegen →
      </Link>
    </div>
  );
}