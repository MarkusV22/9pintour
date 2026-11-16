// Punkteschlüssel nach Platzierungsgruppen:
// 1, 2, 3, 4-5, 6-7, 8-10, 11-15, 16-20, 21-25, 26-30, 31-35, 36-40, 41-50, 51-60, 61-70

export const TIERS = [
  { value: 'Grand Slam',   label: 'Grand Slam',   color: 'bg-amber-500 text-white' },
  { value: 'Masters 1000', label: 'NPT 1000',     color: 'bg-purple-600 text-white' },
  { value: 'Masters 500',  label: 'NPT 500',      color: 'bg-blue-600 text-white' },
  { value: 'Masters 250',  label: 'NPT 250',      color: 'bg-blue-400 text-white' },
  { value: 'Challenger',   label: 'Challengers',  color: 'bg-green-600 text-white' },
  { value: 'Finalturnier',  label: 'Finalturnier', color: 'bg-red-700 text-white' },
  { value: 'Competition',  label: 'Competition',  color: 'bg-gray-500 text-white' },
];

// Platzierungsgruppen: [von, bis] (inklusiv)
export const PLACEMENT_GROUPS = [
  { label: '1',     from: 1,  to: 1  },
  { label: '2',     from: 2,  to: 2  },
  { label: '3',     from: 3,  to: 3  },
  { label: '4–5',   from: 4,  to: 5  },
  { label: '6–7',   from: 6,  to: 7  },
  { label: '8–10',  from: 8,  to: 10 },
  { label: '11–15', from: 11, to: 15 },
  { label: '16–20', from: 16, to: 20 },
  { label: '21–25', from: 21, to: 25 },
  { label: '26–30', from: 26, to: 30 },
  { label: '31–35', from: 31, to: 35 },
  { label: '36–40', from: 36, to: 40 },
  { label: '41–50', from: 41, to: 50 },
  { label: '51–60', from: 51, to: 60 },
  { label: '61–70', from: 61, to: 70 },
];

// Points table: 15 Einträge (je Platzierungsgruppe ein Wert)
export const POINTS_TABLE = {
  'Grand Slam':   [2000, 1200, 720, 480, 300, 200, 120,  80,  50,  30,  20,  15,  10,   5,   1],
  'Masters 1000': [1000,  600, 360, 240, 150, 100,  60,  40,  25,  15,  10,   8,   5,   2,   1],
  'Masters 500':  [ 500,  300, 180, 120,  75,  50,  30,  20,  12,   8,   5,   4,   2,   1,   0],
  'Masters 250':  [ 250,  150,  90,  60,  38,  25,  15,  10,   6,   4,   3,   2,   1,   0,   0],
  'Challenger':   [ 125,   75,  45,  30,  19,  13,   8,   5,   3,   2,   1,   0,   0,   0,   0],
  'Finalturnier':  [  0,    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0],
  'Competition':   [  0,    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0],
};

// Gibt den Punktewert für eine Platzierung zurück
export function getPoints(tier, placement) {
  const table = POINTS_TABLE[tier] || POINTS_TABLE['Masters 250'];
  const groupIndex = PLACEMENT_GROUPS.findIndex(g => placement >= g.from && placement <= g.to);
  if (groupIndex === -1) return 0;
  return table[groupIndex] ?? 0;
}

export function getTierStyle(tier) {
  return TIERS.find(t => t.value === tier)?.color ?? 'bg-muted text-foreground';
}

// Anzeige-Label der Turnierkategorie:
// 9PinFuture-Turniere werden als „9PinFuture Turnier" beschriftet (statt NPT-Label)
export function getTierLabel(tournament) {
  if (tournament?.series_type === 'future') return '9PinFuture Turnier';
  return TIERS.find(t => t.value === tournament?.tier)?.label || tournament?.tier || '';
}

// ── 9PinFuture Nachwuchsserie ──
// Altersklassen der Future-Rangliste (jede Klasse erhält eine eigene Rangliste)
export const FUTURE_AGE_CLASSES = ['U-10', 'U-15', 'U-19'];

// Punktelogik Future-Serie:
// - Jeder angetretene Teilnehmer erhält 2 Antrittspunkte.
// - Der Erstplatzierte erhält zusätzlich so viele Punkte, wie Teilnehmer in seiner
//   Altersklasse antreten; jeder weitere Platzierung erhält einen Punkt weniger.
//   (2. = n-1, 3. = n-2, … letzter = 1)
export const FUTURE_APPEARANCE_POINTS = 2;

export function getFuturePoints(position, participantCount = 0) {
  if (position < 1 || position > participantCount) return 0;
  return FUTURE_APPEARANCE_POINTS + (participantCount - position + 1);
}