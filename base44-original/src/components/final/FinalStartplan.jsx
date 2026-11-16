import { useMemo } from 'react';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { parseKONotes, computeDuelResult } from '@/components/final/KODuelCard';
import { Clock, Users, Swords } from 'lucide-react';
import PlayerIdInfo from '@/components/PlayerIdInfo';

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

function generateTimes(startHour, startMinute, slotMinutes, count) {
  const times = [];
  let total = startHour * 60 + startMinute;
  for (let i = 0; i < count; i++) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    times.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    total += slotMinutes;
  }
  return times;
}

function parseDayConfigs(str) {
  try {
    const parsed = JSON.parse(str || '');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return [{ name: 'Tag 1', date: null, startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }];
}

export default function FinalStartplan({ tournament, scores = [], canSeePhone = false }) {
  const { getPlayerName, playerMap } = usePlayerMap();

  const finalGroups = useMemo(() => {
    try { return JSON.parse(tournament.final_groups || '{}'); } catch { return {}; }
  }, [tournament]);

  const qualifiers = finalGroups.qualifiers || { Herren: [], Damen: [] };
  const laneCount = tournament.lane_count || 4;
  const slotDuration = tournament.slot_duration || 60;
  const lanes = Array.from({ length: laneCount }, (_, i) => i + 1);

  const days = parseDayConfigs(tournament.day_configs);
  const day = days[0];
  const startHour = day.startHour ?? 8;
  const startMinute = day.startMinute ?? 0;

  // Lane assignment pattern within each batch of 4 players:
  // Player 1 → Lane 1, Player 2 → Lane 3, Player 3 → Lane 4, Player 4 → Lane 2
  const laneOrder = [1, 3, 4, 2];
  const getLaneForIndex = (idx) => laneCount === 4 ? laneOrder[idx] : idx + 1;

  // Build group-phase rounds: H1-N, D1-N, H(N+1)-2N, D(N+1)-2N, ...
  // Each round has laneAssignments: { laneNumber: playerEntry }
  const groupRounds = [];
  const maxBatches = Math.max(
    Math.ceil((qualifiers.Herren?.length || 0) / laneCount),
    Math.ceil((qualifiers.Damen?.length || 0) / laneCount)
  );

  for (let i = 0; i < maxBatches; i++) {
    const herrenBatch = (qualifiers.Herren || []).slice(i * laneCount, (i + 1) * laneCount);
    const damenBatch = (qualifiers.Damen || []).slice(i * laneCount, (i + 1) * laneCount);
    if (herrenBatch.length > 0) {
      const laneAssignments = {};
      herrenBatch.forEach((pid, idx) => { laneAssignments[getLaneForIndex(idx)] = pid; });
      groupRounds.push({ gender: 'Herren', range: `${i * laneCount + 1}–${i * laneCount + herrenBatch.length}`, laneAssignments });
    }
    if (damenBatch.length > 0) {
      const laneAssignments = {};
      damenBatch.forEach((pid, idx) => { laneAssignments[getLaneForIndex(idx)] = pid; });
      groupRounds.push({ gender: 'Damen', range: `${i * laneCount + 1}–${i * laneCount + damenBatch.length}`, laneAssignments });
    }
  }

  // Compute group rankings from scores to fill K.O. slots dynamically
  const getGroupRanking = (gender, group) => {
    const playerIds = finalGroups.groups?.[gender]?.[group] || [];
    return playerIds.map(pid => {
      const scoreRecord = scores.find(s => s.player_id === pid && s.group === group);
      return {
        playerId: pid,
        name: getPlayerName(pid),
        score: scoreRecord?.score ?? 0,
        ...parseVA(scoreRecord?.notes),
        hasScore: !!scoreRecord,
      };
    }).sort(comparePlayers);
  };

  const getKOScore = (group, playerId) =>
    scores.find(s => s.player_id === playerId && s.group === group);

  const getKOWinner = (p1, p2, group) => {
    const s1 = getKOScore(group, p1?.playerId);
    const s2 = getKOScore(group, p2?.playerId);
    if (!s1 || !s2) return null;
    const ko1 = parseKONotes(s1.notes);
    const ko2 = parseKONotes(s2.notes);
    const result = computeDuelResult(ko1.lanes, ko2.lanes, ko1.sudden, ko2.sudden);
    if (!result.winner) return null;
    return result.winner === 1 ? p1 : p2;
  };

  // K.O. rounds: Halbfinals (HF1 + HF2 simultaneously), then Finales
  // HF1 on lanes 3-4, HF2 on lanes 1-2
  const isGroupPhaseComplete = (gender) => {
    const groupA = finalGroups.groups?.[gender]?.['A'] || [];
    const groupB = finalGroups.groups?.[gender]?.['B'] || [];
    const allIds = [...groupA, ...groupB];
    if (allIds.length === 0) return false;
    return allIds.every(pid => scores.some(s => s.player_id === pid && (s.group === 'A' || s.group === 'B')));
  };

  const koRounds = [];
  if (finalGroups.groups) {
    ['Herren', 'Damen'].forEach(gender => {
      const groupComplete = isGroupPhaseComplete(gender);
      const rankA = getGroupRanking(gender, 'A');
      const rankB = getGroupRanking(gender, 'B');
      const p1A = rankA[0]; // 1. Platz Gruppe A
      const p2A = rankA[1]; // 2. Platz Gruppe A
      const p1B = rankB[0]; // 1. Platz Gruppe B
      const p2B = rankB[1]; // 2. Platz Gruppe B

      // HF1: 1.A vs 2.B → lanes 3,4 ; HF2: 1.B vs 2.A → lanes 1,2
      const sf1Group = `KO-SF1-${gender.charAt(0)}`;
      const sf2Group = `KO-SF2-${gender.charAt(0)}`;
      const sf1Winner = groupComplete && p1A && p2B ? getKOWinner(p1A, p2B, sf1Group) : null;
      const sf2Winner = groupComplete && p1B && p2A ? getKOWinner(p1B, p2A, sf2Group) : null;

      koRounds.push({
        gender,
        koLabel: 'Halbfinale',
        laneAssignments: {
          1: groupComplete && p1B ? { playerId: p1B.playerId, label: p1B.name, duel: 'HF 2', hasScore: p1B.hasScore } : { label: `1. Platz Gruppe B`, isPlaceholder: true, duel: 'HF 2' },
          2: groupComplete && p2A ? { playerId: p2A.playerId, label: p2A.name, duel: 'HF 2', hasScore: p2A.hasScore } : { label: `2. Platz Gruppe A`, isPlaceholder: true, duel: 'HF 2' },
          3: groupComplete && p1A ? { playerId: p1A.playerId, label: p1A.name, duel: 'HF 1', hasScore: p1A.hasScore } : { label: `1. Platz Gruppe A`, isPlaceholder: true, duel: 'HF 1' },
          4: groupComplete && p2B ? { playerId: p2B.playerId, label: p2B.name, duel: 'HF 1', hasScore: p2B.hasScore } : { label: `2. Platz Gruppe B`, isPlaceholder: true, duel: 'HF 1' },
        },
        _sf1Winner: sf1Winner,
        _sf2Winner: sf2Winner,
        _gender: gender,
      });
    });
    // Finale: Herren on lanes 1-2, Damen on lanes 3-4 (simultaneous)
    const herrenRound = koRounds.find(r => r._gender === 'Herren');
    const damenRound = koRounds.find(r => r._gender === 'Damen');
    const finalHerren = herrenRound?._sf1Winner && herrenRound?._sf2Winner
      ? getKOWinner(herrenRound._sf1Winner, herrenRound._sf2Winner, `KO-FINAL-H`)
      : null;
    const finalDamen = damenRound?._sf1Winner && damenRound?._sf2Winner
      ? getKOWinner(damenRound._sf1Winner, damenRound._sf2Winner, `KO-FINAL-D`)
      : null;

    koRounds.push({
      gender: 'Mixed',
      koLabel: 'Finale',
      laneAssignments: {
        1: herrenRound?._sf1Winner ? { playerId: herrenRound._sf1Winner.playerId, label: herrenRound._sf1Winner.name, duel: 'Finale Herren', hasScore: !!getKOScore('KO-FINAL-H', herrenRound._sf1Winner.playerId) } : { label: `Sieger HF Herren`, isPlaceholder: true, duel: 'Finale Herren' },
        2: herrenRound?._sf2Winner ? { playerId: herrenRound._sf2Winner.playerId, label: herrenRound._sf2Winner.name, duel: 'Finale Herren', hasScore: !!getKOScore('KO-FINAL-H', herrenRound._sf2Winner.playerId) } : { label: `Sieger HF Herren`, isPlaceholder: true, duel: 'Finale Herren' },
        3: damenRound?._sf1Winner ? { playerId: damenRound._sf1Winner.playerId, label: damenRound._sf1Winner.name, duel: 'Finale Damen', hasScore: !!getKOScore('KO-FINAL-D', damenRound._sf1Winner.playerId) } : { label: `Sieger HF Damen`, isPlaceholder: true, duel: 'Finale Damen' },
        4: damenRound?._sf2Winner ? { playerId: damenRound._sf2Winner.playerId, label: damenRound._sf2Winner.name, duel: 'Finale Damen', hasScore: !!getKOScore('KO-FINAL-D', damenRound._sf2Winner.playerId) } : { label: `Sieger HF Damen`, isPlaceholder: true, duel: 'Finale Damen' },
      },
    });
  }

  const allRounds = [...groupRounds, ...koRounds];
  const times = generateTimes(startHour, startMinute, slotDuration, allRounds.length);

  if (!finalGroups.groups) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
        <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-semibold text-foreground">Startplan noch nicht verfügbar</p>
        <p className="text-sm text-muted-foreground mt-1">Der Veranstalter muss zuerst die Gruppen im Final-Admin generieren.</p>
      </div>
    );
  }

  if (!finalGroups.qualifiers) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
        <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-semibold text-foreground">Startplan aktualisieren</p>
        <p className="text-sm text-muted-foreground mt-1">Bitte im Final-Admin die Gruppen neu generieren, um den Startplan zu sehen.</p>
      </div>
    );
  }

  const cellColor = (gender) =>
    gender === 'Herren' ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-pink-50 border-pink-200 text-pink-800';
  const badgeColor = (gender) =>
    gender === 'Herren' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-5 py-3 text-sm text-muted-foreground">
        <Users className="w-4 h-4 text-muted-foreground" />
        {qualifiers.Herren?.length || 0} Herren · {qualifiers.Damen?.length || 0} Damen · {groupRounds.length} Gruppen-Durchgänge + {koRounds.length} K.O.-Durchgänge · {slotDuration} min
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 md:p-6 overflow-x-auto">
        <table className="text-sm border-collapse" style={{ minWidth: `${80 + laneCount * 160}px` }}>
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground" style={{ width: '80px' }}>Zeit</th>
              {lanes.map((lane) => (
                <th key={lane} className="text-center py-2 px-1 text-xs font-semibold text-muted-foreground" style={{ width: '160px' }}>Bahn {lane}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRounds.map((round, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-muted/10' : ''}>
                <td className="py-2 pr-3 align-top" style={{ width: '80px' }}>
                  <span className="flex items-center gap-1 text-xs font-semibold text-foreground whitespace-nowrap">
                    <Clock className="w-3 h-3 text-muted-foreground" />{times[ri]}
                  </span>
                  {round.koLabel ? (
                    <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <Swords className="w-2.5 h-2.5" />{round.koLabel} {round.gender}
                    </span>
                  ) : (
                    <span className={`mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor(round.gender)}`}>
                      {round.gender} {round.range}
                    </span>
                  )}
                </td>
                {lanes.map((lane) => {
                  const entry = round.laneAssignments?.[lane];
                  if (!entry) {
                    return (
                      <td key={lane} className="py-1.5 px-1 align-top" style={{ width: '160px' }}>
                        <div className="h-14 rounded-xl border border-dashed border-border/30 bg-muted/5 flex items-center justify-center text-muted-foreground/20 text-xs">—</div>
                      </td>
                    );
                  }
                  // K.O. entry (resolved player or placeholder)
                  if (typeof entry === 'object' && !entry.playerId) {
                    const entryGender = entry.duel?.includes('Herren') ? 'Herren' : entry.duel?.includes('Damen') ? 'Damen' : round.gender;
                    return (
                      <td key={lane} className="py-1.5 px-1 align-top" style={{ width: '160px' }}>
                        <div className={`rounded-xl border border-dashed px-2.5 py-2 h-14 flex flex-col justify-center ${cellColor(entryGender)} opacity-60`}>
                          <div className="text-xs font-semibold truncate italic">{entry.label}</div>
                          <div className="text-[10px] opacity-50">{entry.duel || 'K.O.-Duell'}</div>
                        </div>
                      </td>
                    );
                  }
                  if (typeof entry === 'object' && entry.playerId) {
                    const entryGender = entry.duel?.includes('Herren') ? 'Herren' : entry.duel?.includes('Damen') ? 'Damen' : round.gender;
                    const p = playerMap[entry.playerId];
                    return (
                      <td key={lane} className="py-1.5 px-1 align-top" style={{ width: '160px' }}>
                        <div className={`rounded-xl border px-2.5 py-2 h-14 flex flex-col justify-center ${cellColor(entryGender)} ${entry.hasScore ? '' : 'opacity-70 border-dashed'}`}>
                          <div className="text-xs font-bold truncate flex items-center gap-1">
                            <span className="truncate">{entry.label}</span>
                            {canSeePhone && <PlayerIdInfo playerId={entry.playerId} />}
                          </div>
                          <div className="text-[10px] opacity-50 truncate">{entry.duel || 'K.O.-Duell'}</div>
                        </div>
                      </td>
                    );
                  }
                  // Real player entry (entry is a player ID string)
                  const p = playerMap[entry];
                  return (
                    <td key={lane} className="py-1.5 px-1 align-top" style={{ width: '160px' }}>
                      <div className={`rounded-xl border px-2.5 py-2 h-14 flex flex-col justify-center ${cellColor(round.gender)}`}>
                        <div className="text-xs font-bold truncate flex items-center gap-1">
                          <span className="truncate">{getPlayerName(entry)}</span>
                          {canSeePhone && <PlayerIdInfo playerId={entry} />}
                        </div>
                        {canSeePhone && <div className="text-[10px] opacity-60 truncate">📱 {p?.phone || 'keine Nummer'}</div>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}