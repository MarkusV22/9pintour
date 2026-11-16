import { useState, useCallback, useMemo, useRef, Fragment } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PlayerScoreRow } from '@/components/ScoreEntryCard';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { getCoOrganizerEmails } from '@/lib/coOrganizers';
import { CheckCircle2, Clock, ChevronDown, ChevronRight, AlertCircle, Trophy, Users } from 'lucide-react';

// Parse score notes for tiebreakers (volle, abraeumen, fehlwurf)
function parseVA(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) {
      return { voll: parseInt(parsed.voll) || 0, abraeumen: parseInt(parsed.abraeumen) || 0, fehlwurf: parseInt(parsed.fehlwurf) || 0 };
    }
    if (Array.isArray(parsed)) {
      return {
        voll: parsed.reduce((s, b) => s + (parseInt(b.voll) || 0), 0),
        abraeumen: parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0),
        fehlwurf: parsed.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0),
      };
    }
  } catch {}
  return { voll: 0, abraeumen: 0, fehlwurf: 0 };
}

// Lane assignment pattern within each batch of 4 players:
// Player 1 → Lane 1, Player 2 → Lane 3, Player 3 → Lane 4, Player 4 → Lane 2
const LANE_ORDER = [1, 3, 4, 2];

const GROUP_CONFIGS = [
  { gender: 'Herren', group: 'A', headerColor: 'text-blue-600', borderColor: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  { gender: 'Herren', group: 'B', headerColor: 'text-blue-600', borderColor: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  { gender: 'Damen',  group: 'A', headerColor: 'text-pink-600',  borderColor: 'border-pink-200',  badge: 'bg-pink-100 text-pink-700' },
  { gender: 'Damen',  group: 'B', headerColor: 'text-pink-600',  borderColor: 'border-pink-200',  badge: 'bg-pink-100 text-pink-700' },
];

export default function FinalGroupPhase({ tournament, scores, isOwner }) {
  const queryClient = useQueryClient();
  const { getPlayerName } = usePlayerMap();
  const id = tournament.id;
  const laneCount = tournament.lane_count || 4;

  const finalGroups = useMemo(() => {
    try { return JSON.parse(tournament.final_groups || '{}'); } catch { return {}; }
  }, [tournament]);

  const qualifiers = finalGroups.qualifiers || { Herren: [], Damen: [] };
  const groups = finalGroups.groups || {};

  // Helper: find which group (A or B) a player belongs to
  const findGroup = useCallback((playerId, gender) => {
    if (groups[gender]?.A?.includes(playerId)) return 'A';
    if (groups[gender]?.B?.includes(playerId)) return 'B';
    return 'A';
  }, [groups]);

  // Build rounds: H1-N, D1-N, H(N+1)-2N, D(N+1)-2N, ...
  const rounds = useMemo(() => {
    const maxBatches = Math.max(
      Math.ceil((qualifiers.Herren?.length || 0) / laneCount),
      Math.ceil((qualifiers.Damen?.length || 0) / laneCount)
    );
    const result = [];
    for (let i = 0; i < maxBatches; i++) {
      const herrenBatch = (qualifiers.Herren || []).slice(i * laneCount, (i + 1) * laneCount);
      const damenBatch = (qualifiers.Damen || []).slice(i * laneCount, (i + 1) * laneCount);
      if (herrenBatch.length > 0) {
        result.push({
          gender: 'Herren', players: herrenBatch,
          range: `${i * laneCount + 1}–${i * laneCount + herrenBatch.length}`,
          label: `Durchgang ${result.length + 1}`,
        });
      }
      if (damenBatch.length > 0) {
        result.push({
          gender: 'Damen', players: damenBatch,
          range: `${i * laneCount + 1}–${i * laneCount + damenBatch.length}`,
          label: `Durchgang ${result.length + 1}`,
        });
      }
    }
    return result;
  }, [qualifiers, laneCount]);

  const saveTimers = useRef({});
  const [savingKeys, setSavingKeys] = useState({});
  const [savedKeys, setSavedKeys] = useState({});
  const [dirtyKeys, setDirtyKeys] = useState({});
  const [collapsed, setCollapsed] = useState({});

  const saveScoreMutation = useMutation({
    mutationFn: async ({ player_id, score, bahnen_json, category, group }) => {
      const existing = scores.find(s => s.player_id === player_id && s.group === group);
      if (existing) {
        await base44.entities.TournamentScore.update(existing.id, { score, notes: bahnen_json || '' });
      } else {
        await base44.entities.TournamentScore.create({
          tournament_id: id,
          team_id: '',
          player_id,
          score,
          notes: bahnen_json || '',
          category,
          group,
          co_organizer_emails: getCoOrganizerEmails(tournament),
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scores', id] }),
  });

  const handleChange = useCallback((group, category, playerData) => {
    const key = `${group}::${playerData.player_id}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    setSavingKeys(prev => ({ ...prev, [key]: true }));
    setSavedKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
    setDirtyKeys(prev => ({ ...prev, [key]: true }));
    saveTimers.current[key] = setTimeout(async () => {
      await saveScoreMutation.mutateAsync({ ...playerData, category, group });
      setSavingKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
      setSavedKeys(prev => ({ ...prev, [key]: true }));
      setDirtyKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
      setTimeout(() => setSavedKeys(prev => { const n = { ...prev }; delete n[key]; return n; }), 2000);
    }, 1500);
  }, [saveScoreMutation]);

  const isSlotFullyDone = useCallback((players, gender) => {
    return players.every(pid => {
      const group = findGroup(pid, gender);
      const key = `${group}::${pid}`;
      if (dirtyKeys[key] || savingKeys[key]) return false;
      return scores.some(s => s.player_id === pid && s.group === group && s.score != null);
    });
  }, [scores, dirtyKeys, savingKeys, findGroup]);

  const toggleRound = (roundIdx, players, gender) => {
    const key = `round::${roundIdx}`;
    if (key in collapsed) {
      setCollapsed(prev => ({ ...prev, [key]: !collapsed[key] }));
    } else {
      setCollapsed(prev => ({ ...prev, [key]: !isSlotFullyDone(players, gender) }));
    }
  };

  const isRoundOpen = (roundIdx, players, gender) => {
    const key = `round::${roundIdx}`;
    if (key in collapsed) return !collapsed[key];
    return !isSlotFullyDone(players, gender);
  };

  if (!finalGroups.groups) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
        <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-semibold text-foreground">Gruppen noch nicht generiert</p>
        <p className="text-sm text-muted-foreground mt-1">Der Veranstalter muss die Gruppen im Final-Admin generieren.</p>
      </div>
    );
  }

  const genderBadge = (gender) =>
    gender === 'Herren' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700';

  // Live ranking summary per group
  const renderRankingSummary = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {GROUP_CONFIGS.map(({ gender, group, headerColor, borderColor, badge }) => {
        const playerIds = groups[gender]?.[group] || [];
        const players = playerIds.map(pid => {
          const scoreRecord = scores.find(s => s.player_id === pid && s.group === group);
          return { pid, name: getPlayerName(pid), score: scoreRecord?.score ?? 0, ...parseVA(scoreRecord?.notes), hasScore: !!scoreRecord };
        });
        const ranked = [...players].sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.abraeumen !== a.abraeumen) return b.abraeumen - a.abraeumen;
          return a.fehlwurf - b.fehlwurf;
        });
        const medalColors = ['bg-amber-500 text-white', 'bg-gray-400 text-white', 'bg-amber-700 text-white'];
        return (
          <div key={`${gender}-${group}`} className={`bg-card rounded-2xl border ${borderColor} overflow-hidden`}>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>{gender}</span>
              <h3 className={`font-bold text-sm ${headerColor}`}>Gruppe {group}</h3>
              <span className="text-xs text-muted-foreground ml-auto">{players.filter(p => p.hasScore).length}/{players.length} eingegeben</span>
            </div>
            <div className="divide-y divide-border/40">
              {ranked.map((p, i) => (
                <div key={p.pid} className="flex items-center gap-3 px-4 py-1.5">
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${medalColors[i] || 'bg-muted text-foreground'}`}>{i + 1}</span>
                  <span className="text-xs font-medium text-foreground truncate flex-1">{p.name}</span>
                  <span className="text-xs font-bold text-foreground">{p.score}</span>
                  {i < 2 && players.every(pl => pl.hasScore) && (
                    <span className="text-[10px] text-green-600 font-semibold">→ K.O.</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      {!tournament || tournament.status !== 'abgeschlossen' ? (
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-5 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          Ergebnisse werden automatisch gespeichert · 120 Wurf pro Spieler
        </div>
      ) : null}

      {renderRankingSummary()}

      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        <Users className="w-3.5 h-3.5" />
        Score-Eingabe nach Durchgängen
      </div>

      <div className="space-y-3">
        {rounds.map((round, ri) => {
          const allDone = isSlotFullyDone(round.players, round.gender);
          const open = isRoundOpen(ri, round.players, round.gender);
          const savedCount = round.players.filter(pid => {
            const group = findGroup(pid, round.gender);
            const key = `${group}::${pid}`;
            return !dirtyKeys[key] && !savingKeys[key] && scores.some(s => s.player_id === pid && s.group === group && s.score != null);
          }).length;
          const remaining = round.players.length - savedCount;
          const lanes = Array.from({ length: laneCount }, (_, i) => i + 1);

          return (
            <div key={ri} className="bg-card rounded-2xl border border-border overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                onClick={() => toggleRound(ri, round.players, round.gender)}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">{round.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${genderBadge(round.gender)}`}>
                    {round.gender} {round.range}
                  </span>
                  <span className="text-xs text-muted-foreground">· {round.players.length} Spieler</span>
                  {allDone ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Alle gespeichert
                    </span>
                  ) : isOwner ? (
                    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> {remaining} noch offen
                    </span>
                  ) : null}
                </div>
                {open
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {open && (
                <table className="w-full border-t border-border">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Spieler / Gruppe</th>
                      {lanes.map(n => (
                        <th key={n} className="px-1 py-2 min-w-[5rem]"></th>
                      ))}
                      <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">∑</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.players.map((pid, pi) => ({ pid, lane: laneCount === 4 ? LANE_ORDER[pi] : pi + 1 }))
                      .sort((a, b) => a.lane - b.lane)
                      .map(({ pid, lane }) => {
                      const pi = round.players.indexOf(pid);
                      const group = findGroup(pid, round.gender);
                      const scoreRecord = scores.find(s => s.player_id === pid && s.group === group);
                      const key = `${group}::${pid}`;
                      const assignedLane = lane;
                      return (
                        <Fragment key={pid}>
                          <tr className="bg-muted/5">
                            <td colSpan={laneCount + 2} className="px-4 py-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center justify-center text-[9px] font-bold px-1.5 py-0.5 rounded ${genderBadge(round.gender)}`}>
                                  {group}
                                </span>
                                <span className="text-[10px] text-muted-foreground">Bahn {assignedLane}</span>
                              </div>
                            </td>
                          </tr>
                          <PlayerScoreRow
                            playerId={pid}
                            playerName={getPlayerName(pid)}
                            teamName={`Gruppe ${group}`}
                            category={round.gender}
                            existingScore={scoreRecord}
                            onChange={isOwner ? (data) => handleChange(group, round.gender, data) : undefined}
                            readOnly={!isOwner}
                            isSaving={!!savingKeys[key]}
                            isSaved={!!savedKeys[key]}
                            isPending={!!dirtyKeys[key]}
                          />
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}