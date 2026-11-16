import { getPoints, getTierStyle } from '@/lib/tournamentPoints';
import { isWalkover, isNoShow } from '@/components/ScoreEntryCard';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { X, Star, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export function parseBahnen(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
}

export function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export default function PlayerStatsPanel({ playerId, playerName, player, scores, results, finishedTournaments, relevantTournaments, tournaments = [], onClose, accentColor = 'text-primary' }) {
  // Relevant Turniere = abgeschlossene + laufende/geplante (mit Scores), gleiche Saison-Scope wie Rangliste
  const relevantList = relevantTournaments || finishedTournaments;
  const relevantTournamentIds = new Set(relevantList.map(t => t.id));
  const allPlayerScores = scores.filter(s => 
    relevantTournamentIds.has(s.tournament_id) && s.player_id === playerId && s.score != null
  );
  
  // Parse voll/abraeumen/fehlwurf from notes (supports both Bahnen-mode and Gesamt-mode)
  const parseVAF = (notesStr) => {
    try {
      const p = JSON.parse(notesStr || '');
      if (Array.isArray(p)) {
        return {
          voll: p.reduce((s, r) => s + (parseInt(r.voll) || 0), 0),
          abr: p.reduce((s, r) => s + (parseInt(r.abraeumen) || 0), 0),
          feh: p.reduce((s, r) => s + (parseInt(r.fehlwurf) || 0), 0),
        };
      }
      if (p && typeof p === 'object') {
        const v = parseInt(p.voll); const a = parseInt(p.abraeumen); const f = parseInt(p.fehlwurf);
        return { voll: isNaN(v) ? null : v, abr: isNaN(a) ? null : a, feh: isNaN(f) ? null : f };
      }
    } catch {}
    return { voll: null, abr: null, feh: null };
  };

  // Deduplicate: one best score per tournament (player may appear in multiple teams).
  // Bei Kegelgleichstand gewinnt der Eintrag mit mehr abgeräumten Würfen.
  const bestPerTournament = {};
  allPlayerScores.forEach(s => {
    const current = bestPerTournament[s.tournament_id];
    if (!current) { bestPerTournament[s.tournament_id] = s; return; }
    if (s.score > current.score) {
      bestPerTournament[s.tournament_id] = s;
    } else if (s.score === current.score && parseVAF(s.notes).abr > parseVAF(current.notes).abr) {
      bestPerTournament[s.tournament_id] = s;
    }
  });
  const playerScores = Object.values(bestPerTournament);

  // W.O.-Spiele (vorzeitiger Abbruch) nicht in den Schnitt einbeziehen
  const scoredTournaments = playerScores.filter(s => !isWalkover(s.notes) && !isNoShow(s.notes));

  // Overall player averages — one entry per tournament (ohne W.O.)
  const playerAvgVoll = avg(scoredTournaments.map(s => parseVAF(s.notes).voll));
  const playerAvgAbraeumen = avg(scoredTournaments.map(s => parseVAF(s.notes).abr));
  const playerAvgFehlwurf = avg(scoredTournaments.map(s => parseVAF(s.notes).feh));
  const playerAvgScore = avg(scoredTournaments.map(s => s.score));

  const tournamentCount = new Set(playerScores.map(s => s.tournament_id)).size;

  // Count final tournament wins (position 1 in any completed final tournament — across ALL seasons)
  const allFinalTournamentIds = new Set(tournaments.filter(t => t.mode === 'final' && t.status === 'abgeschlossen' && !t.deleted_at).map(t => t.id));
  const finalWins = (results || []).filter(r => r.player_id === playerId && r.position === 1 && allFinalTournamentIds.has(r.tournament_id)).length;

  // Best score per tournament
  const tournamentBestScores = relevantList.map(t => {
    const tScores = playerScores.filter(s => s.tournament_id === t.id);
    if (tScores.length === 0) return null;
    const bestEntry = tScores.reduce((best, s) => s.score > best.score ? s : best, tScores[0]);
    const category = bestEntry.category;
    
    // Get official position from TournamentResult (formally awarded)
    const resultRecord = results?.find(r => r.tournament_id === t.id && r.player_id === playerId);
    const position = resultRecord?.position || 0;
    
    const { voll, abr, feh } = parseVAF(bestEntry.notes);
    const wo = isWalkover(bestEntry.notes);
    const noShow = isNoShow(bestEntry.notes);
    const isRunning = t.status !== 'abgeschlossen';

    return { tournament: t, position, voll, abr, feh, score: bestEntry.score, wo, noShow, isRunning };
  }).filter(Boolean);

  const fmt1 = (v) => v != null ? v.toFixed(1) : '–';

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          {player?.photo_url ? (
            <img src={player.photo_url} className="w-7 h-7 rounded-full object-cover" alt={playerName} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              {playerName?.[0] || '?'}
            </div>
          )}
          <div>
            <p className="font-bold text-foreground text-xs leading-tight">{playerName}</p>
            {player?.club && <p className="text-[10px] text-muted-foreground leading-tight">{player.club}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link to={`/stats?id=${playerId}`} className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">
            <ExternalLink className="w-2.5 h-2.5" /> Details
          </Link>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="px-2 py-1.5 text-center">
          <p className="text-sm font-bold text-foreground">{tournamentCount}</p>
          <p className="text-[10px] text-muted-foreground">Turniere</p>
        </div>
        <div className="px-2 py-1.5 text-center">
          <p className="text-sm font-bold text-primary">{fmt1(playerAvgScore)}</p>
          <p className="text-[10px] text-muted-foreground">Ø Score</p>
        </div>
        <div className="px-2 py-1.5 text-center">
          <p className="text-sm font-bold text-amber-500 flex items-center justify-center gap-0.5">
            {finalWins > 0 && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
            {finalWins}
          </p>
          <p className="text-[10px] text-muted-foreground">Finalsiege</p>
        </div>
      </div>

      {/* Player overall stats */}
      <div className="px-3 py-3 border-b border-border">
        <div className="rounded overflow-hidden border border-border">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-2 py-1 font-semibold text-muted-foreground"></th>
                <th className="text-center px-1 py-1 font-semibold text-muted-foreground">Volle</th>
                <th className="text-center px-1 py-1 font-semibold text-muted-foreground">Abräumen</th>
                <th className="text-center px-1 py-1 font-semibold text-muted-foreground">Fehlwurf</th>
                <th className="text-center px-1 py-1 font-semibold text-muted-foreground">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border bg-primary/5">
                <td className="px-2 py-1 font-semibold text-foreground">Ø gesamt</td>
                <td className="px-1 py-1 text-center font-bold text-primary">{fmt1(playerAvgVoll)}</td>
                <td className="px-1 py-1 text-center font-bold text-primary">{fmt1(playerAvgAbraeumen)}</td>
                <td className="px-1 py-1 text-center font-bold text-amber-600">{fmt1(playerAvgFehlwurf)}</td>
                <td className="px-1 py-1 text-center font-bold text-primary">{fmt1(playerAvgScore)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Tournament best scores */}
      {tournamentBestScores.length > 0 && (
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center justify-between py-1 px-2 mb-2 text-[9px]">
            <span className="font-semibold text-muted-foreground flex-1 mr-2">Turnier</span>
            <span className="text-muted-foreground flex-shrink-0 w-6 text-right">Pl.</span>
            <span className="text-muted-foreground font-semibold flex-shrink-0 w-8 text-right">Volle</span>
            <span className="text-muted-foreground font-semibold flex-shrink-0 w-8 text-right">Abr.</span>
            <span className="text-muted-foreground font-semibold flex-shrink-0 w-8 text-right">Fehl.</span>
            <span className="text-muted-foreground font-semibold flex-shrink-0 w-8 text-right">Ges.</span>
          </div>
          <div className="space-y-1 text-[9px]">
            {tournamentBestScores.map(t => (
              <div key={t.tournament.id} className="flex items-center justify-between py-1 px-2 bg-muted/10 rounded hover:bg-muted/20 transition-colors">
                <span className="font-medium text-foreground flex-1 truncate mr-2 flex items-center gap-1.5">
                  {t.tournament.name}
                  {t.isRunning && <span className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1 py-px rounded-full bg-amber-100 text-amber-700 border border-amber-300 whitespace-nowrap">läuft</span>}
                </span>
                <span className="text-muted-foreground flex-shrink-0">{t.position > 0 ? `${t.position}.` : '–'}</span>
                <span className="text-primary font-bold flex-shrink-0 w-8 text-right">{fmt1(t.voll)}</span>
                <span className="text-primary font-bold flex-shrink-0 w-8 text-right">{fmt1(t.abr)}</span>
                <span className="text-amber-600 font-bold flex-shrink-0 w-8 text-right">{fmt1(t.feh)}</span>
                <span className={`font-bold flex-shrink-0 w-8 text-right ${t.wo ? 'text-amber-500' : t.noShow ? 'text-red-500' : 'text-primary'}`}>{t.wo ? 'W.O.' : t.noShow ? 'N.S.' : fmt1(t.score)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}