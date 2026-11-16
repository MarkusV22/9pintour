import { useState, useCallback, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import KODuelCard, { parseKONotes, computeDuelResult } from '@/components/final/KODuelCard';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { getCoOrganizerEmails } from '@/lib/coOrganizers';
import { Trophy, AlertCircle, Crown } from 'lucide-react';

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

function comparePlayers(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.abraeumen !== a.abraeumen) return b.abraeumen - a.abraeumen;
  return a.fehlwurf - b.fehlwurf;
}

export default function FinalBracket({ tournament, scores, isOwner }) {
  const queryClient = useQueryClient();
  const { getPlayerName } = usePlayerMap();
  const id = tournament.id;

  const finalGroups = useMemo(() => {
    try { return JSON.parse(tournament.final_groups || '{}'); } catch { return {}; }
  }, [tournament]);

  const saveTimers = useRef({});
  const [savingKeys, setSavingKeys] = useState({});
  const [savedKeys, setSavedKeys] = useState({});

  const saveScoreMutation = useMutation({
    mutationFn: async ({ player_id, notes, score, category, group }) => {
      const existing = scores.find(s => s.player_id === player_id && s.group === group);
      if (existing) {
        await base44.entities.TournamentScore.update(existing.id, { score, notes });
      } else {
        await base44.entities.TournamentScore.create({
          tournament_id: id,
          team_id: '',
          player_id,
          score,
          notes,
          category,
          group,
          co_organizer_emails: getCoOrganizerEmails(tournament),
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scores', id] }),
  });

  const handleChange = useCallback((group, category, playerId, laneData, score) => {
    const key = `${group}::${playerId}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    setSavingKeys(prev => ({ ...prev, [key]: true }));
    setSavedKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
    const notes = JSON.stringify({ lanes: laneData.lanes, sudden: laneData.sudden });
    saveTimers.current[key] = setTimeout(async () => {
      await saveScoreMutation.mutateAsync({ player_id: playerId, notes, score, category, group });
      setSavingKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
      setSavedKeys(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setSavedKeys(prev => { const n = { ...prev }; delete n[key]; return n; }), 2000);
    }, 1500);
  }, [saveScoreMutation]);

  // Get group ranking (sorted players within a group)
  const getGroupRanking = (gender, group) => {
    const playerIds = finalGroups.groups?.[gender]?.[group] || [];
    const players = playerIds.map(pid => {
      const scoreRecord = scores.find(s => s.player_id === pid && s.group === group);
      return {
        playerId: pid,
        name: getPlayerName(pid),
        scoreRecord,
        score: scoreRecord?.score ?? 0,
        ...parseVA(scoreRecord?.notes),
      };
    });
    return players.sort(comparePlayers);
  };

  // Check if group phase is complete for a gender
  const isGroupPhaseComplete = (gender) => {
    const groupA = finalGroups.groups?.[gender]?.['A'] || [];
    const groupB = finalGroups.groups?.[gender]?.['B'] || [];
    const allIds = [...groupA, ...groupB];
    if (allIds.length === 0) return false;
    return allIds.every(pid => scores.some(s => s.player_id === pid && (s.group === 'A' || s.group === 'B')));
  };

  // Get KO score for a player in a specific round
  const getKOScore = (group, playerId) => {
    return scores.find(s => s.player_id === playerId && s.group === group);
  };

  // Determine winner of a KO duel using set-based logic
  const getWinner = (p1, p2, group) => {
    const s1 = getKOScore(group, p1.playerId);
    const s2 = getKOScore(group, p2.playerId);
    if (!s1 || !s2) return null;
    const ko1 = parseKONotes(s1.notes);
    const ko2 = parseKONotes(s2.notes);
    const result = computeDuelResult(ko1.lanes, ko2.lanes, ko1.sudden, ko2.sudden);
    if (!result.winner) return null;
    return result.winner === 1 ? p1 : p2;
  };

  const GENDERS = [
    { key: 'Herren', headerColor: 'text-blue-600', borderColor: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    { key: 'Damen', headerColor: 'text-pink-600', borderColor: 'border-pink-200', badge: 'bg-pink-100 text-pink-700' },
  ];

  if (!finalGroups.groups) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
        <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-semibold text-foreground">Gruppen noch nicht generiert</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {GENDERS.map(({ key: gender, headerColor, borderColor, badge }) => {
        const groupComplete = isGroupPhaseComplete(gender);
        if (!groupComplete) {
          return (
            <div key={gender} className={`bg-card rounded-2xl border ${borderColor} p-6`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>{gender}</span>
                <h3 className={`font-bold text-lg ${headerColor}`}>Halbfinale</h3>
              </div>
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4" />
                Gruppenphase noch nicht abgeschlossen – alle 120-Wurf-Ergebnisse müssen eingegeben sein.
              </div>
            </div>
          );
        }

        const rankA = getGroupRanking(gender, 'A');
        const rankB = getGroupRanking(gender, 'B');

        // Top 2 per group
        const sf1P1 = rankA[0]; // 1st of Group A
        const sf1P2 = rankB[1]; // 2nd of Group B
        const sf2P1 = rankB[0]; // 1st of Group B
        const sf2P2 = rankA[1]; // 2nd of Group A

        if (!sf1P1 || !sf1P2 || !sf2P1 || !sf2P2) {
          return (
            <div key={gender} className={`bg-card rounded-2xl border ${borderColor} p-6`}>
              <p className="text-sm text-muted-foreground">Nicht genügend Spieler in den Gruppen.</p>
            </div>
          );
        }

        const sf1Group = `KO-SF1-${gender.charAt(0)}`;
        const sf2Group = `KO-SF2-${gender.charAt(0)}`;

        const renderDuel = (title, p1, p2, group) => (
          <KODuelCard
            title={title}
            p1={p1}
            p2={p2}
            group={group}
            category={gender}
            score1={getKOScore(group, p1.playerId)}
            score2={getKOScore(group, p2.playerId)}
            onChange={(playerId, laneData, score) => handleChange(group, gender, playerId, laneData, score)}
            isOwner={isOwner}
            saving={savingKeys}
            saved={savedKeys}
          />
        );

        return (
          <div key={gender} className={`bg-card rounded-2xl border ${borderColor} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>{gender}</span>
              <h3 className={`font-bold text-lg ${headerColor}`}>Halbfinale</h3>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {renderDuel('Halbfinale 1', sf1P1, sf1P2, sf1Group)}
              {renderDuel('Halbfinale 2', sf2P1, sf2P2, sf2Group)}
            </div>
          </div>
        );
      })}

      {/* Finals: Herren then Damen */}
      {GENDERS.map(({ key: gender, headerColor, borderColor, badge }) => {
        if (!isGroupPhaseComplete(gender)) return null;

        const rankA = getGroupRanking(gender, 'A');
        const rankB = getGroupRanking(gender, 'B');
        const sf1P1 = rankA[0];
        const sf1P2 = rankB[1];
        const sf2P1 = rankB[0];
        const sf2P2 = rankA[1];
        if (!sf1P1 || !sf1P2 || !sf2P1 || !sf2P2) return null;

        const sf1Group = `KO-SF1-${gender.charAt(0)}`;
        const sf2Group = `KO-SF2-${gender.charAt(0)}`;
        const finalGroup = `KO-FINAL-${gender.charAt(0)}`;

        const sf1Winner = getWinner(sf1P1, sf1P2, sf1Group);
        const sf2Winner = getWinner(sf2P1, sf2P2, sf2Group);
        const finalReady = sf1Winner && sf2Winner;
        const champion = finalReady ? getWinner(sf1Winner, sf2Winner, finalGroup) : null;

        return (
          <div key={gender} className={`bg-card rounded-2xl border ${borderColor} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>{gender}</span>
              <h3 className={`font-bold text-lg ${headerColor}`}>Finale</h3>
              {champion && (
                <span className="ml-auto flex items-center gap-1.5 text-sm font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                  <Crown className="w-4 h-4" /> Sieger: {champion.name}
                </span>
              )}
            </div>

            {finalReady ? (
              <KODuelCard
                title="Finale"
                p1={sf1Winner}
                p2={sf2Winner}
                group={finalGroup}
                category={gender}
                score1={getKOScore(finalGroup, sf1Winner.playerId)}
                score2={getKOScore(finalGroup, sf2Winner.playerId)}
                onChange={(playerId, laneData, score) => handleChange(finalGroup, gender, playerId, laneData, score)}
                isOwner={isOwner}
                saving={savingKeys}
                saved={savedKeys}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl px-4 py-3">
                <Trophy className="w-4 h-4" />
                Finale wird freigeschaltet, sobald beide Halbfinals abgeschlossen sind.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}