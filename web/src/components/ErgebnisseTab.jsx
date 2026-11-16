import { useState, useCallback, useMemo, useRef } from 'react';
import { CheckCircle2, Clock, ChevronDown, ChevronRight, AlertCircle, FileDown, CalendarDays, MapPin } from 'lucide-react';
import { PlayerScoreRow, isScoreComplete } from './ScoreEntryCard';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { exportEingabeblattPDF } from '@/utils/pdfExport';
import { useIsMobile } from '@/hooks/use-mobile';
import { getVenues, venueKeyOf } from '@/lib/venues';

export default function ErgebnisseTab({ teams, scores, schedules, isFinished, onSavePlayer, isSaving, isOwner = false, tournament }) {
  const { playerMap, getPlayerName } = usePlayerMap();
  const isMobile = useIsMobile();

  // Multi-Spielort: Spielort-Tabs zur Trennung der Ergebnisse
  const venues = useMemo(() => getVenues(tournament), [tournament]);
  const isMultiVenue = venues.length > 1;
  const [activeVenue, setActiveVenue] = useState(0);

  // Findet den Score-Datensatz für einen Spieler.
  // Mannschaft: über team_id + player_id. Einzelstarter: über schedule_id
  // (jeder Start bekommt einen eigenen Score), Fallback auf player_id für alte Daten.
  const findScore = useCallback((team, playerId, sched) => {
    if (team.id) return scores.find(s => s.team_id === team.id && s.player_id === playerId);
    // Einzelstarter: primär über schedule_id (jeder Start = eigener Score)
    const bySched = scores.find(s => !s.team_id && s.schedule_id === sched?.id && s.player_id === playerId);
    if (bySched) return bySched;
    // Legacy-Fallback (alter Score ohne schedule_id): nur verwenden, wenn der
    // Spieler genau EINEN Start hat – bei mehreren Starts wäre die Zuordnung
    // mehrdeutig und derselbe Score würde in mehreren Slots angezeigt werden.
    const playerSlots = schedules.filter(s => !s.is_placeholder && s.player_id === playerId && !s.team_id);
    if (playerSlots.length <= 1) {
      return scores.find(s => !s.team_id && !s.schedule_id && s.player_id === playerId);
    }
    return undefined;
  }, [scores, schedules]);

  // Parse day configs from tournament for ordered day list
  const dayConfigs = useMemo(() => {
    try {
      const parsed = JSON.parse(tournament?.day_configs || '');
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
    return null;
  }, [tournament]);

  const dayOrder = useMemo(() => dayConfigs?.map(d => d.name) ?? null, [dayConfigs]);

  // Returns true if a day's date is in the past (before today)
  // dayKey can be a date string (YYYY-MM-DD) or a day name like "Tag 1"
  const isDayPast = useCallback((dayKey) => {
    const today = new Date().toISOString().slice(0, 10);
    // If dayKey looks like a date string, compare directly
    if (/^\d{4}-\d{2}-\d{2}/.test(dayKey)) {
      return dayKey.slice(0, 10) < today;
    }
    // Otherwise look up by name in dayConfigs
    if (!dayConfigs) return false;
    const cfg = dayConfigs.find(d => d.name === dayKey);
    if (!cfg?.date) return false;
    const dayDate = typeof cfg.date === 'string' ? cfg.date.slice(0, 10) : new Date(cfg.date).toISOString().slice(0, 10);
    return dayDate < today;
  }, [dayConfigs]);

  // Build flat list of all players (by player_id) with their schedule
  const allPlayers = useMemo(() => {
    const list = [];
    teams.forEach(team => {
      [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean).forEach(playerId => {
        const sched = schedules.find(s => s.team_id === team.id && s.player_id === playerId);
        list.push({ playerId, team, sched });
      });
    });
    // Einzelstarter (scheduled players without a team)
    const isFutureSeries = tournament?.series_type === 'future';
    schedules.filter(s => !s.is_placeholder && s.player_id && !s.team_id).forEach(sched => {
      // 9PinFuture: Verein des Spielers anzeigen statt „Einzelstarter"
      const ezName = isFutureSeries && playerMap[sched.player_id]?.club ? playerMap[sched.player_id].club : 'Einzelstarter';
      list.push({
        playerId: sched.player_id,
        team: { id: '', name: ezName, category: playerMap[sched.player_id]?.category || 'Herren' },
        sched,
      });
    });
    // Nach aktivem Spielort filtern (Multi-Spielort)
    const filtered = isMultiVenue
      ? list.filter(item => Number(venueKeyOf(item.sched)) === activeVenue)
      : list;
    filtered.sort((a, b) => {
      const dayA = a.sched?.day || 'Tag 1';
      const dayB = b.sched?.day || 'Tag 1';
      const idxA = dayOrder ? (dayOrder.indexOf(dayA) >= 0 ? dayOrder.indexOf(dayA) : 999) : 0;
      const idxB = dayOrder ? (dayOrder.indexOf(dayB) >= 0 ? dayOrder.indexOf(dayB) : 999) : 0;
      if (idxA !== idxB) return idxA - idxB;
      if (!a.sched && !b.sched) return a.team.name.localeCompare(b.team.name);
      if (!a.sched) return 1;
      if (!b.sched) return -1;
      if (a.sched.start_time !== b.sched.start_time)
        return a.sched.start_time.localeCompare(b.sched.start_time);
      return (a.sched.lane || 0) - (b.sched.lane || 0);
    });
    return filtered;
  }, [teams, schedules, dayOrder, isMultiVenue, activeVenue, playerMap, tournament]);

  // Group by day, then by time slot within each day
  const dayGroups = useMemo(() => {
    const groups = [];
    let lastDay = null;
    let lastTime = null;
    allPlayers.forEach(item => {
      const d = item.sched?.day || 'Tag 1';
      const t = item.sched?.start_time || null;
      if (d !== lastDay) {
        groups.push({ day: d, slots: [] });
        lastDay = d;
        lastTime = null;
      }
      const currentGroup = groups[groups.length - 1];
      if (t !== lastTime) {
        currentGroup.slots.push({ time: t, items: [] });
        lastTime = t;
      }
      currentGroup.slots[currentGroup.slots.length - 1].items.push(item);
    });
    return groups.filter(g => g.slots.some(s => s.items.length > 0));
  }, [allPlayers]);

  const multiDay = dayGroups.length > 1;

  const [collapsed, setCollapsed] = useState({});
  const toggle = (day, time) => {
    const key = `${day}::${time ?? '__none__'}`;
    setCollapsed(prev => ({ ...prev, [key]: prev[key] === undefined ? true : !prev[key] }));
  };

  const saveTimers = useRef({});
  const [savingKeys, setSavingKeys] = useState({});
  const [savedKeys, setSavedKeys] = useState({});
  // Track which player keys have a pending (dirty, not yet DB-saved) value
  const [dirtyKeys, setDirtyKeys] = useState({});

  const handleChange = useCallback((teamId, playerData) => {
    const key = teamId ? `${teamId}::${playerData.player_id}` : `EZ::${playerData.schedule_id || playerData.player_id}::${playerData.player_id}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    setSavingKeys(prev => ({ ...prev, [key]: true }));
    setSavedKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
    // Mark as dirty (pending) so the section stays open
    setDirtyKeys(prev => ({ ...prev, [key]: true }));
    saveTimers.current[key] = setTimeout(async () => {
      await onSavePlayer({ teamId, ...playerData });
      setSavingKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
      setSavedKeys(prev => ({ ...prev, [key]: true }));
      // Only clear dirty after DB save
      setDirtyKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
      setTimeout(() => setSavedKeys(prev => { const n = { ...prev }; delete n[key]; return n; }), 2000);
    }, 3000);
  }, [onSavePlayer]);

  // A slot is "fully done" only when ALL players have a complete DB score
  // (alle Bahnen ausgefüllt bzw. Gesamt/W.O./No-Show) AND none are dirty/pending.
  // Unvollständige Pro-Bahn-Eingaben bleiben offen sichtbar (keine Zwischenwerte).
  const isSlotFullyDone = useCallback((items) => {
    return items.every(({ playerId, team, sched }) => {
      const key = team.id ? `${team.id}::${playerId}` : `EZ::${sched?.id || playerId}::${playerId}`;
      if (dirtyKeys[key] || savingKeys[key]) return false;
      const sc = findScore(team, playerId, sched);
      const volleOnly = playerMap[playerId]?.age_class === 'U-10';
      return isScoreComplete(sc, volleOnly);
    });
  }, [scores, dirtyKeys, savingKeys, findScore, playerMap]);

  const isDayFullyDone = useCallback((slots) => {
    return slots.every(({ items }) => isSlotFullyDone(items));
  }, [isSlotFullyDone]);

  const isDayCollapsed = (day, slots) => {
    const key = `day::${day}`;
    if (key in collapsed) return collapsed[key];
    return isDayFullyDone(slots);
  };

  const toggleDay = (day) => {
    const key = `day::${day}`;
    setCollapsed(prev => ({ ...prev, [key]: !isDayCollapsed(day, dayGroups.find(g => g.day === day)?.slots || []) }));
  };

  const isOpen = (day, time, items) => {
    const key = `${day}::${time ?? '__none__'}`;
    if (key in collapsed) return !collapsed[key];
    return !isSlotFullyDone(items);
  };

  if (allPlayers.length === 0) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border text-muted-foreground">
        Keine Mannschaften vorhanden.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isFinished && isOwner && (
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-5 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          Ergebnisse werden automatisch gespeichert
        </div>
      )}

      {isMultiVenue && (
        <div className="flex items-center gap-2 flex-wrap">
          <MapPin className="w-4 h-4 text-emerald-500" />
          {venues.map((venue) => (
            <button
              key={venue.index}
              onClick={() => setActiveVenue(venue.index)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeVenue === venue.index ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {venue.name || `Spielort ${venue.index + 1}`}
              <span className="ml-1.5 text-xs opacity-70">· {venue.lane_count} Bahnen</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {dayGroups.map(({ day, slots }) => {
          const dayDone = isDayFullyDone(slots);
          const dayCollapsed = isDayCollapsed(day, slots);
          return (
          <div key={day}>
            {multiDay && (
              <button
                className="w-full flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
                onClick={() => toggleDay(day)}
              >
                <CalendarDays className="w-4 h-4 text-primary flex-shrink-0" />
                <h3 className="text-sm font-bold text-foreground">{day}</h3>
                {dayDone && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fertig
                  </span>
                )}
                <div className="flex-1 h-px bg-border" />
                {dayCollapsed
                  ? <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </button>
            )}
            {(!multiDay || !dayCollapsed) && (
            <div className="space-y-3">
              {slots.map(({ time, items }) => {
                const savedCount = items.filter(({ playerId, team, sched }) => {
                  const key = team.id ? `${team.id}::${playerId}` : `EZ::${sched?.id || playerId}::${playerId}`;
                  return !dirtyKeys[key] && !savingKeys[key] && (() => {
                    const sc = findScore(team, playerId, sched);
                    return isScoreComplete(sc, playerMap[playerId]?.age_class === 'U-10');
                  })();
                }).length;
                const allSaved = isSlotFullyDone(items);
                const open = isOpen(day, time, items);
                const remaining = items.length - savedCount;
                return (
                  <div key={`${day}::${time ?? '__none__'}`} className="bg-card rounded-2xl border border-border overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                      onClick={() => toggle(day, time)}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-bold text-foreground">
                          {time ? `${time} Uhr` : 'Ohne Startzeit'}
                        </span>
                        <span className="text-xs text-muted-foreground">· {items.length} Spieler</span>
                        {allSaved ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Alle gespeichert
                          </span>
                        ) : isOwner ? (
                          <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> {remaining} noch offen
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {tournament && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const pdfPlayers = items.map(({ playerId, team, sched }) => ({
                                playerId,
                                playerName: getPlayerName(playerId),
                                teamName: team.name,
                                lane: sched?.lane || null,
                              }));
                              const activeVenueObj = venues[activeVenue];
                              const venueLabel = isMultiVenue && activeVenueObj
                                ? [activeVenueObj.name, activeVenueObj.location].filter(Boolean).join(', ')
                                : null;
                              exportEingabeblattPDF({ tournament, players: pdfPlayers, timeLabel: time ? `${time} Uhr` : null, venueLabel, getPlayerName });
                            }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
                            title="Leeres Eingabeblatt als PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            PDF
                          </button>
                        )}
                        {open
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {open && (
                      isMobile ? (
                        <div className="border-t border-border">
                          {items.map(({ playerId, team, sched }) => {
                            const key = team.id ? `${team.id}::${playerId}` : `EZ::${sched?.id || playerId}::${playerId}`;
                            return (
                              <PlayerScoreRow
                                key={team.id ? `${team.id}-${playerId}` : `EZ-${sched?.id || playerId}-${playerId}`}
                                playerId={playerId}
                                playerName={getPlayerName(playerId)}
                                teamName={team.name}
                                category={team.category}
                                schedule={sched}
                                existingScore={findScore(team, playerId, sched)}
                                onChange={isOwner ? (data) => handleChange(team.id, data) : undefined}
                                readOnly={!isOwner}
                                isSaving={!!savingKeys[key]}
                                isSaved={!!savedKeys[key]}
                                isPending={!!dirtyKeys[key]}
                                volleOnly={playerMap[playerId]?.age_class === 'U-10'}
                                mobile
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <table className="w-full border-t border-border">
                          <thead>
                            <tr className="bg-muted/40">
                              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Spieler / Mannschaft</th>
                              {[1,2,3,4].map(n => (
                                <th key={n} className="px-1 py-2 min-w-[5rem]"></th>
                              ))}
                              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">∑</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(({ playerId, team, sched }) => {
                              const key = team.id ? `${team.id}::${playerId}` : `EZ::${sched?.id || playerId}::${playerId}`;
                              return (
                                <PlayerScoreRow
                                  key={team.id ? `${team.id}-${playerId}` : `EZ-${sched?.id || playerId}-${playerId}`}
                                  playerId={playerId}
                                  playerName={getPlayerName(playerId)}
                                  teamName={team.name}
                                  category={team.category}
                                  schedule={sched}
                                  existingScore={findScore(team, playerId, sched)}
                                  onChange={isOwner ? (data) => handleChange(team.id, data) : undefined}
                                  readOnly={!isOwner}
                                  isSaving={!!savingKeys[key]}
                                  isSaved={!!savedKeys[key]}
                                  isPending={!!dirtyKeys[key]}
                                  volleOnly={playerMap[playerId]?.age_class === 'U-10'}
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}