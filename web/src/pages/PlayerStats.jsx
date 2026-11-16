import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { getPoints, getTierStyle } from '@/lib/tournamentPoints';
import { avg } from '@/components/PlayerStatsPanel';
import { useSeasons } from '@/lib/useSeason';
import PlayerOverallStats from '@/components/PlayerOverallStats';

function parseVAF(notesStr) {
  try {
    const p = JSON.parse(notesStr || '');
    if (Array.isArray(p)) {
      return {
        voll: p.reduce((s, r) => s + (parseInt(r.voll) || 0), 0),
        abr:  p.reduce((s, r) => s + (parseInt(r.abraeumen) || 0), 0),
        feh:  p.reduce((s, r) => s + (parseInt(r.fehlwurf) || 0), 0),
      };
    }
    if (p && typeof p === 'object') {
      const v = parseInt(p.voll); const a = parseInt(p.abraeumen); const f = parseInt(p.fehlwurf);
      return { voll: isNaN(v) ? null : v, abr: isNaN(a) ? null : a, feh: isNaN(f) ? null : f };
    }
  } catch {}
  return { voll: null, abr: null, feh: null };
}
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { BarChart2, Trophy, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PlayerStats({ playerId: playerIdProp, embedded = false }) {
  const urlParams = new URLSearchParams(window.location.search);
  const playerId = playerIdProp || urlParams.get('id');

  const { playerMap, getPlayerName } = usePlayerMap();
  const { activeSeason } = useSeasons();

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 100),
  });

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
  });

  const seriesFilter = urlParams.get('series');
  const isFuture = seriesFilter === 'future';
  // Auch laufende/geplante Turniere anzeigen, sobald Scores eingetragen sind –
  // nicht erst, wenn das Turnier abgeschlossen ist. (Turniere ohne Score werden
  // weiter unten über .filter(Boolean) automatisch ausgeblendet.)
  const relevantTournaments = tournaments.filter(t => {
    if (t.series_type === 'future' !== isFuture) return false;
    if (!activeSeason) return true;
    if (t.season_id === activeSeason.id) return true;
    // Tournaments without season_id: include if their date falls within the active season
    if (!t.season_id && t.date) {
      const tDate = String(t.date).slice(0, 10);
      return tDate >= String(activeSeason.start_date).slice(0, 10) &&
             tDate <= String(activeSeason.end_date).slice(0, 10);
    }
    return false;
  });
  const relevantTournamentIds = new Set(relevantTournaments.map(t => t.id));
  const player = playerId ? playerMap[playerId] : null;
  const playerName = playerId ? getPlayerName(playerId) : null;

  // Build per-tournament stats for this player
  const tournamentStats = relevantTournaments.map(t => {
    const catScores = scores.filter(s =>
      s.tournament_id === t.id && s.player_id === playerId && s.score != null
    );
    if (catScores.length === 0) return null;

    // Use player's own profile category as source of truth (important for Mixed tournaments)
    const playerCategory = player?.category || catScores[0].category;
    const bestScoreEntry = catScores.reduce((best, s) => s.score > best.score ? s : best, catScores[0]);
    const bestScore = bestScoreEntry.score;
    const { voll: totalVoll, abr: totalAbraeumen, feh: totalFehlwurf } = parseVAF(bestScoreEntry.notes);
    
    // All attempts for this tournament: chronological order with labels, sorted by score
    const chronoAttemptsSorted = [...catScores].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const attemptMap = Object.fromEntries(chronoAttemptsSorted.map((a, idx) => [a.id, idx + 1]));
    const allAttempts = [...catScores].sort((a, b) => b.score - a.score);

    // Ranking within this tournament/category — filter by player profile category, not score category
    const allCatScores = scores.filter(s => {
      if (!relevantTournamentIds.has(s.tournament_id)) return false;
      if (s.tournament_id !== t.id) return false;
      if (!s.player_id || s.score == null) return false;
      // Use player profile category if available, fall back to score category
      const pCat = playerMap[s.player_id]?.category || s.category;
      return pCat === playerCategory;
    });
    const playerBest = {};
    const playerBestEntry = {};
    allCatScores.forEach(s => {
      if (playerBest[s.player_id] === undefined || s.score > playerBest[s.player_id]) {
        playerBest[s.player_id] = s.score;
        playerBestEntry[s.player_id] = s;
      }
    });

    // Tie-Break wie generateResults / Rangliste: bei Kegelgleichstand gewinnt
    // mehr abgeräumt, dann weniger Fehlwurf. Ohne diesen Tie-Break würde die
    // Detail-Anzeige bei Gleichstand eine andere Platzierung zeigen als die
    // offiziellen Ergebnisse (z.B. Monthaler 5. statt fälschlich 6.).
    const ranked = Object.entries(playerBestEntry).sort((a, b) => {
      const sa = a[1].score, sb = b[1].score;
      if (sb !== sa) return sb - sa;
      const aAbr = parseVAF(a[1].notes).abr ?? -1;
      const bAbr = parseVAF(b[1].notes).abr ?? -1;
      if (bAbr !== aAbr) return bAbr - aAbr;
      const aFeh = parseVAF(a[1].notes).feh ?? 999;
      const bFeh = parseVAF(b[1].notes).feh ?? 999;
      return aFeh - bFeh;
    }).map(([pid]) => pid);
    const position = ranked.indexOf(playerId) + 1;
    const tier = t.tier || 'Masters 250';
    const points = getPoints(tier, position);
    const finalPosition = position;

    // Top 10 averages for this tournament
    const top10Entries = ranked.slice(0, 10).map(pid => playerBestEntry[pid]).filter(Boolean);
    const top10Scores = ranked.slice(0, 10).map(pid => playerBest[pid]).filter(v => v != null);

    const avgVoll      = avg(top10Entries.map(s => parseVAF(s.notes).voll));
    const avgAbraeumen = avg(top10Entries.map(s => parseVAF(s.notes).abr));
    const avgFehlwurf  = avg(top10Entries.map(s => parseVAF(s.notes).feh));
    const avgScore = avg(top10Scores);

    // Tournament-wide average (all players' best scores)
    const allTournamentVoll      = avg(Object.values(playerBestEntry).map(s => parseVAF(s.notes).voll));
    const allTournamentAbraeumen = avg(Object.values(playerBestEntry).map(s => parseVAF(s.notes).abr));
    const allTournamentFehlwurf  = avg(Object.values(playerBestEntry).map(s => parseVAF(s.notes).feh));
    const allTournamentScore = avg(Object.values(playerBest));

    return {
      tournament: t, category: playerCategory, bestScore, position: finalPosition, points, tier,
      totalPlayers: Object.keys(playerBest).length,
      totalVoll, totalAbraeumen, totalFehlwurf,
      avgVoll, avgAbraeumen, avgFehlwurf, avgScore,
      allTournamentVoll, allTournamentAbraeumen, allTournamentFehlwurf, allTournamentScore,
      top10Count: top10Entries.length,
      allAttempts,
      attemptMap,
    };
  }).filter(Boolean);

  // Determine best result (most points = best for ranking = this is NOT crossed out)
  const bestPoints = tournamentStats.length > 0 ? Math.max(...tournamentStats.map(s => s.points)) : 0;
  const totalPoints = tournamentStats.reduce((sum, s) => sum + s.points, 0);

  // All-time stats: one best score per tournament (deduplicated)
  const allTimeBestPerTournament = {};
  scores.forEach(s => {
    if (!relevantTournamentIds.has(s.tournament_id)) return;
    if (s.player_id !== playerId || s.score == null) return;
    if (!allTimeBestPerTournament[s.tournament_id] || s.score > allTimeBestPerTournament[s.tournament_id].score) {
      allTimeBestPerTournament[s.tournament_id] = s;
    }
  });
  const allTimePlayerScores = Object.values(allTimeBestPerTournament);

  const allTimeAvgVoll      = avg(allTimePlayerScores.map(s => parseVAF(s.notes).voll));
  const allTimeAvgAbraeumen = avg(allTimePlayerScores.map(s => parseVAF(s.notes).abr));
  const allTimeAvgFehlwurf  = avg(allTimePlayerScores.map(s => parseVAF(s.notes).feh));
  const allTimeAvgScore = avg(allTimePlayerScores.map(s => s.score));
  const avgPosition = tournamentStats.length > 0 ? avg(tournamentStats.map(s => s.position).filter(p => p != null)) : null;

  if (!playerId) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">Spielerstatistiken</h1>
        <p className="text-muted-foreground mb-8">Wähle einen Spieler aus der Rangliste aus.</p>
        <Link to="/ranking" className="text-sm text-primary hover:underline">← Zur Rangliste</Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "p-4 md:p-8 max-w-3xl"}>
      <div className="mb-6">
        {!embedded && <Link to={isFuture ? "/future-ranking" : "/ranking"} className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">← Zurück zur {isFuture ? '9PinFuture-' : ''}Rangliste</Link>}
        <div className="flex items-center gap-4">
          {player?.photo_url ? (
            <img src={player.photo_url} className="w-16 h-16 rounded-full object-cover" alt={playerName} />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{playerName?.[0] || '?'}</span>
            </div>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{playerName}</h1>
            {player?.club && <p className="text-muted-foreground text-sm">{player.club}</p>}
            {player?.number && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-bold">#{player.number}</span>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <Trophy className="w-5 h-5 text-primary mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{tournamentStats.length}</p>
          <p className="text-xs text-muted-foreground">Turniere</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <Star className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{totalPoints}</p>
          <p className="text-xs text-muted-foreground">Gesamtpunkte</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{bestPoints}</p>
          <p className="text-xs text-muted-foreground">Bestes Ergebnis</p>
        </div>
      </div>

      {/* Gesamtstatistik */}
      {tournamentStats.length > 0 && (
        <PlayerOverallStats
          avgPosition={avgPosition}
          tournamentCount={tournamentStats.length}
          avgVoll={allTimeAvgVoll}
          avgAbraeumen={allTimeAvgAbraeumen}
          avgFehlwurf={allTimeAvgFehlwurf}
          avgScore={allTimeAvgScore}
        />
      )}

      {/* Tournament results table */}
      {tournamentStats.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Noch keine Ergebnisse vorhanden.</p>
        </div>
      ) : (
       <div className="space-y-6">
         {tournamentStats.sort((a, b) => new Date(b.tournament.date) - new Date(a.tournament.date)).map(s => {
           const isBest = s.points === bestPoints && tournamentStats.filter(x => x.points === bestPoints)[0] === s;
           const fmt1 = (v) => v != null ? v.toFixed(1) : '–';

           return (
             <div key={s.tournament.id} className="bg-card border border-border rounded-2xl overflow-hidden">
               {/* Header */}
               <div className="px-5 py-4 border-b border-border bg-muted/30">
                 <div className="flex items-center justify-between">
                   <div>
                     <p className="font-semibold text-foreground">{s.tournament.name}</p>
                     <p className="text-xs text-muted-foreground mt-0.5">
                       {s.tournament.date ? format(new Date(s.tournament.date), 'dd. MMM yyyy', { locale: de }) : ''}
                       {' · '}{s.category}
                     </p>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getTierStyle(s.tier)}`}>{s.tier}</span>
                     <span className={`font-bold text-lg ${isBest ? 'text-amber-500' : 'text-foreground'}`}>
                       {s.points} {isBest && '★'}
                     </span>
                   </div>
                 </div>
               </div>

               {/* Position & Score */}
               <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
                 <div className="px-5 py-3 text-center">
                   <p className={`text-2xl font-bold ${s.position === 1 ? 'text-amber-500' : s.position === 2 ? 'text-gray-500' : s.position === 3 ? 'text-amber-700' : 'text-foreground'}`}>
                     {s.position ?? '–'}. / {s.totalPlayers}
                   </p>
                   <p className="text-xs text-muted-foreground">Platzierung</p>
                 </div>
                 <div className="px-5 py-3 text-center">
                   <p className="text-2xl font-bold text-primary">{s.bestScore}</p>
                   <p className="text-xs text-muted-foreground">Score</p>
                 </div>
               </div>

               {/* Stats table */}
               <div className="px-5 py-4 text-xs">
                 <table className="w-full">
                   <thead>
                     <tr className="border-b border-border">
                       <th className="text-left py-2 font-semibold text-muted-foreground"></th>
                       <th className="text-center py-2 font-semibold text-muted-foreground">Volle</th>
                       <th className="text-center py-2 font-semibold text-muted-foreground">Abräumen</th>
                       <th className="text-center py-2 font-semibold text-muted-foreground">Fehlwurf</th>
                       <th className="text-center py-2 font-semibold text-muted-foreground">Gesamt</th>
                     </tr>
                   </thead>
                   <tbody>

                     {s.allAttempts.map((attempt, idx) => {
                       const { voll: attemptVoll, abr: attemptAbr, feh: attemptFeh } = parseVAF(attempt.notes);
                       const isBestAttempt = idx === 0;
                       const chronoNum = s.attemptMap[attempt.id];
                       const bgColor = isBestAttempt ? 'rgb(219, 234, 254)' : `rgb(255, ${Math.max(200 - (idx - 1) * 20, 150)}, ${Math.max(200 - (idx - 1) * 20, 150)})`;
                       const textColor = isBestAttempt ? 'text-blue-700' : 'text-red-700';
                       return (
                         <tr key={attempt.id} style={{ backgroundColor: bgColor }} className="border-b border-border/30">
                           <td className={`py-2 font-semibold ${textColor}`}>Versuch {chronoNum}</td>
                           <td className={`py-2 text-center font-bold ${textColor}`}>{attemptVoll ?? '–'}</td>
                           <td className={`py-2 text-center font-bold ${textColor}`}>{attemptAbr ?? '–'}</td>
                           <td className={`py-2 text-center font-bold ${textColor}`}>{attemptFeh ?? '–'}</td>
                           <td className={`py-2 text-center font-bold ${textColor}`}>{attempt.score}</td>
                         </tr>
                       );
                     })}
                     <tr className="border-b border-border/50">
                       <td className="py-2 text-muted-foreground">Ø Turnier</td>
                       <td className="py-2 text-center text-muted-foreground">{fmt1(s.allTournamentVoll)}</td>
                       <td className="py-2 text-center text-muted-foreground">{fmt1(s.allTournamentAbraeumen)}</td>
                       <td className="py-2 text-center text-muted-foreground">{fmt1(s.allTournamentFehlwurf)}</td>
                       <td className="py-2 text-center text-muted-foreground">{fmt1(s.allTournamentScore)}</td>
                     </tr>
                     <tr>
                       <td className="py-2 text-muted-foreground">Ø Top {s.top10Count}</td>
                       <td className="py-2 text-center font-semibold text-foreground">{fmt1(s.avgVoll)}</td>
                       <td className="py-2 text-center font-semibold text-foreground">{fmt1(s.avgAbraeumen)}</td>
                       <td className="py-2 text-center font-semibold text-foreground">{fmt1(s.avgFehlwurf)}</td>
                       <td className="py-2 text-center font-semibold text-foreground">{fmt1(s.avgScore)}</td>
                     </tr>
                   </tbody>
                 </table>
               </div>
             </div>
           );
         })}
       </div>
      )}
    </div>
  );
}