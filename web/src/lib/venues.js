// Hilfsfunktionen für Multi-Spielort-Turniere (9PinFuture).
// Verträgt sowohl das neue `venues`-JSON-String-Feld als auch das alte
// Einzel-Spielort-Modell (top-level location/lane_count).

function parseVenuesRaw(tournament) {
  if (!tournament) return null;
  const raw = tournament.venues;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    } catch {}
  }
  if (Array.isArray(raw)) return raw;
  return null;
}

/**
 * Liefert die Spielorte eines Turniers als Array.
 * Multi-Spielort: Einträge aus tournament.venues.
 * Einzel-Spielort (Legacy/Standard): Fallback auf top-level location/lane_count.
 * @returns {Array<{name:string, location:string, lane_count:number, index:number}>}
 */
export function getVenues(tournament) {
  const parsed = parseVenuesRaw(tournament);
  if (parsed && parsed.length > 0) {
    return parsed.map((v, i) => ({
      name: v.name || `Spielort ${i + 1}`,
      location: v.location || '',
      lane_count: v.lane_count || 4,
      index: i,
    }));
  }
  return [
    {
      name: tournament?.location || 'Spielort',
      location: tournament?.location || '',
      lane_count: tournament?.lane_count || 4,
      index: 0,
    },
  ];
}

export function isMultiVenue(tournament) {
  const parsed = parseVenuesRaw(tournament);
  return !!(parsed && parsed.length > 1);
}

/**
 * Serialisiert eine Venue-Liste für das `venues`-Feld (JSON-String).
 */
export function serializeVenues(venues) {
  return JSON.stringify((venues || []).map(v => ({
    name: v.name || '',
    location: v.location || '',
    lane_count: v.lane_count || 4,
  })));
}

/**
 * Liefert den Spielort-Index (als String) für einen Schedule-Eintrag.
 * Legacy-Einträge ohne venue → "0" (erster Spielort).
 */
export function venueKeyOf(scheduleEntry) {
  const v = scheduleEntry?.venue;
  return v != null && v !== '' ? String(v) : '0';
}

/**
 * Anzeige-Label für den Spielort eines Schedule-Eintrags.
 * Bei Einzel-Spielort-Turnieren leer (kein Label nötig).
 */
export function venueLabelFor(tournament, scheduleEntry) {
  const venues = getVenues(tournament);
  if (venues.length <= 1) return '';
  const i = Number(venueKeyOf(scheduleEntry)) || 0;
  const v = venues[i] || venues[0];
  return v.name || v.location || `Spielort ${i + 1}`;
}