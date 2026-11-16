import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Trash2, Clock, CalendarDays, Pencil, X, History, CreditCard, CheckCircle2, MapPin } from 'lucide-react';
import { usePlayerMap } from '@/lib/usePlayerMap';
import PlayerIdInfo from '@/components/PlayerIdInfo';
import PlayerEditDialog from '@/components/PlayerEditDialog';
import EinzelstarterPickerDialog from '@/components/EinzelstarterPickerDialog';
import { getVenues, venueKeyOf } from '@/lib/venues';

const getLanes = (laneCount) => Array.from({ length: laneCount }, (_, i) => i + 1);

function generateSlots(startTotalMinutes, endTotalMinutes, slotMinutes) {
  const slots = [];
  let totalMinutes = startTotalMinutes;
  while (totalMinutes < endTotalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    slots.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    totalMinutes += slotMinutes;
  }
  return slots;
}

const categoryColor = (cat) =>
cat === 'Herren' ? 'bg-blue-100 text-blue-700 border-blue-200' :
cat === 'Damen' ? 'bg-pink-100 text-pink-700 border-pink-200' :
'bg-purple-100 text-purple-700 border-purple-200';

const getPaidPlayerIds = (team) => {
  try {return JSON.parse(team?.paid_player_ids || '[]');} catch {return [];}
};

const getOnlinePaidPlayerIds = (team) => {
  try {return JSON.parse(team?.online_paid_player_ids || '[]');} catch {return [];}
};

const getEinzelstarterPaidIds = (tournament) => {
  try {return JSON.parse(tournament?.einzelstarter_paid_ids || '[]');} catch {return [];}
};

const getEinzelstarterOnlinePaidIds = (tournament) => {
  try {return JSON.parse(tournament?.einzelstarter_online_paid_ids || '[]');} catch {return [];}
};

function PlayerPicker({ candidates, scheduledKeys, currentKey, onSelect, onClose }) {
  const ref = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handler = (e) => {if (ref.current && !ref.current.contains(e.target)) onClose();};
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const available = candidates.filter((p) => {
    if (!p.playerId) return false;
    return p.playerName.toLowerCase().includes(search.toLowerCase()) ||
    p.teamName.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-52 bg-card border border-border rounded-xl shadow-lg p-2">
      <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Spieler suchen..." className="h-7 text-xs mb-2" />
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {available.length === 0 ?
        <p className="text-xs text-muted-foreground px-2 py-1">Keine verfügbar</p> :
        available.map((p) =>
        <button key={`${p.teamId}-${p.playerId}`} onClick={() => onSelect(p)}
        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/60 transition-colors ${categoryColor(p.category)}`}>
            <div className="font-semibold">{p.playerName}</div>
            <div className="opacity-60">{p.teamName}</div>
          </button>
        )}
      </div>
    </div>);

}

function TeamPicker({ teams, scheduledTeamIds, onSelect, onClose }) {
  const ref = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handler = (e) => {if (ref.current && !ref.current.contains(e.target)) onClose();};
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const available = teams.filter((t) =>
  !scheduledTeamIds.has(t.id) && t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-52 bg-card border border-border rounded-xl shadow-lg p-2">
      <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Team suchen..." className="h-7 text-xs mb-2" />
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {available.length === 0 ?
        <p className="text-xs text-muted-foreground px-2 py-1">Keine Teams verfügbar</p> :
        available.map((t) =>
        <button key={t.id} onClick={() => onSelect(t)}
        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/60 transition-colors ${categoryColor(t.category)}`}>
            <div className="font-semibold">{t.name}</div>
            <div className="opacity-60">{t.category}</div>
          </button>
        )}
      </div>
    </div>);

}

const DEFAULT_DAYS = [{ name: 'Tag 1', date: null, startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }];

function parseDayConfigs(str) {
  try {
    const parsed = JSON.parse(str || '');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

export default function SchedulePlanner({ tournamentId, tournament, teams, slotDuration = 60, teamSize = 4, onDaysChange, isOwner = false, userTeamIds = [], canScheduleOwnTeams = false, onEditTeam, globalPaymentEnabled = true, userId, userEmail, tourFeeCents = 0, canSeePhone = false, initialDay = null }) {
  const queryClient = useQueryClient();
  const { playerMap, players, getPlayerName } = usePlayerMap();
  const userPlayerIds = useMemo(() => {
    const ids = new Set();
    if (!userEmail) return ids;
    players.forEach(p => { if (p.user_email === userEmail) ids.add(p.id); });
    return ids;
  }, [players, userEmail]);
  const [dragging, setDragging] = useState(null);
  // Touch/click-to-place: selected sidebar item waiting to be placed
  const [selected, setSelected] = useState(null);
  const [pickerCell, setPickerCell] = useState(null);
  const [teamPickerCell, setTeamPickerCell] = useState(null);
  const [paymentCell, setPaymentCell] = useState(null);
  const [editingEinzelPlayer, setEditingEinzelPlayer] = useState(null);
  const [einzelDialog, setEinzelDialog] = useState(null);
  const [paying, setPaying] = useState(null);
  const isEinzelturnier = teamSize === 1;
  const isFutureSeries = tournament?.series_type === 'future';
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [activeDay, setActiveDay] = useState('Tag 1');
  const [editPast, setEditPast] = useState(false);
  const initialDayApplied = useRef(false);
  // Multi-Spielort: venues aus dem Turnier ableiten, aktiven Spielort verwalten
  const venues = useMemo(() => getVenues(tournament), [tournament]);
  const isMultiVenueTournament = venues.length > 1;
  const [activeVenue, setActiveVenue] = useState(0);
  const activeVenueObj = venues[Math.min(activeVenue, venues.length - 1)] || venues[0];
  const laneCount = activeVenueObj?.lane_count || 4;
  const paymentActive = tournament && tournament.payment_enabled && globalPaymentEnabled;

  useEffect(() => {
    if (tournament) {
      const saved = parseDayConfigs(tournament.day_configs);
      const resolved = saved && saved.length > 0 ? saved : DEFAULT_DAYS;
      // Spieltage nach Datum sortieren (Tage ohne Datum ans Ende)
      const sorted = [...resolved].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
      });
      setDays(sorted);
      setActiveDay((prev) => {
        if (!initialDayApplied.current) {
          initialDayApplied.current = true;
          // 1. Deep Link via initialDay-Prop
          if (initialDay) {
            const match = sorted.find((d) => d.date === initialDay || d.name === initialDay);
            if (match) return match.name;
          }
          // 2. Heutigen Spieltag wählen (Datum entspricht heute)
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const todayMatch = sorted.find((d) => d.date === todayStr);
          if (todayMatch) return todayMatch.name;
          // 3. Ersten anstehenden Spieltag (Datum >= heute) wählen
          const upcoming = sorted.find((d) => d.date && d.date >= todayStr);
          if (upcoming) return upcoming.name;
          // 4. Fallback: bisheriger Tag oder erster Tag
          if (prev && sorted.find((d) => d.name === prev)) return prev;
          return sorted[0]?.name || 'Tag 1';
        }
        // Nach erstem Setup: Auswahl beibehalten, falls noch vorhanden
        if (prev && sorted.find((d) => d.name === prev)) return prev;
        return sorted[0]?.name || 'Tag 1';
      });
      onDaysChange?.(sorted);
    }
  }, [tournament]);

  const activeDayObj = days.find((d) => d.name === activeDay) || days[0];
  const startHour = activeDayObj?.startHour ?? 8;
  const startMinute = activeDayObj?.startMinute ?? 0;
  const endHour = activeDayObj?.endHour ?? 18;
  const endMinute = activeDayObj?.endMinute ?? 0;

  const { data: schedules = [] } = useQuery({
    queryKey: ['schedules', tournamentId],
    queryFn: () => base44.entities.TournamentSchedule.filter({ tournament_id: tournamentId })
  });

  const assignMutation = useMutation({
    mutationFn: async ({ teamId, playerId, startTime, lane, day, isPlaceholder, placeholderLabel, replaceId, venue }) => {
      const venueKey = venue != null ? String(venue) : '0';
      if (replaceId) {
        await base44.entities.TournamentSchedule.update(replaceId, {
          team_id: teamId || '',
          player_id: playerId || '',
          is_placeholder: isPlaceholder || false,
          placeholder_label: placeholderLabel || ''
        });
        if (!isPlaceholder) {
          const old = schedules.find((s) => s.team_id === teamId && s.player_id === playerId && s.id !== replaceId);
          if (old) await base44.entities.TournamentSchedule.delete(old.id);
        }
        return;
      }
      // Bei Einzelstartern (team_id leer) dürfen Spieler mehrfach verplant
      // werden – daher bestehende Einträge nicht entfernen. Nur bei echten
      // Mannschaften (team_id gesetzt) wird der alte Eintrag ersetzt.
      if (!isPlaceholder && playerId && playerId !== '' && teamId) {
        const old = schedules.find((s) => s.team_id === teamId && s.player_id === playerId);
        if (old) await base44.entities.TournamentSchedule.delete(old.id);
      }
      // Only delete conflicting entry at this exact cell (same time+lane+day+venue)
      const conflict = schedules.find((s) =>
      s.start_time === startTime && s.lane === lane && (s.day || 'Tag 1') === day && venueKeyOf(s) === venueKey
      );
      if (conflict) await base44.entities.TournamentSchedule.delete(conflict.id);

      await base44.entities.TournamentSchedule.create({
        tournament_id: tournamentId,
        team_id: teamId || '',
        player_id: playerId || '',
        is_placeholder: isPlaceholder || false,
        placeholder_label: placeholderLabel || '',
        start_time: startTime,
        lane,
        day: day || 'Tag 1',
        venue: venueKey
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tournamentId] })
  });

  const removeMutation = useMutation({
    mutationFn: (id) => base44.entities.TournamentSchedule.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tournamentId] })
  });

  const togglePlayerPaymentMutation = useMutation({
    mutationFn: ({ teamId, playerId, currentPaidIds, allPlayerIds }) => {
      let newPaidIds;
      if (currentPaidIds.includes(playerId)) {
        newPaidIds = currentPaidIds.filter((id) => id !== playerId);
      } else {
        newPaidIds = [...currentPaidIds, playerId];
      }
      const allPaid = allPlayerIds.length > 0 && allPlayerIds.every((id) => newPaidIds.includes(id));
      return base44.entities.Team.update(teamId, {
        paid_player_ids: JSON.stringify(newPaidIds),
        payment_status: allPaid ? 'cash' : 'pending'
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', tournamentId] })
  });

  const toggleEinzelstarterPaymentMutation = useMutation({
    mutationFn: ({ playerId, currentPaidIds }) => {
      let newPaidIds;
      if (currentPaidIds.includes(playerId)) {
        newPaidIds = currentPaidIds.filter((id) => id !== playerId);
      } else {
        newPaidIds = [...currentPaidIds, playerId];
      }
      return base44.entities.Tournament.update(tournamentId, {
        einzelstarter_paid_ids: JSON.stringify(newPaidIds)
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] })
  });

  const handlePay = async (teamId, payMode = 'player', playerId = null) => {
    if (window.self !== window.top) {
      alert('Die Zahlung funktioniert nur in der veröffentlichten App. Bitte öffne die App in einem neuen Tab.');
      return;
    }
    setPaying(`${teamId}:${payMode}:${playerId || ''}`);
    try {
      const res = await base44.functions.invoke('createCheckoutSession', {
        team_id: teamId,
        tournament_id: tournamentId,
        mode: payMode,
        player_id: playerId,
        success_url: `${window.location.origin}/tournaments/${tournamentId}?payment=success`,
        cancel_url: `${window.location.origin}/tournaments/${tournamentId}?payment=cancelled`
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setPaying(null);
      }
    } catch (e) {
      alert('Zahlung konnte nicht gestartet werden: ' + (e.message || 'Unbekannter Fehler'));
      setPaying(null);
    }
  };

  const hours = useMemo(() => generateSlots(startHour * 60 + startMinute, endHour * 60 + endMinute, slotDuration), [startHour, startMinute, endHour, endMinute, slotDuration]);

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    // Parse as local date (avoid UTC midnight issue: "2026-05-09" → local midnight)
    const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Ein Slot bleibt 60 Minuten nach seinem geplanten Start bearbeitbar
  // (Spieler/Mannschaften können noch ausgetauscht werden), erst danach
  // wird er als "vergangen" gesperrt.
  const EDIT_GRACE_MINUTES = 60;
  const isSlotInPast = (time) => {
    const dayDate = activeDayObj?.date || tournament?.date;
    const base = parseLocalDate(dayDate);
    if (!base) return false;
    const [h, m] = time.split(':').map(Number);
    base.setHours(h, m, 0, 0);
    return base.getTime() + EDIT_GRACE_MINUTES * 60 * 1000 < new Date().getTime();
  };

  // For non-owners: block booking if less than 2 slots before slot start
  const isSlotBookingLocked = (time) => {
    const dayDate = activeDayObj?.date || tournament?.date;
    const base = parseLocalDate(dayDate);
    if (!base) return false;
    const [h, m] = time.split(':').map(Number);
    base.setHours(h, m, 0, 0);
    const lockBefore = new Date(base.getTime() - slotDuration * 2 * 60 * 1000);
    return new Date() >= lockBefore;
  };

  const allPlayers = useMemo(() => {
    return teams.flatMap((team) =>
    [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].
    filter(Boolean).
    map((playerId) => ({
      key: `${team.id}-${playerId}`,
      teamId: team.id,
      teamName: team.name,
      playerId,
      playerName: getPlayerName(playerId),
      category: team.category,
      isPlaceholder: false
    }))
    );
  }, [teams, playerMap]);

  const scheduledPlayerKeys = new Set(
    schedules.filter((s) => !s.is_placeholder && s.player_id).map((s) => `${s.team_id}-${s.player_id}`)
  );
  const unscheduled = allPlayers.filter((p) => !scheduledPlayerKeys.has(`${p.teamId}-${p.playerId}`));
  const scheduledTeamIds = new Set();
  const daySchedules = schedules.filter((s) => (s.day || 'Tag 1') === activeDay && Number(venueKeyOf(s)) === activeVenue);
  const getAssignment = (time, lane) => daySchedules.find((s) => s.start_time === time && s.lane === lane);

  const doAssign = (time, lane, item) => {
    assignMutation.mutate({
      teamId: item.teamId || '',
      playerId: item.playerId || '',
      startTime: time,
      lane,
      day: activeDay,
      isPlaceholder: item.isPlaceholder || false,
      placeholderLabel: item.placeholderLabel || '',
      venue: activeVenue
    });
  };

  const handleDrop = (time, lane) => {
    if (!dragging) return;
    doAssign(time, lane, dragging);
    setDragging(null);
  };

  // Handle cell tap when an item is selected (touch/click mode)
  const handleCellTap = (time, lane, assignment, canDropHere) => {
    if (selected && canDropHere && !assignment) {
      doAssign(time, lane, selected);
      setSelected(null);
      return;
    }
    if (selected && canDropHere && assignment) {
      // Replace existing
      doAssign(time, lane, selected);
      setSelected(null);
      return;
    }
  };

  // Select a sidebar item (tap to select, tap again to deselect)
  const handleSidebarTap = (item) => {
    setSelected((prev) => prev?.key === item.key ? null : item);
  };

  return (
    <div className="space-y-5">
      {/* Day tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        {[...days].sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date.localeCompare(b.date);
        }).map((day) =>
        <button key={day.name} onClick={() => setActiveDay(day.name)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeDay === day.name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {day.name}
            {day.date &&
          <span className="ml-1.5 text-xs opacity-70">
                {(() => {try {return new Date(day.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });} catch {return '';}})()}
              </span>
          }
          </button>
        )}
        {isOwner && <span className="text-xs text-muted-foreground italic ml-1">· Tage in „Details" festlegen</span>}
        {isOwner &&
        <button
          onClick={() => setEditPast((v) => !v)}
          className={`ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${editPast ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'}`}
          title="Vergangene Slots bearbeiten">
          
            <History className="w-3.5 h-3.5" />
            {editPast ? 'Vergangenheit gesperrt' : 'Vergangenheit bearbeiten'}
          </button>
        }
      </div>

      {/* Spielort-Tabs (Multi-Spielort) */}
      {isMultiVenueTournament && (
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

      {/* Time range info */}
      <div className="flex items-center gap-4 flex-wrap bg-muted/30 rounded-xl px-4 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground">{activeDay}:</span>
        <span className="text-sm text-foreground font-medium">
          {String(startHour).padStart(2, '0')}:{String(startMinute).padStart(2, '0')} – {String(endHour).padStart(2, '0')}:{String(endMinute).padStart(2, '0')} Uhr
        </span>
        <span className="text-xs text-muted-foreground">· {slotDuration} min pro Durchgang · Bahn 1–{laneCount}</span>
        {isMultiVenueTournament && activeVenueObj?.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeVenueObj.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-600 hover:underline truncate"
            title="In Google Maps öffnen"
          >
            📍 {activeVenueObj.location}
          </a>
        )}
      </div>

      {/* Selected item banner */}
      {selected &&
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border-2 border-primary text-sm font-semibold ${categoryColor(selected.category || '')}`}>
          <span>
            ✋ Ausgewählt: <strong>{selected.playerName || selected.teamName || 'Platzhalter'}</strong>
            {selected.teamName && selected.playerName && <span className="font-normal opacity-70"> · {selected.teamName}</span>}
            {' '}– Jetzt auf eine Zelle tippen zum Platzieren
          </span>
          <button onClick={() => setSelected(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      }

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          {isOwner && !isEinzelturnier && (() => {
            const visibleTeams = isOwner ? teams : teams.filter((t) => userTeamIds.includes(t.id));

            const teamSlotsInGrid = {};
            schedules.filter((s) => !s.is_placeholder && s.team_id).forEach((s) => {
              teamSlotsInGrid[s.team_id] = (teamSlotsInGrid[s.team_id] || 0) + 1;
            });

            const items = visibleTeams.flatMap((t) => {
              const playerIds = [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id].filter(Boolean);
              const unscheduledKnown = (isOwner ? unscheduled : unscheduled.filter((p) => userTeamIds.includes(p.teamId))).
              filter((p) => p.teamId === t.id);
              const slotsInGrid = teamSlotsInGrid[t.id] || 0;
              const anonCapacity = Math.max(0, teamSize - slotsInGrid - unscheduledKnown.length);
              const anonItems = Array.from({ length: anonCapacity }, (_, i) => ({
                type: 'team-slot',
                key: `${t.id}-anon-${i}`,
                team: t,
                teamId: t.id,
                teamName: t.name,
                playerId: '',
                playerName: '',
                category: t.category,
                isPlaceholder: false,
                slotIndex: slotsInGrid + unscheduledKnown.length + i + 1
              }));
              return [...unscheduledKnown, ...anonItems];
            });

            const totalCount = items.length;
            return (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Nicht eingeplant ({totalCount})
                </p>
                <div className="space-y-1.5 min-h-[60px] rounded-xl border border-dashed border-border p-3">
                  {totalCount === 0 ?
                  <p className="text-xs text-muted-foreground text-center py-2">Alle eingeplant ✓</p> :
                  items.map((item) => {
                    const isTeamSlot = item.type === 'team-slot';
                    const t = isTeamSlot ? item.team : null;
                    const p = isTeamSlot ? null : item;
                    const isSelectedItem = selected?.key === item.key;
                    return (
                      <div
                        key={item.key}
                        draggable
                        onDragStart={() => {setDragging(item);setSelected(null);}}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => handleSidebarTap(item)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-all ${categoryColor(isTeamSlot ? t.category : p.category)} ${isSelectedItem ? 'ring-2 ring-primary ring-offset-1 scale-[1.02]' : 'active:scale-95'}`}>
                        
                        {isTeamSlot ?
                        <>
                            <div className="font-semibold truncate">{t.name}</div>
                            <div className="opacity-60 text-xs">{t.category} · Slot {item.slotIndex}/{teamSize}</div>
                          </> :

                        <>
                            <div className="font-semibold truncate">{p.playerName}</div>
                            <div className="opacity-60 text-xs truncate">{p.teamName}</div>
                          </>
                        }
                      </div>);

                  })}
                </div>
              </>);

          })()}

          {isOwner &&
          <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4">Platzhalter</p>
              <div
              draggable
              onDragStart={() => {setDragging({ key: 'placeholder', isPlaceholder: true, placeholderLabel: 'Platzhalter', teamId: '', playerId: '' });setSelected(null);}}
              onDragEnd={() => setDragging(null)}
              onClick={() => handleSidebarTap({ key: 'placeholder', isPlaceholder: true, placeholderLabel: 'Platzhalter', teamId: '', playerId: '', category: '' })}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border border-dashed border-border bg-muted/30 cursor-pointer select-none text-center text-muted-foreground transition-all ${selected?.key === 'placeholder' ? 'ring-2 ring-primary ring-offset-1' : ''}`}>
              
                ＋ Platzhalter
              </div>
            </>
          }

          {(isOwner || canScheduleOwnTeams) &&
          <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4">{isEinzelturnier ? 'NEUER SPIELER' : 'NEUER SPIELER /NEUES TEAM'}</p>
              <div className="relative">
                <button onClick={() => setEinzelDialog({ mode: 'sidebar' })} className="w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 cursor-pointer select-none text-center hover:bg-emerald-100 transition-all">
                
                  ＋ Einzelstarter
                </button>
              </div>

              {!isEinzelturnier &&
              <button
              onClick={() => onEditTeam && onEditTeam(null)}
              className="w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 text-primary cursor-pointer select-none text-center hover:bg-primary/10 transition-all mt-2">
              
                ＋ Mannschaft
              </button>
              }
            </>
          }
        </div>

        {/* Schedule grid */}
        <div className="lg:col-span-4 overflow-x-auto schedule-table-wrapper">
          <table className="text-sm border-collapse schedule-table" style={{ minWidth: `${80 + laneCount * 160}px` }}>
            <thead>
              <tr>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground" style={{ width: '80px' }}>Zeit</th>
                {getLanes(laneCount).map((lane) =>
                <th key={lane} className="text-center py-2 px-1 text-xs font-semibold text-muted-foreground" style={{ width: '160px' }}>Bahn {lane}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {hours.map((time, hi) =>
              <tr key={time} className={hi % 2 === 0 ? 'bg-muted/10' : ''}>
                  <td className="py-2 pr-3 align-top" style={{ width: '80px' }}>
                    <span className="flex items-center gap-1 text-xs font-semibold text-foreground whitespace-nowrap">
                      <Clock className="w-3 h-3 text-muted-foreground" />{time}
                    </span>
                  </td>
                  {getLanes(laneCount).map((lane) => {
                  const assignment = getAssignment(time, lane);
                  const cellKey = `${time}::${lane}`;
                  const isPlayerPickerOpen = pickerCell === cellKey;
                  const isTeamPickerOpen = teamPickerCell === cellKey;
                  const canEdit = isOwner;
                  const canActOnOwnTeam = canScheduleOwnTeams && userTeamIds.length > 0;
                  const draggingOwnPlayer = dragging && userTeamIds.includes(dragging.teamId);
                  const selectedIsOwnTeam = selected && userTeamIds.includes(selected.teamId);
                  const isPast = isSlotInPast(time) && !(isOwner && editPast);
                  const isLocked = !isOwner && isSlotBookingLocked(time);
                  const canDropHere = !isPast && !isLocked && (canEdit || !assignment && (draggingOwnPlayer || selectedIsOwnTeam || canActOnOwnTeam));
                  const canSchedule = !isPast && !isLocked && (isOwner || canActOnOwnTeam);

                  const isPlaceholder = assignment?.is_placeholder;
                  const hasTeam = assignment && !isPlaceholder && assignment.team_id;
                  const hasPlayer = hasTeam && assignment.player_id;
                  const isEinzelstarter = assignment && !isPlaceholder && !assignment.team_id && !!assignment.player_id;
                  const teamInfo = hasTeam ? teams.find((t) => t.id === assignment.team_id) : null;
                  const isDeleteRequested = teamInfo?.delete_requested;
                  const player = hasPlayer ? playerMap[assignment.player_id] : null;
                  const isUserInTeam = teamInfo && [teamInfo.player1_id, teamInfo.player2_id, teamInfo.player3_id, teamInfo.player4_id, teamInfo.player5_id, teamInfo.player6_id].some(id => userPlayerIds.has(id));
                  const canPayTeam = isOwner || userTeamIds.includes(teamInfo?.id) || isUserInTeam;

                  // Highlight empty cells when an item is selected
                  const isDropTarget = selected && canDropHere && !assignment;

                  return (
                    <td
                      key={lane}
                      className="py-1.5 px-1 align-top relative"
                      style={{ width: '160px' }}
                      onDragOver={canDropHere ? (e) => e.preventDefault() : undefined}
                      onDrop={canDropHere ? () => handleDrop(time, lane) : undefined}>
                      
                        {assignment ?
                      isPlaceholder ?
                      <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-2.5 py-2" style={{ width: '160px' }}>
                               <div className="flex items-start justify-between gap-1">
                                 <div className="text-xs text-muted-foreground italic truncate">
                                   {assignment.placeholder_label || 'Platzhalter'}
                                 </div>
                                 {canEdit && (!isSlotInPast(time) || editPast) &&
                          <button onClick={() => removeMutation.mutate(assignment.id)} className="opacity-40 hover:opacity-100">
                                     <Trash2 className="w-3 h-3" />
                                   </button>
                          }
                               </div>
                             </div> :
                      hasTeam && teamInfo ?
                      <div
                        className={`rounded-xl border px-2.5 py-2 ${isDeleteRequested ? 'bg-orange-50 border-orange-300 text-orange-800 opacity-60' : !hasPlayer ? 'bg-red-50 border-red-300 text-red-800' : categoryColor(teamInfo.category)} ${selected && canDropHere ? 'cursor-pointer ring-2 ring-primary/50' : ''}`}
                        style={{ width: '160px' }}
                        onClick={() => {
                          if (selected && canDropHere) {
                            handleCellTap(time, lane, assignment, canDropHere);
                          }
                        }}>
                        
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <div className={`text-xs font-bold truncate ${isDeleteRequested ? 'line-through' : ''}`}>
                                    {teamInfo.name}
                                  </div>
                                  {hasPlayer ?
                            <>
                                      <div className={`text-[11px] font-normal truncate leading-tight ${isDeleteRequested ? 'line-through' : ''}`}>
                                        {player?.first_name || ''}
                                      </div>
                                      <div className={`text-xs font-bold truncate flex items-center gap-1 leading-tight ${isDeleteRequested ? 'line-through' : ''}`}>
                                        <span className="truncate">{player?.last_name || getPlayerName(assignment.player_id)}</span>
                                        {canSeePhone && <PlayerIdInfo playerId={assignment.player_id} />}
                                      </div>
                                      {isFutureSeries && player?.age_class && <div className="text-[10px] opacity-70 font-semibold truncate">{player.age_class}</div>}
                                      {canSeePhone && <div className="text-[10px] opacity-60 truncate">📱 {player?.phone || 'keine Nummer'}</div>}
                                    </> :

                            <div className="text-[10px] text-red-600 font-semibold italic">⚠ Spieler fehlt</div>
                            }
                                  {paymentActive && canPayTeam &&
                            <div className="flex items-center gap-1">
                                  {(() => {
                                const paidIds = getPaidPlayerIds(teamInfo);
                                const onlinePaidIds = getOnlinePaidPlayerIds(teamInfo);
                                if (!hasPlayer) {
                                  const allTeamPids = [teamInfo.player1_id, teamInfo.player2_id, teamInfo.player3_id, teamInfo.player4_id, teamInfo.player5_id, teamInfo.player6_id].filter(Boolean);
                                  const allPaid = allTeamPids.length > 0 && allTeamPids.every(id => paidIds.includes(id) || onlinePaidIds.includes(id));
                                  return allPaid ?
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-green-100 text-green-700 flex-shrink-0"><CheckCircle2 className="w-2.5 h-2.5" /> Bezahlt</span>
                                  : null;
                                }
                                const isPaidCash = paidIds.includes(assignment.player_id);
                                const isPaidOnline = onlinePaidIds.includes(assignment.player_id);
                                return (
                                  <>
                                        {isPaidCash ?
                                    <button onClick={(e) => {e.stopPropagation();setPaymentCell(paymentCell === cellKey ? null : cellKey);}} className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer transition-colors flex-shrink-0">
                                            <CheckCircle2 className="w-2.5 h-2.5" /> Bar
                                          </button> :
                                    isPaidOnline ?
                                    <button onClick={(e) => {e.stopPropagation();setPaymentCell(paymentCell === cellKey ? null : cellKey);}} className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer transition-colors flex-shrink-0">
                                            <CheckCircle2 className="w-2.5 h-2.5" /> Online
                                          </button> :

                                    <button
                                      onClick={(e) => {e.stopPropagation();setPaymentCell(paymentCell === cellKey ? null : cellKey);}}
                                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-colors flex-shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-200">
                                      
                                            Bezahlen
                                          </button>
                                    }
                                      </>);

                              })()}
                                  </div>
                            }
                                </div>
                                {canEdit && !selected && (!isSlotInPast(time) || editPast) &&
                          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                                    <button
                              onClick={() => onEditTeam && onEditTeam(teamInfo)}
                              className="hover:opacity-100 opacity-60"
                              title="Mannschaft bearbeiten">
                              
                                       <Pencil className="w-3 h-3" />
                                     </button>
                                    <button onClick={() => removeMutation.mutate(assignment.id)} className="opacity-40 hover:opacity-100">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                          }
                              </div>
                            </div> :
                      isEinzelstarter ?
                      <div
                        className={`rounded-xl border px-2.5 py-2 ${categoryColor(playerMap[assignment.player_id]?.category || '')} ${selected && canDropHere ? 'cursor-pointer ring-2 ring-primary/50' : ''}`}
                        style={{ width: '160px' }}
                        onClick={() => {
                          if (selected && canDropHere) {
                            handleCellTap(time, lane, assignment, canDropHere);
                          }
                        }}>
                        
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-normal truncate leading-tight">
                                    {playerMap[assignment.player_id]?.first_name || ''}
                                  </div>
                                  <div className="text-xs font-bold truncate flex items-center gap-1 leading-tight">
                                    <span className="truncate">{playerMap[assignment.player_id]?.last_name || getPlayerName(assignment.player_id)}</span>
                                    {canSeePhone && <PlayerIdInfo playerId={assignment.player_id} />}
                                  </div>
                                  <div className="text-[10px] opacity-70 font-semibold truncate">
                                    {(() => {
                                      const p = playerMap[assignment.player_id];
                                      const ak = isFutureSeries && p?.age_class ? p.age_class : '';
                                      const club = isFutureSeries && p?.club ? p.club : '';
                                      return [ak, club || 'Einzelstarter'].filter(Boolean).join(' · ');
                                    })()}
                                  </div>
                                  {canSeePhone && <div className="text-[10px] opacity-60 truncate">📱 {playerMap[assignment.player_id]?.phone || 'keine Nummer'}</div>}
                                  {paymentActive && (isOwner || assignment.created_by_id === userId || userPlayerIds.has(assignment.player_id)) &&
                            <div className="flex items-center gap-1 mt-0.5">
                                      {(() => {
                                const ezPaidIds = getEinzelstarterPaidIds(tournament);
                                const ezOnlinePaidIds = getEinzelstarterOnlinePaidIds(tournament);
                                const isPaidCash = ezPaidIds.includes(assignment.player_id);
                                const isPaidOnline = ezOnlinePaidIds.includes(assignment.player_id);
                                return (
                                  <>
                                            {isPaidCash ?
                                    <button onClick={(e) => {e.stopPropagation();setPaymentCell(paymentCell === cellKey ? null : cellKey);}} className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer transition-colors flex-shrink-0">
                                                <CheckCircle2 className="w-2.5 h-2.5" /> Bar
                                              </button> :
                                    isPaidOnline ?
                                    <button onClick={(e) => {e.stopPropagation();setPaymentCell(paymentCell === cellKey ? null : cellKey);}} className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer transition-colors flex-shrink-0">
                                                <CheckCircle2 className="w-2.5 h-2.5" /> Online
                                              </button> :
                                    <button onClick={(e) => {e.stopPropagation();setPaymentCell(paymentCell === cellKey ? null : cellKey);}} className="text-[9px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-colors flex-shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-200">
                                                Bezahlen
                                              </button>
                                    }
                                          </>);

                              })()}
                                    </div>
                            }
                                </div>
                                {canEdit && !selected && (!isSlotInPast(time) || editPast) &&
                          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                                    <button
                                      onClick={(e) => {e.stopPropagation();setEditingEinzelPlayer(playerMap[assignment.player_id]);}}
                                      className="opacity-60 hover:opacity-100"
                                      title="Spieler bearbeiten">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => removeMutation.mutate(assignment.id)} className="opacity-40 hover:opacity-100">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                          }
                              </div>
                            </div> :
                      null :
                      isPast ?
                      <div className="h-14 rounded-xl border border-dashed border-border/20 bg-muted/5 flex items-center justify-center text-muted-foreground/20 text-xs" style={{ width: '160px' }}>—</div> :
                      canSchedule ?
                      <div
                        className={`h-14 rounded-xl border border-dashed transition-colors flex items-center justify-center text-xs cursor-pointer
                               ${isDropTarget ?
                        'border-primary bg-primary/10 text-primary animate-pulse' :
                        'border-border/60 bg-muted/10 hover:bg-muted/30 text-muted-foreground/30'}`
                        }
                        style={{ width: '160px' }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(time, lane)}
                        onClick={() => {
                          if (selected) {
                            handleCellTap(time, lane, assignment, canDropHere);
                          } else if (isEinzelturnier) {
                            setEinzelDialog({ mode: 'cell', time, lane });
                            setTeamPickerCell(null);
                            setPickerCell(null);
                            setPaymentCell(null);
                          } else {
                            setTeamPickerCell(isTeamPickerOpen ? null : cellKey);
                            setPickerCell(null);
                            setPaymentCell(null);
                          }
                        }}>

                             {isDropTarget ? '✓ Hier platzieren' : isEinzelturnier ? '+ Spieler' : '+ Team'}
                           </div> :
                      isLocked ?
                      <div className="h-14 rounded-xl border border-dashed border-amber-200 bg-amber-50/40 flex items-center justify-center text-amber-500 text-xs px-2 text-center" style={{ width: '160px' }}>
                             Buchung &lt;{Math.round(slotDuration * 2 / 60 * 10) / 10}h vor Start gesperrt – bitte direkt Kontakt mit dem Veranstalter aufnehmen
                           </div> :

                      <div className="h-14 rounded-xl border border-dashed border-border/30 bg-muted/5 flex items-center justify-center text-muted-foreground/20 text-xs" style={{ width: '160px' }}>—</div>
                      }
                        {isPlayerPickerOpen &&
                      <PlayerPicker
                        candidates={canEdit ? allPlayers.filter((p) => p.teamId === assignment?.team_id) : allPlayers.filter((p) => userTeamIds.includes(p.teamId) && p.teamId === assignment?.team_id)}
                        scheduledKeys={new Set()}
                        currentKey={assignment ? `${assignment.team_id}-${assignment.player_id}` : null}
                        onSelect={(p) => {
                          assignMutation.mutate({ teamId: assignment.team_id, playerId: p.playerId, startTime: time, lane, day: activeDay, isPlaceholder: false, replaceId: assignment.id, venue: activeVenue });
                          setPickerCell(null);
                        }}
                        onClose={() => setPickerCell(null)} />

                      }
                        {isTeamPickerOpen &&
                      <TeamPicker
                        teams={(canEdit ? teams : teams.filter((t) => userTeamIds.includes(t.id))).filter((t) => {
                          const totalInGrid = schedules.filter((s) => !s.is_placeholder && s.team_id === t.id).length;
                          return totalInGrid < teamSize;
                        })}
                        scheduledTeamIds={scheduledTeamIds}
                        onSelect={(t) => {
                          assignMutation.mutate({ teamId: t.id, playerId: '', startTime: time, lane, day: activeDay, isPlaceholder: false, venue: activeVenue });
                          setTeamPickerCell(null);
                        }}
                        onClose={() => setTeamPickerCell(null)} />

                      }

                        {paymentCell === cellKey && teamInfo && (() => {
                        const allTeamPlayerIds = [teamInfo.player1_id, teamInfo.player2_id, teamInfo.player3_id, teamInfo.player4_id, teamInfo.player5_id, teamInfo.player6_id].filter(Boolean);
                        const playerCount = allTeamPlayerIds.length;
                        const tourFeeEuros = (tourFeeCents || 0) / 100;
                        const perPlayer = (tournament?.payment_amount || 0) / 100 / (tournament?.team_size || teamSize || 4) + tourFeeEuros;
                        const playerAmount = perPlayer.toFixed(2);
                        const paidCashIds = getPaidPlayerIds(teamInfo);
                        const onlinePaidIds = getOnlinePaidPlayerIds(teamInfo);
                        const unpaidPlayerIds = allTeamPlayerIds.filter(id => !paidCashIds.includes(id) && !onlinePaidIds.includes(id));
                        const unpaidCount = unpaidPlayerIds.length;
                        const remainingAmount = (perPlayer * unpaidCount).toFixed(2);
                        const allTeamPaid = unpaidCount === 0;
                        const isTeamMember = allTeamPlayerIds.some(id => userPlayerIds.has(id));
                        const canPay = isOwner || userTeamIds.includes(teamInfo.id) || isTeamMember;
                        const clickedPlayerPaid = paidCashIds.includes(assignment.player_id) || onlinePaidIds.includes(assignment.player_id);
                        return (
                          <div className="absolute z-50 top-full left-0 mt-1 w-60 bg-card border border-border rounded-xl shadow-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zahlung</span>
                              <button onClick={() => setPaymentCell(null)} className="opacity-50 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="text-sm font-bold text-foreground truncate">{teamInfo.name}</div>
                            {isOwner ?
                            <div className="space-y-2">
                                {unpaidCount > 0 &&
                                  <button
                                    onClick={() => handlePay(teamInfo.id, 'team')}
                                    disabled={paying === `${teamInfo.id}:team:`}
                                    className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                                    <CreditCard className="w-3 h-3" /> Online bezahlen – ganze Mannschaft ({remainingAmount} €{unpaidCount < playerCount ? ` · ${unpaidCount}/${playerCount} offen` : ''})
                                  </button>
                                }
                                <div className="text-xs font-semibold text-muted-foreground pt-2 border-t border-border">Spieler einzeln markieren:</div>
                                {(() => {
                                const paidIds = getPaidPlayerIds(teamInfo);
                                const onlinePaidIds = getOnlinePaidPlayerIds(teamInfo);
                                const allPlayerIds = [teamInfo.player1_id, teamInfo.player2_id, teamInfo.player3_id, teamInfo.player4_id, teamInfo.player5_id, teamInfo.player6_id].filter(Boolean);
                                return allPlayerIds.map((pid) => {
                                  const isPaidCash = paidIds.includes(pid);
                                  const isPaidOnline = onlinePaidIds.includes(pid);
                                  return (
                                    <div key={pid} className="flex items-center justify-between gap-2">
                                        <span className="text-xs truncate flex-1">{getPlayerName(pid)}</span>
                                        <div className="flex items-center gap-1">
                                          <button
                                          onClick={() => togglePlayerPaymentMutation.mutate({ teamId: teamInfo.id, playerId: pid, currentPaidIds: paidIds, allPlayerIds })}
                                          disabled={togglePlayerPaymentMutation.isPending}
                                          title={isPaidCash ? 'Klicken zum Entfernen' : 'Bar bezahlt markieren'}
                                          className={`text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer ${isPaidCash ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-amber-100 text-amber-700 hover:bg-green-100 hover:text-green-700'}`}>
                                          
                                            {isPaidCash ? <><CheckCircle2 className="w-3 h-3" /> Bar (entfernen)</> : 'Bar'}
                                          </button>
                                          <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${isPaidOnline ? 'bg-blue-100 text-blue-700' : 'bg-muted/20 text-muted-foreground'}`}>
                                            {isPaidOnline ? <><CheckCircle2 className="w-3 h-3 inline" /> Online</> : 'Online'}
                                          </div>
                                        </div>
                                      </div>);

                                });
                              })()}
                              </div> :
                            allTeamPaid ?
                            <div className="flex items-center gap-2 text-sm text-green-700 font-medium bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <CheckCircle2 className="w-4 h-4" /> Bezahlt ✓
                              </div> :

                            <div className="space-y-2">
                                {canPay && unpaidCount > 0 &&
                                  <button
                                    onClick={() => handlePay(teamInfo.id, 'team')}
                                    disabled={paying === `${teamInfo.id}:team:`}
                                    className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                                    <CreditCard className="w-3 h-3" /> Online bezahlen – ganze Mannschaft ({remainingAmount} €{unpaidCount < playerCount ? ` · ${unpaidCount}/${playerCount} offen` : ''})
                                  </button>
                                }
                                {canPay && !clickedPlayerPaid && hasPlayer &&
                                  <button
                                    onClick={() => handlePay(teamInfo.id, 'player', assignment.player_id)}
                                    disabled={paying === `${teamInfo.id}:player:${assignment.player_id}`}
                                    className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-primary/80 text-primary-foreground hover:bg-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                                    <CreditCard className="w-3 h-3" /> Online bezahlen – für {getPlayerName(assignment.player_id)} ({playerAmount} €)
                                  </button>
                                }
                              </div>
                            }
                          </div>);

                      })()}
                      {paymentCell === cellKey && isEinzelstarter && (() => {
                        const playerAmount = (((tournament?.payment_amount_einzelstarter || tournament?.payment_amount || 0) / 100) + (tourFeeCents || 0) / 100).toFixed(2);
                        const ezPaidIds = getEinzelstarterPaidIds(tournament);
                        const ezOnlinePaidIds = getEinzelstarterOnlinePaidIds(tournament);
                        const isPaidCash = ezPaidIds.includes(assignment.player_id);
                        const isPaidOnline = ezOnlinePaidIds.includes(assignment.player_id);
                        return (
                          <div className="absolute z-50 top-full left-0 mt-1 w-60 bg-card border border-border rounded-xl shadow-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zahlung</span>
                              <button onClick={() => setPaymentCell(null)} className="opacity-50 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="text-sm font-bold text-foreground truncate">{getPlayerName(assignment.player_id)}</div>
                            <div className="text-xs text-muted-foreground">Einzelstarter · {playerAmount} €</div>
                            {isPaidOnline ?
                            <div className="flex items-center gap-2 text-sm text-green-700 font-medium bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <CheckCircle2 className="w-4 h-4" /> Online bezahlt ✓
                              </div> :
                            isPaidCash ?
                            <div className="flex items-center gap-2 text-sm text-green-700 font-medium bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <CheckCircle2 className="w-4 h-4" /> Bar bezahlt ✓
                              </div> :
                            <>
                                {isOwner &&
                              <button
                                onClick={() => toggleEinzelstarterPaymentMutation.mutate({ playerId: assignment.player_id, currentPaidIds: ezPaidIds })}
                                disabled={toggleEinzelstarterPaymentMutation.isPending}
                                className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-green-100 hover:text-green-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Bar bezahlt markieren
                                  </button>
                              }
                                <button
                                onClick={() => handlePay('', 'einzelstarter', assignment.player_id)}
                                disabled={paying === `:einzelstarter:${assignment.player_id}`}
                                className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                                  <CreditCard className="w-3 h-3" /> Online bezahlen ({playerAmount} €)
                                </button>
                              </>
                            }
                          </div>);

                      })()}
                      </td>);

                })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingEinzelPlayer && (
        <PlayerEditDialog
          open={!!editingEinzelPlayer}
          onOpenChange={(v) => { if (!v) setEditingEinzelPlayer(null); }}
          player={editingEinzelPlayer}
        />
      )}

      <EinzelstarterPickerDialog
        open={!!einzelDialog}
        onOpenChange={(v) => { if (!v) setEinzelDialog(null); }}
        players={players}
        getPlayerName={getPlayerName}
        excludeIds={new Set()}
        onSelect={(p) => {
          if (einzelDialog?.mode === 'cell') {
            assignMutation.mutate({
              teamId: '',
              playerId: p.id,
              startTime: einzelDialog.time,
              lane: einzelDialog.lane,
              day: activeDay,
              isPlaceholder: false,
              venue: activeVenue,
            });
          } else {
            setSelected({
              key: `einzel-${p.id}`,
              teamId: '',
              playerId: p.id,
              playerName: p.name,
              category: p.category || '',
              isPlaceholder: false,
            });
          }
          setEinzelDialog(null);
        }}
      />
    </div>);

}