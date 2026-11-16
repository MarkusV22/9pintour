import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, BarChart2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { getTierStyle, TIERS } from '@/lib/tournamentPoints';
import { usePlayerMap } from '@/lib/usePlayerMap';
import PlayerStatsPanel from '@/components/PlayerStatsPanel';

const medalColors = ['bg-amber-500 text-white', 'bg-gray-400 text-white', 'bg-amber-700 text-white'];

export default function Archiv() {
  const { playerMap, getPlayerName } = usePlayerMap();

  const { data: seasons = [], isLoading: loadingSeasons } = useQuery({
    queryKey: ['seasons'],
    queryFn: () => base44.entities.Season.list('-start_date', 50),
  });

  const pastSeasons = seasons.filter(s => !s.is_active);

  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const displaySeasonId = selectedSeasonId || (pastSeasons[0]?.id ?? null);
  const displaySeason = seasons.find(s => s.id === displaySeasonId) || null;

  const { data: tournaments = [] } = useQuery({
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

  // Filter tournaments to selected season
  const seasonTournaments = displaySeason
    ? tournaments.filter(t => {
        if (!t.date) return false;
        const d = t.date.slice(0, 10);
        return d >= displaySeason.start_date && d <= displaySeason.end_date;
      })
    : [];

  // Only include tournaments with formally awarded results
  const awardedTournamentIds = useMemo(() => new Set(results.map(r => r.tournament_id)), [results]);
  const finishedTournaments = seasonTournaments.filter(t =>
    t.status === 'abgeschlossen' &&
    !t.deleted_at &&
    awardedTournamentIds.has(t.id)
  );

  const [selectedHerren, setSelectedHerren] = useState(null);
  const [selectedDamen, setSelectedDamen] = useState(null);

  // Build ranking from TournamentResult records
  const buildRanking = (category) => {
    const playerPoints = {};
    const playerTournaments = {};
    const playerBestScore = {};

    finishedTournaments.forEach(tournament => {
      const tournamentResults = results.filter(r =>
        r.tournament_id === tournament.id && r.player_id && r.notes === category
      );
      tournamentResults.forEach(r => {
        playerPoints[r.player_id] = (playerPoints[r.player_id] || 0) + (r.points || 0);
        playerTournaments[r.player_id] = (playerTournaments[r.player_id] || 0) + 1;
        const best = scores
          .filter(s => s.player_id === r.player_id && s.tournament_id === tournament.id && s.score != null)
          .reduce((max, s) => Math.max(max, s.score), 0);
        if (playerBestScore[r.player_id] === undefined || best > playerBestScore[r.player_id]) {
          playerBestScore[r.player_id] = best;
        }
      });
    });

    return Object.entries(playerPoints)
      .map(([playerId, points]) => ({
        playerId,
        name: getPlayerName(playerId),
        points,
        tournaments: playerTournaments[playerId] || 0,
        bestScore: playerBestScore[playerId] || 0,
      }))
      .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments);
  };

  const herren = displaySeason ? buildRanking('Herren') : [];
  const damen = displaySeason ? buildRanking('Damen') : [];

  if (loadingSeasons) {
    return <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>;
  }

  if (pastSeasons.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">Archiv</h1>
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border mt-8">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-semibold text-foreground">Noch kein Archiv vorhanden</p>
          <p className="text-sm text-muted-foreground mt-1">Sobald eine Saison abgeschlossen ist, erscheint sie hier.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Archiv</h1>
          <p className="text-muted-foreground mt-1 text-sm">Vergangene Saisonen</p>
        </div>

        {/* Season Selector */}
        <div className="relative">
          <select
            value={displaySeasonId || ''}
            onChange={e => { setSelectedSeasonId(e.target.value); setSelectedHerren(null); setSelectedDamen(null); }}
            className="appearance-none bg-card border border-border rounded-xl px-4 py-2 pr-8 text-sm font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {pastSeasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {displaySeason && (
        <div className="mb-4 text-sm text-muted-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {format(new Date(displaySeason.start_date), 'dd. MMMM yyyy', { locale: de })} – {format(new Date(displaySeason.end_date), 'dd. MMMM yyyy', { locale: de })}
          <span className="text-border">·</span>
          {finishedTournaments.length} Turnier{finishedTournaments.length !== 1 ? 'e' : ''} abgeschlossen
        </div>
      )}

      {/* Tier legend */}
      <div className="flex gap-2 flex-wrap mb-6">
        {TIERS.map(t => (
          <span key={t.value} className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.color}`}>
            {t.label}
          </span>
        ))}
        <span className="text-xs text-muted-foreground self-center ml-1 hidden md:inline">→ Sieger erhält {['2000','1000','500','250','125','0'].join(' / ')} Punkte</span>
      </div>

      {/* Rankings */}
      {finishedTournaments.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border mb-6">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Keine abgeschlossenen Turniere in dieser Saison.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <RankingTable
            title="Herren" rows={herren} color="blue"
            onSelect={setSelectedHerren} selectedId={selectedHerren?.playerId}
            selectedPlayer={selectedHerren} playerMap={playerMap}
            scores={scores} results={results} finishedTournaments={finishedTournaments}
            tournaments={tournaments}
            onClose={() => setSelectedHerren(null)}
          />
          <RankingTable
            title="Damen" rows={damen} color="pink"
            onSelect={setSelectedDamen} selectedId={selectedDamen?.playerId}
            selectedPlayer={selectedDamen} playerMap={playerMap}
            scores={scores} results={results} finishedTournaments={finishedTournaments}
            tournaments={tournaments}
            onClose={() => setSelectedDamen(null)}
          />
        </div>
      )}

      {/* Tournament List */}
      {seasonTournaments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Turniere dieser Saison</h2>
          <div className="space-y-3">
            {seasonTournaments.map(t => (
              <Link
                key={t.id}
                to={`/tournaments/${t.id}`}
                className="flex items-center justify-between p-3 md:p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm group-hover:text-primary truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {t.date ? format(new Date(t.date), 'dd. MMM yyyy', { locale: de }) : ''}
                      {t.location && <span className="hidden sm:inline"> · {t.location}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.tier && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getTierStyle(t.tier)}`}>
                      {t.tier}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.status === 'abgeschlossen' ? 'bg-green-100 text-green-700' :
                    t.status === 'laufend' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{t.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RankingTable({ title, rows, color, onSelect, selectedId, selectedPlayer, playerMap, scores, results, finishedTournaments, tournaments, onClose }) {
  const headerColor = color === 'blue' ? 'text-blue-600' : 'text-pink-600';
  const accentColor = color === 'blue' ? 'text-blue-600' : 'text-pink-600';

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border">
        <h2 className={`font-bold text-base md:text-lg ${headerColor}`}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Keine Daten</div>
      ) : (
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left py-2 px-3 md:px-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10 md:w-14">#</th>
              <th className="text-left py-2 px-3 md:px-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[45%]">Spieler</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">T</th>
              <th className="text-right py-2 px-3 md:px-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedId === row.playerId;
              const showPanel = isSelected && selectedPlayer && rows.some(r => r.playerId === selectedPlayer.playerId);
              return (
                <>
                  <tr
                    key={row.playerId}
                    onClick={() => onSelect(isSelected ? null : row)}
                    className={`border-b border-border hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-2.5 px-3 md:px-5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-lg text-[11px] md:text-xs font-bold ${medalColors[i] || 'bg-muted text-foreground'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 md:px-5 font-medium text-foreground text-sm break-words min-w-0">{row.name}</td>
                    <td className="py-2.5 px-2 text-center text-xs text-muted-foreground">{row.tournaments}</td>
                    <td className={`py-2.5 px-3 md:px-5 text-right font-bold text-base md:text-lg ${i === 0 ? accentColor : 'text-foreground'}`}>
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
                          tournaments={tournaments}
                          onClose={onClose}
                          accentColor={accentColor}
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