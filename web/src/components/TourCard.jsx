import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getPoints } from '@/lib/tournamentPoints';
import { User, Trophy, Calendar, Hash, MapPin, Star } from 'lucide-react';
import { useSeasons } from '@/lib/useSeason';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

function calcAgeClass(birthDateStr) {
  if (!birthDateStr) return 'Allgemeine Klasse';
  const birth = new Date(birthDateStr);
  // Stichtag 1. Juli des laufenden Jahres (saisonüblich)
  const ref = new Date(new Date().getFullYear(), 6, 1);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age < 10) return 'U-10';
  if (age < 15) return 'U-15';
  if (age < 19) return 'U-19';
  if (age < 23) return 'U-23';
  if (age < 50) return 'Allgemeine Klasse';
  if (age < 60) return 'Ü-50';
  return 'Ü-60';
}

function useRankingPosition(player) {
  const { activeSeason } = useSeasons();

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 500),
  });
  const { data: scores = [] } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
  });
  const { data: allPlayers = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('name', 9999),
  });
  const { data: allResults = [] } = useQuery({
    queryKey: ['all-results'],
    queryFn: () => base44.entities.TournamentResult.list('-created_date', 5000),
  });

  const position = useMemo(() => {
    if (!player?.id || !player?.category) return null;
    const playerMap = {};
    allPlayers.forEach(p => { playerMap[p.id] = p; });

    const seasonTournaments = activeSeason
      ? tournaments.filter(t => t.date && t.date.slice(0,10) >= activeSeason.start_date && t.date.slice(0,10) <= activeSeason.end_date)
      : tournaments;
    const finished = seasonTournaments.filter(t => t.status === 'abgeschlossen');
    const category = player.category;

    const playerPoints = {};
    finished.forEach(tournament => {
      const tier = tournament.tier || 'Masters 250';
      const catScores = scores.filter(s => {
        if (!s.player_id || s.score == null) return false;
        if (s.tournament_id !== tournament.id) return false;
        const pc = playerMap[s.player_id]?.category;
        return pc ? pc === category : s.category === category;
      });
      const playerBest = {};
      catScores.forEach(s => {
        if (playerBest[s.player_id] === undefined || s.score > playerBest[s.player_id]) {
          playerBest[s.player_id] = s.score;
        }
      });
      const ranked = Object.entries(playerBest).sort((a, b) => b[1] - a[1]);
      ranked.forEach(([pid], i) => {
        const pts = getPoints(tier, i + 1);
        playerPoints[pid] = (playerPoints[pid] || 0) + pts;
      });
    });

    const sorted = Object.entries(playerPoints).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([pid]) => pid === player.id);

    // Count final tournament wins (position 1 in any completed final tournament — across ALL seasons)
    const allFinalTournamentIds = new Set(
      tournaments.filter(t => t.mode === 'final' && t.status === 'abgeschlossen' && !t.deleted_at).map(t => t.id)
    );
    const finalWins = allResults.filter(r => r.player_id === player.id && r.position === 1 && allFinalTournamentIds.has(r.tournament_id)).length;

    return {
      position: idx >= 0 ? idx + 1 : null,
      points: playerPoints[player.id] || 0,
      total: sorted.length,
      finalWins,
    };
  }, [player, tournaments, scores, allPlayers, activeSeason, allResults]);

  return position;
}

export default function TourCard({ player }) {
  const ranking = useRankingPosition(player);

  const fullName = player
    ? `${player.first_name || ''} ${player.last_name || ''}`.trim()
    : '';

  const ageClass = calcAgeClass(player?.birth_date);
  const birthFormatted = player?.birth_date
    ? format(new Date(player.birth_date), 'dd. MMM yyyy', { locale: de })
    : null;

  const isHerren = player?.category === 'Herren';
  const accentFrom = isHerren ? 'from-blue-700' : 'from-pink-600';
  const accentTo = isHerren ? 'to-blue-900' : 'to-pink-900';
  const accentBorder = isHerren ? 'border-blue-400/30' : 'border-pink-400/30';
  const accentText = isHerren ? 'text-blue-300' : 'text-pink-300';
  const accentBg = isHerren ? 'bg-blue-500/20' : 'bg-pink-500/20';

  return (
    <div className="relative w-full max-w-sm mx-auto select-none">
      {/* Card */}
      <div className={`relative rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br ${accentFrom} ${accentTo} border ${accentBorder}`}>

        {/* Top decorative stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-white/10 via-white/40 to-white/10" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${accentText} opacity-80`}>Tour Card</p>
            <p className="text-white/60 text-xs mt-0.5">{player?.category || '—'}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-full ${accentBg} border ${accentBorder}`}>
            <span className="text-white text-xs font-bold tracking-wide">
              {player?.number ? `#${player.number}` : '—'}
            </span>
          </div>
        </div>

        {/* Avatar + Name */}
        <div className="px-6 pb-5 flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center shadow-lg">
              {player?.photo_url
                ? <img src={player.photo_url} alt={fullName} className="w-full h-full object-cover" />
                : <User className="w-10 h-10 text-white/40" />
              }
            </div>
            {/* Ranking badge on avatar */}
            {ranking?.position && (
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-400 border-2 border-white/30 flex items-center justify-center shadow">
                <span className="text-xs font-black text-amber-900">{ranking.position}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-xl leading-tight truncate">{fullName || '—'}</p>
            {player?.club && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <MapPin className="w-3 h-3 text-white/50 flex-shrink-0" />
                <p className={`text-sm ${accentText} truncate`}>{player.club}</p>
              </div>
            )}
            {ranking?.finalWins > 0 && (
              <div className="flex items-center gap-0.5 mt-1.5">
                {Array.from({ length: Math.min(ranking.finalWins, 5) }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
                {ranking.finalWins > 5 && (
                  <span className="text-amber-300 text-xs font-bold ml-0.5">+{ranking.finalWins - 5}</span>
                )}
                <span className="text-white/50 text-[10px] uppercase tracking-wide ml-1.5">Finalsiege</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider with notches */}
        <div className="relative flex items-center px-0 my-1">
          <div className="absolute -left-4 w-8 h-8 rounded-full bg-background" />
          <div className="absolute -right-4 w-8 h-8 rounded-full bg-background" />
          <div className="w-full mx-5 border-t border-dashed border-white/20" />
        </div>

        {/* Stats grid */}
        <div className="px-6 pt-4 pb-5 grid grid-cols-2 gap-3">
          {/* Age class */}
          <div className={`rounded-xl ${accentBg} px-3 py-3 flex flex-col items-center gap-1`}>
            <Hash className="w-4 h-4 text-white/50" />
            <p className={`font-bold text-sm ${accentText} text-center leading-tight`}>
              {ageClass}
            </p>
            <p className="text-white/40 text-[10px] uppercase tracking-wide">Altersklasse</p>
          </div>

          {/* Ranking */}
          <div className={`rounded-xl ${accentBg} px-3 py-3 flex flex-col items-center gap-1`}>
            <Trophy className="w-4 h-4 text-amber-400/80" />
            <p className="text-white font-black text-lg leading-none">
              {ranking?.position ? `${ranking.position}.` : '—'}
            </p>
            <p className="text-white/40 text-[10px] uppercase tracking-wide">Rang</p>
          </div>

          {/* Birth date */}
          <div className={`rounded-xl ${accentBg} px-3 py-3 flex flex-col items-center gap-1`}>
            <Calendar className="w-4 h-4 text-white/50" />
            <p className="text-white font-semibold text-xs text-center leading-tight">
              {birthFormatted || '—'}
            </p>
            <p className="text-white/40 text-[10px] uppercase tracking-wide">Geburtstag</p>
          </div>

          {/* Personal Best */}
          <div className={`rounded-xl ${accentBg} px-3 py-3 flex flex-col items-center gap-1`}>
            <span className="text-base leading-none">🏆</span>
            <p className="text-white font-black text-lg leading-none">
              {player?.personal_best || '—'}
            </p>
            <p className="text-white/40 text-[10px] uppercase tracking-wide">Personal Best</p>
          </div>
        </div>

        {/* Points bar (only if has points) */}
        {ranking?.points > 0 && (
          <div className="px-6 pb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white/50 text-xs">Ranglistenpunkte</span>
              <span className="text-white font-bold text-sm">{ranking.points} Pts</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, ranking.total > 1 ? ((ranking.total - ranking.position + 1) / ranking.total) * 100 : 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Bottom barcode decoration */}
        <div className="px-6 pb-5 flex items-center gap-1 justify-center opacity-20">
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} className={`bg-white rounded-sm ${i % 3 === 0 ? 'w-0.5 h-5' : i % 5 === 0 ? 'w-1 h-5' : 'w-0.5 h-3'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}