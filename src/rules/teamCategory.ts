// Mannschaftskategorie aus den Spielerkategorien (1:1 aus Base44 functions/recategorizeTeams)
export interface MixedCombination { damen: number; herren: number }

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { const v = s ? JSON.parse(s) : fallback; return v ?? fallback; } catch { return fallback; }
}

/** null = nicht bestimmbar (Mannschaft unvollständig) */
export function computeTeamCategory(playerCategories: string[], teamSize: number, allowedJson: string | null, mixedJson: string | null): string | null {
  if (!playerCategories.length || playerCategories.length !== teamSize) return null;
  const allowed = parseJson<string[]>(allowedJson, ["Herren", "Damen", "Mixed"]);
  const mixed = parseJson<MixedCombination[]>(mixedJson, []);
  const d = playerCategories.filter((c) => c === "Damen").length;
  const h = playerCategories.filter((c) => c === "Herren").length;
  if (Array.isArray(mixed) && mixed.length && allowed.includes("Mixed")) {
    if (mixed.some((m) => m.damen === d && m.herren === h)) return "Mixed";
    return d === teamSize ? "Damen" : "Herren";
  }
  if (teamSize === 4 && allowed.includes("Mixed")) {
    if (d === 4) return "Damen";
    if (h === 4) return "Herren";
    if (d === 3 && h === 1) return "Mixed";
    if (d === 2 && h === 2) return "Mixed";
    if (d === 1 && h === 3) return "Herren";
  }
  if (teamSize === 4) return d === 4 ? "Damen" : "Herren";
  return d === teamSize ? "Damen" : "Herren";
}
