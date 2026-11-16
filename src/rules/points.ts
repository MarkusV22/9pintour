// Tour-Punkte nach Turnierkategorie und Platzierung (1:1 aus Base44 src/lib/tournamentPoints.js)

export type Tier = "Grand Slam" | "Masters 1000" | "Masters 500" | "Masters 250" | "Challenger" | "Finalturnier" | "Competition";

export const TIERS: { value: Tier; label: string }[] = [
  { value: "Grand Slam", label: "Grand Slam" },
  { value: "Masters 1000", label: "NPT 1000" },
  { value: "Masters 500", label: "NPT 500" },
  { value: "Masters 250", label: "NPT 250" },
  { value: "Challenger", label: "Challengers" },
  { value: "Finalturnier", label: "Finalturnier" },
  { value: "Competition", label: "Competition" },
];

/** Platzierungsgruppen [von, bis] inklusiv */
export const PLACEMENT_GROUPS: [number, number][] = [
  [1, 1], [2, 2], [3, 3], [4, 5], [6, 7], [8, 10], [11, 15], [16, 20],
  [21, 25], [26, 30], [31, 35], [36, 40], [41, 50], [51, 60], [61, 70],
];

export const POINTS_TABLE: Record<Tier, number[]> = {
  "Grand Slam":   [2000, 1200, 720, 480, 300, 200, 120, 80, 50, 30, 20, 15, 10, 5, 1],
  "Masters 1000": [1000, 600, 360, 240, 150, 100, 60, 40, 25, 15, 10, 8, 5, 2, 1],
  "Masters 500":  [500, 300, 180, 120, 75, 50, 30, 20, 12, 8, 5, 4, 2, 1, 0],
  "Masters 250":  [250, 150, 90, 60, 38, 25, 15, 10, 6, 4, 3, 2, 1, 0, 0],
  "Challenger":   [125, 75, 45, 30, 19, 13, 8, 5, 3, 2, 1, 0, 0, 0, 0],
  "Finalturnier": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Competition":  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Unbekannte Kategorie → wie Masters 250 (wie bisher) */
export function getPoints(tier: string | null | undefined, placement: number): number {
  const table = POINTS_TABLE[tier as Tier] ?? POINTS_TABLE["Masters 250"];
  const i = PLACEMENT_GROUPS.findIndex(([from, to]) => placement >= from && placement <= to);
  return i === -1 ? 0 : table[i] ?? 0;
}

export function tierLabel(t: { tier?: string | null; series_type?: string | null }): string {
  if (t.series_type === "future") return "9PinFuture Turnier";
  return TIERS.find((x) => x.value === t.tier)?.label ?? t.tier ?? "";
}

// ── 9PinFuture
export const FUTURE_AGE_CLASSES = ["U-10", "U-15", "U-19"] as const;
export const FUTURE_APPEARANCE_POINTS = 2;

/** 2 Antrittspunkte + (Teilnehmer − Platz + 1); außerhalb 1…n → 0 */
export function getFuturePoints(position: number, participantCount = 0): number {
  if (position < 1 || position > participantCount) return 0;
  return FUTURE_APPEARANCE_POINTS + (participantCount - position + 1);
}

export const AGE_CLASSES = ["U-10", "U-15", "U-19", "U-23", "Allgemeine Klasse", "Ü-50", "Ü-60"] as const;
