import { getVenues } from '@/lib/venues';

const DEFAULT_DAYS = [{ name: 'Tag 1', date: null, startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }];

function parseDayConfigs(str) {
  try {
    const parsed = JSON.parse(str || '');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

function generateSlotTimes(startTotalMinutes, endTotalMinutes, slotMinutes) {
  const slots = [];
  let total = startTotalMinutes;
  while (total < endTotalMinutes) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    slots.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    total += slotMinutes;
  }
  return slots;
}

// Lokales Datum parsen (vermeidet UTC-Mitternachts-Verschiebung)
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

// Ein Slot gilt als "vergangen" (nicht mehr buchbar), sobald seine Startzeit
// + Pufferzeit in der Vergangenheit liegt. Puffer analog zum SchedulePlanner.
const BOOKING_GRACE_MINUTES = 60;
function isSlotInPast(dayDate, time) {
  const base = parseLocalDate(dayDate);
  if (!base) return false;
  const [h, m] = time.split(':').map(Number);
  base.setHours(h, m, 0, 0);
  return base.getTime() + BOOKING_GRACE_MINUTES * 60 * 1000 < Date.now();
}

/**
 * Berechnet freie/gesamte Slots für ein Turnier basierend auf day_configs,
 * lane_count und slot_duration. Vergangene, nicht belegte Slots gelten als
 * "belegt" (nicht buchbar) und werden nicht mehr als frei gezählt.
 * @param {Object} tournament - Turnier-Entity
 * @param {Array} schedules - Alle TournamentSchedule-Einträge (werden in-memory nach tournament_id gefiltert)
 * @returns {{total:number, occupied:number, free:number}|null}
 */
export function computeSlotStats(tournament, schedules) {
  if (!tournament) return null;
  if (tournament.mode === 'final') return null;

  const days = parseDayConfigs(tournament.day_configs) || DEFAULT_DAYS;
  const venues = getVenues(tournament);
  const slotDuration = tournament.slot_duration || 60;

  // Belegte Slots für dieses Turnier (inkl. Platzhalter) indexieren nach
  // "day|time|lane|venue". venue fehlt bei Legacy-Einträgen => "0".
  const occupiedKeys = new Set();
  (schedules || []).forEach(s => {
    if (s.tournament_id !== tournament.id) return;
    if (!(s.player_id || s.is_placeholder || s.team_id)) return;
    const day = s.day || 'Tag 1';
    const venueKey = s.venue != null && s.venue !== '' ? s.venue : '0';
    occupiedKeys.add(`${day}|${s.start_time}|${s.lane}|${venueKey}`);
  });

  let total = 0;
  let occupied = 0; // nur On-Grid-belegte Slots
  let blockedPast = 0; // vergangene, nicht belegte Slots (nicht buchbar)

  days.forEach(day => {
    const dayName = day.name || 'Tag 1';
    const start = (day.startHour ?? 8) * 60 + (day.startMinute ?? 0);
    const end = (day.endHour ?? 18) * 60 + (day.endMinute ?? 0);
    const times = generateSlotTimes(start, end, slotDuration);
    times.forEach(time => {
      venues.forEach((venue, vi) => {
        const laneCount = venue.lane_count || 4;
        for (let lane = 1; lane <= laneCount; lane++) {
          total++;
          const key = `${dayName}|${time}|${lane}|${vi}`;
          const isOccupied = occupiedKeys.has(key);
          if (isOccupied) {
            occupied++;
          } else if (isSlotInPast(day.date || tournament.date, time)) {
            blockedPast++;
          }
        }
      });
    });
  });

  // Frei = nur noch buchbare Slots = Gesamt minus belegt minus vergangene Lücken
  const free = Math.max(0, total - occupied - blockedPast);
  return { total, occupied, free };
}