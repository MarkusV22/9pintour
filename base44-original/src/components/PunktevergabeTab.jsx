import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, CheckCircle2, Trophy, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getPoints, getFuturePoints, TIERS, FUTURE_AGE_CLASSES, FUTURE_APPEARANCE_POINTS } from '@/lib/tournamentPoints';
import { getCoOrganizerEmails } from '@/lib/coOrganizers';
import { isWalkover, isNoShow } from '@/components/ScoreEntryCard';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { collectPlayerEntries } from '@/lib/collectPlayerEntries';

const CATEGORIES = ['Herren', 'Damen', 'Mixed'];

const catColor = (cat) =>
cat === 'Herren' ? 'text-blue-600' :
cat === 'Damen' ? 'text-pink-600' : 'text-purple-600';

const medalBg = (i) =>
i === 0 ? 'bg-amber-400 text-white' :
i === 1 ? 'bg-gray-300 text-gray-800' :
i === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-foreground';

export default function PunktevergabeTab({ tournamentId, teams, scores, schedules = [], tournament, isAdmin = false }) {
  const queryClient = useQueryClient();
  const { getPlayerName, playerMap } = usePlayerMap();
  const { data: results = [] } = useQuery({
    queryKey: ['results', tournamentId],
    queryFn: () => base44.entities.TournamentResult.filter({ tournament_id: tournamentId })
  });

  const saveMutation = useMutation({
    mutationFn: async (entries) => {
      for (const { player_id, position, points, category } of entries) {
        const existing = results.find((r) => r.player_id === player_id && r.tournament_id === tournamentId);
        if (existing) {
          await base44.entities.TournamentResult.update(existing.id, { position, points });
        } else {
          await base44.entities.TournamentResult.create({ tournament_id: tournamentId, player_id, position, points, notes: category, co_organizer_emails: getCoOrganizerEmails(tournament) });
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['results', tournamentId] })
  });

  // Build ranked players per category from scores (using player_id)
  // For Mixed teams: players are ranked within their own gender category, not Mixed
  const rankedByCategory = useMemo(() => {
    // Collect all players from all teams with their scores
    // Helper: parse abraeumen + fehlwurf from notes for tiebreaker
    const parseAbrFeh = (notesStr) => {
      try {
        const p = JSON.parse(notesStr || '');
        if (Array.isArray(p)) return { abr: p.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0), feh: p.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0) };
        if (p && typeof p === 'object') return { abr: parseInt(p.abraeumen) || null, feh: parseInt(p.fehlwurf) || null };
      } catch {}
      return { abr: null, feh: null };
    };
    const allPlayerScores = {};
    collectPlayerEntries(teams, scores, schedules, playerMap, true, tournament?.series_type === 'future').forEach(({ playerId, teamName, teamCategory, score, notes }) => {
      if (isNoShow(notes)) return; // No-Show: komplett aus der Wertung entfernt
      const { abr, feh } = parseAbrFeh(notes);
      const cur = allPlayerScores[playerId];
      const better = !cur || (score !== null && (cur.score === null || score > cur.score || (score === cur.score && (abr ?? -1) > (cur.abraeumen ?? -1))));
      if (better) {
        allPlayerScores[playerId] = { playerId, playerName: getPlayerName(playerId), team: teamName, score, abraeumen: abr, fehlwurf: feh, teamCategory, notes };
      }
    });

    // Future-Serie: Wertung pro Altersklasse UND Geschlecht (Herren/Damen getrennt),
    // Standard-Serie: Gruppierung nach Geschlecht
    const isFuture = tournament?.series_type === 'future';
    // Future: Kombinationen Herren/Damen × Altersklasse; Standard: Herren/Damen/Mixed
    const groupKeys = isFuture ?
    ['Herren', 'Damen'].flatMap((g) => FUTURE_AGE_CLASSES.map((a) => `${g}__${a}`)) :
    CATEGORIES;
    const byGroup = {};
    Object.values(allPlayerScores).forEach((item) => {
      let key;
      if (isFuture) {
        const age = playerMap[item.playerId]?.age_class || 'Sonstige';
        const gender = playerMap[item.playerId]?.category || 'Herren';
        key = `${gender}__${age}`;
      } else {
        key = playerMap[item.playerId]?.category || item.teamCategory;
      }
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(item);
    });

    return groupKeys.map((cat) => {
      const players = byGroup[cat];
      if (!players?.length) return null;
      players.sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        if (b.score !== a.score) return b.score - a.score;
        if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
        return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
      });
      // Future-Serie: Punkte je Gruppe (Altersklasse + Geschlecht) aus Antritt + Platzierung.
      // W.O.-Spieler: NUR 2 Antrittspunkte, keine Platzierungspunkte,
      // zählen nicht zur Teilnehmerzahl der Platzierungswertung.
      if (isFuture) {
        const scoredCount = players.filter((p) => p.score !== null && !isWalkover(p.notes)).length;
        let scoredRank = 0;
        players.forEach((p) => {
          if (isWalkover(p.notes)) { p.futurePoints = FUTURE_APPEARANCE_POINTS; }
          else if (p.score === null) { p.futurePoints = 0; }
          else { scoredRank += 1; p.futurePoints = getFuturePoints(scoredRank, scoredCount); }
        });
      }
      return { cat, players };
    }).filter(Boolean);
  }, [teams, scores, schedules, getPlayerName, playerMap, tournament]);

  const tier = tournament?.tier || 'Masters 250';
  const isFuture = tournament?.series_type === 'future';

  const getPointValue = (playerId) => {
    const r = results.find((r) => r.player_id === playerId);
    return r ? String(r.points ?? '') : '';
  };

  if (rankedByCategory.length === 0) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
        <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Keine Mannschaften vorhanden.</p>
      </div>);

  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between bg-card border border-border rounded-xl px-5 py-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Turnierkategorie:</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
          TIERS.find((t) => t.value === tier)?.color ?? 'bg-muted text-foreground'}`
          }>{tier}</span>
        </div>
        
      </div>

      {(() => {
        const isHer = (c) => c.startsWith('Herren');
        const isDam = (c) => c.startsWith('Damen');
        const herren = rankedByCategory.filter((t) => isHer(t.cat));
        const damen = rankedByCategory.filter((t) => isDam(t.cat));
        const others = rankedByCategory.filter((t) => !isHer(t.cat) && !isDam(t.cat));
        const render = (t) =>
        <PointTable key={t.cat} cat={t.cat} players={t.players} isFuture={isFuture} tier={tier} getPointValue={getPointValue} />;

        return (
          <>
            {(herren.length > 0 || damen.length > 0) &&
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <div className="space-y-5">{herren.map(render)}</div>
                <div className="space-y-5">{damen.map(render)}</div>
              </div>
            }
            {others.length > 0 &&
            <div className="space-y-5">{others.map(render)}</div>
            }
          </>);

      })()}
      </div>);

}

function PointTable({ cat, players, isFuture, tier, getPointValue }) {
  const isFutureGroup = cat.includes('__');
  const [gender, ageClass] = isFutureGroup ? cat.split('__') : [cat, ''];
  const title = isFutureGroup ? `${gender} – ${ageClass}` : cat;
  const headerColor = isFutureGroup ? catColor(gender) : catColor(cat);
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className={`font-bold text-base ${headerColor}`}>{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left py-2 px-4 text-xs font-semibold text-muted-foreground w-12">#</th>
              <th className="text-left py-2 px-4 text-xs font-semibold text-muted-foreground">Spieler</th>
              <th className="text-center py-2 px-4 text-xs font-semibold text-muted-foreground">Score</th>
              <th className="text-center py-2 px-4 text-xs font-semibold text-muted-foreground w-36">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {players.map((item, i) =>
            <tr key={item.playerId} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${medalBg(i)}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium text-sm text-foreground">{item.playerName}</div>
                  <div className="text-xs text-muted-foreground">{item.team}</div>
                </td>
                <td className="py-3 px-4 text-center font-bold text-primary">
                  {isWalkover(item.notes) ? <span className="text-amber-500 text-sm">W.O.</span> : (item.score ?? <span className="text-muted-foreground text-xs">–</span>)}
                </td>
                <td className="py-3 px-4">
                  <span className="block text-center font-bold text-foreground">
                    {item.score === null ?
                  <span className="text-muted-foreground text-xs">–</span> :
                  getPointValue(item.playerId) || String(isFuture ? item.futurePoints : getPoints(tier, i + 1))}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>);

}