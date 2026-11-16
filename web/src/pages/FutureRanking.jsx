import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, Fragment } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart2, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { useSeasons } from '@/lib/useSeason';
import PlayerStatsPanel from '@/components/PlayerStatsPanel';
import { FUTURE_AGE_CLASSES, getFuturePoints } from '@/lib/tournamentPoints';
import { isWalkover, isNoShow } from '@/components/ScoreEntryCard';

const medalColors = ['bg-amber-500 text-white', 'bg-gray-400 text-white', 'bg-amber-700 text-white'];

const classColor = (cls) =>
  cls === 'U-10' ? 'text-sky-600' :
  cls === 'U-15' ? 'text-emerald-600' :
  'text-violet-600';

const classActiveBg = (cls, active) => {
  if (!active) return 'bg-muted text-muted-foreground hover:bg-muted/70';
  return cls === 'U-10' ? 'bg-sky-600 text-white' :
         cls === 'U-15' ? 'bg-emerald-600 text-white' :
         'bg-violet-600 text-white';
};

export default function FutureRanking() {
  const { playerMap, getPlayerName } = usePlayerMap();
  const [selectedByClass, setSelectedByClass] = useState({});
  const [activeClass, setActiveClass] = useState('U-19');
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
  const { data: playersRaw = [], isLoading: playersLoading } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('name', 9999),
  });
  const { data: allSchedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['all-schedules'],
    queryFn: () => base44.entities.TournamentSchedule.list('-created_date', 5000),
  });
  const { data: allTeams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['all-teams'],
    queryFn: () => base44.entities.Team.list('-created_date', 5000),
  });
  const isLoading = scoresLoading || playersLoading || resultsLoading || schedulesLoading || teamsLoading;

  const directPlayerMap = useMemo(() => {
    const map = {};
    playersRaw.forEach(p => { map[p.id] = p; });
    return map;
  }, [playersRaw]);

  // Only future series tournaments
  const futureTournaments = tournaments.filter(t => t.series_type === 'future' && !t.deleted_at);

  const seasonTournaments = activeSeason
    ? futureTournaments.filter(t => {
        if (!t.date) return false;
        const d = t.date.slice(0, 10);
        return d >= activeSeason.start_date && d <= activeSeason.end_date;
      })
    : futureTournaments;

  const awardedTournamentIds = useMemo(() => new Set(results.map(r => r.tournament_id)), [results]);
  const finishedTournaments = seasonTournaments.filter(t =>
    t.status === 'abgeschlossen' && awardedTournamentIds.has(t.id)
  );
  const finishedIds = new Set(finishedTournaments.map(t => t.id));

  // Gültigkeit gespeicherter Ergebnisse pro Turnier: Spieler, die aus dem
  // Startplan entfernt wurden oder (in allen ihren Scores) als No-Show markiert
  // sind, erhalten keine Punkte – auch wenn noch alte Ergebnis-Einträge existieren.
  const resultValidity = useMemo(() => {
    const map = {};
    finishedTournaments.forEach(t => {
      const plan = new Set();
      allTeams.filter(team => team.tournament_id === t.id).forEach(team =>
        [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id]
          .filter(Boolean)
          .forEach(pid => plan.add(pid))
      );
      allSchedules
        .filter(s => s.tournament_id === t.id && !s.is_placeholder && s.player_id)
        .forEach(s => plan.add(s.player_id));
      const scoresByPlayer = {};
      scores.filter(s => s.tournament_id === t.id && s.player_id).forEach(s => {
        (scoresByPlayer[s.player_id] ||= []).push(s);
      });
      const noShow = new Set(
        Object.entries(scoresByPlayer)
          .filter(([, list]) => list.every(s => isNoShow(s.notes)))
          .map(([pid]) => pid)
      );
      map[t.id] = { plan, noShow };
    });
    return map;
  }, [finishedTournaments, allTeams, allSchedules, scores]);

  const buildRanking = (ageClass, gender) => {
    const playerPoints = {};
    const playerTournaments = {};
    const playerBestScore = {};
    const playerTournamentScores = {}; // beste Turnier-Score pro Spieler (für Gesamtschnitt)

    finishedTournaments.forEach(tournament => {
      const tournamentResults = results.filter(r =>
        r.tournament_id === tournament.id && r.player_id && r.notes === ageClass &&
        (playerMap[r.player_id]?.category || directPlayerMap[r.player_id]?.category) === gender
      );

      const validity = resultValidity[tournament.id];
      tournamentResults.forEach(r => {
        // Nicht angetreten (No-Show) oder aus dem Startplan entfernt: kein Ergebnis werten
        if (validity && validity.noShow.has(r.player_id)) return;
        if (validity && validity.plan.size > 0 && !validity.plan.has(r.player_id)) return;
        playerPoints[r.player_id] = (playerPoints[r.player_id] || 0) + (r.points || 0);
        playerTournaments[r.player_id] = (playerTournaments[r.player_id] || 0) + 1;
        const best = scores
          .filter(s => s.player_id === r.player_id && s.tournament_id === tournament.id && s.score != null && !isWalkover(s.notes) && !isNoShow(s.notes))
          .reduce((max, s) => Math.max(max, s.score), 0);
        if (best > 0) {
          (playerTournamentScores[r.player_id] ||= []).push(best);
        }
        if (playerBestScore[r.player_id] === undefined || best > playerBestScore[r.player_id]) {
          playerBestScore[r.player_id] = best;
        }
      });
    });

    // Gesamtschnitt: beste 5 (von i.d.R. 6) Turnierergebnisse im Durchschnitt,
    // anschließend selbes Punkteschema wie beim Einzelturnier als Bonuspunkte.
    // Schnitt für alle Spieler mit Ergebnis (zur Anzeige); Bonus nur ab 3 Teilnahmen.
    const schnittData = Object.entries(playerTournamentScores)
      .map(([playerId, tScores]) => {
        const best5 = [...tScores].sort((a, b) => b - a).slice(0, 5);
        const avg = best5.reduce((s, v) => s + v, 0) / best5.length;
        return { playerId, schnitt: avg, count: tScores.length };
      });
    const bonusData = schnittData
      .filter(e => e.count >= 3) // Bonus erst ab 3 Teilnahmen
      .sort((a, b) => b.schnitt - a.schnitt);
    const schnittBonus = {};
    bonusData.forEach((entry, idx) => {
      schnittBonus[entry.playerId] = getFuturePoints(idx + 1, bonusData.length);
    });

    return Object.entries(playerPoints)
      .map(([playerId, points]) => {
        const sd = schnittData.find(s => s.playerId === playerId);
        const bonus = schnittBonus[playerId] || 0;
        return {
          playerId,
          name: getPlayerName(playerId),
          points: points + bonus,
          basePoints: points,
          bonusPoints: bonus,
          schnitt: sd ? Math.round(sd.schnitt * 10) / 10 : null,
          tournaments: playerTournaments[playerId] || 0,
          bestScore: playerBestScore[playerId] || 0,
        };
      })
      .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments);
  };

  // Wertung pro Altersklasse UND Geschlecht (Herren/Damen getrennt)
  const FUTURE_GROUPS = useMemo(
    () => ['Herren', 'Damen'].flatMap(gender =>
      FUTURE_AGE_CLASSES.map(ageClass => ({ gender, ageClass, key: `${gender}__${ageClass}` }))
    ),
    []
  );

  const rankings = useMemo(
    () => FUTURE_GROUPS.map(({ gender, ageClass, key }) => ({
      gender, ageClass, key,
      rows: buildRanking(ageClass, gender),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [FUTURE_GROUPS, finishedTournaments, results, scores, getPlayerName, playerMap, directPlayerMap, resultValidity]
  );

  if (isLoading) {
    return (
      <div className="p-8 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-7 h-7 text-emerald-500" />
            <h1 className="text-3xl font-bold text-foreground tracking-tight">9PinFuture Rangliste</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {activeSeason ? <span className="font-semibold text-primary">{activeSeason.name}</span> : 'Alle Saisonen'} · Nachwuchsserie · {finishedTournaments.length} Turnier{finishedTournaments.length !== 1 ? 'e' : ''}
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <p className="text-sm text-foreground">
          Die 9PinFuture-Serie ist eine eigenständige Wertung für Nachwuchsspieler. Pro Altersklasse (U-10, U-15, U-19) gibt es eine eigene Rangliste. Zusätzlich zur Summe der Turnierpunkte gibt es einen <strong>Gesamtschnitt-Bonus</strong>: die besten 5 von i.d.R. 6 Turnierergebnissen werden im Schnitt berechnet und danach mit demselben Punkteschema wie bei den Turnieren extra belohnt.
        </p>
      </div>

      {finishedTournaments.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-semibold text-foreground">Noch keine Daten</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Schließe ein 9PinFuture-Turnier ab, damit es hier erscheint.</p>
          <Link to="/tournaments" className="text-sm text-primary hover:underline">Zu den Turnieren →</Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Toggle – mobile only: Altersklasse (U-19 abwärts) */}
          <div className="flex lg:hidden items-center justify-center gap-2">
            {[...FUTURE_AGE_CLASSES].reverse().map(cls => (
              <button
                key={cls}
                onClick={() => setActiveClass(cls)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${classActiveBg(cls, activeClass === cls)}`}
              >
                {cls}
              </button>
            ))}
          </div>
          {[...FUTURE_AGE_CLASSES].reverse().map(ageClass => (
            <div key={ageClass} className={`${activeClass === ageClass ? 'block' : 'hidden'} lg:block`}>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">{ageClass}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {['Herren', 'Damen'].map(gender => {
                  const entry = rankings.find(r => r.gender === gender && r.ageClass === ageClass);
                  if (!entry) return null;
                  return (
                    <div key={entry.key}>
                      <FutureRankingTable
                        title={`${gender} ${ageClass}`} rows={entry.rows} colorClass={ageClass}
                        onSelect={(row) => setSelectedByClass(prev => ({ ...prev, [entry.key]: prev[entry.key]?.playerId === row?.playerId ? null : row }))}
                        selectedId={selectedByClass[entry.key]?.playerId}
                        selectedPlayer={selectedByClass[entry.key]}
                        playerMap={playerMap}
                        scores={scores} results={results} finishedTournaments={finishedTournaments}
                        tournaments={tournaments}
                        onClose={() => setSelectedByClass(prev => ({ ...prev, [entry.key]: null }))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent future tournaments */}
      {finishedTournaments.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Abgeschlossene 9PinFuture-Turniere</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {finishedTournaments.map(t => (
              <Link
                key={t.id}
                to={`/tournaments/${t.id}`}
                className="bg-card rounded-xl border border-border px-4 py-3 hover:border-emerald-400 transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.date ? format(new Date(t.date), 'dd. MMM yyyy', { locale: de }) : ''}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700">
                  9PinFuture
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FutureRankingTable({ title, rows, colorClass, onSelect, selectedId, selectedPlayer, playerMap, scores, results, finishedTournaments, tournaments, onClose }) {
  const headerColor = classColor(colorClass);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className={`font-bold text-base ${headerColor}`}>{title}</h2>
        <Link to="/future-ranking" className="text-xs text-primary hover:underline flex items-center gap-1">
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
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground w-12">#</th>
              <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Spieler</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground w-10">T</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground w-16">Ø-Schnitt</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground w-20">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedId === row.playerId;
              const showPanel = isSelected && selectedPlayer && rows.some(r => r.playerId === selectedPlayer.playerId);
              return (
                <Fragment key={row.playerId}>
                  <tr
                    onClick={() => onSelect(isSelected ? null : row)}
                    className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold ${medalColors[i] || 'bg-muted text-foreground'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-medium text-sm text-foreground">{row.name}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground text-center">{row.tournaments}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground text-center">
                      {row.schnitt != null ? row.schnitt : '–'}
                      {row.bonusPoints > 0 && (
                        <span className="block text-[10px] text-emerald-600 font-semibold">+{row.bonusPoints} Bonus</span>
                      )}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${i === 0 ? headerColor : 'text-foreground'}`}>
                      {row.points}
                    </td>
                  </tr>
                  {showPanel && (
                    <tr key={`panel-${row.playerId}`}>
                      <td colSpan={5} className="p-3 bg-muted/10">
                        <PlayerStatsPanel
                           playerId={selectedPlayer.playerId}
                           playerName={selectedPlayer.name}
                           player={playerMap[selectedPlayer.playerId]}
                           scores={scores}
                           results={results}
                           finishedTournaments={finishedTournaments}
                           tournaments={tournaments}
                           onClose={onClose}
                         />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}