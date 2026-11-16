// Helpers für turnierspezifische Mixed-Kombinationen (D/H-Aufteilungen).
// Wird von TournamentNew, TournamentEditDialog, TeamFormDialog genutzt.

// Alle mathematisch möglichen D+H-Aufteilungen für eine Teamgröße (beide > 0).
export function generateMixedCombinations(teamSize) {
  const combos = [];
  for (let d = 1; d < teamSize; d++) {
    combos.push({ damen: d, herren: teamSize - d });
  }
  return combos;
}

// mixed_combinations aus gespeichertem JSON-String parsen.
export function parseMixedCombinations(str) {
  try {
    const parsed = JSON.parse(str || '');
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

// Prüft, ob eine D/H-Besetzung einer der konfigurierten Kombinationen entspricht.
export function matchesMixedCombination(d, h, combinations) {
  if (!combinations || combinations.length === 0) return false;
  return combinations.some(c => c.damen === d && c.herren === h);
}

// Anzeige-Label für eine Kombination, z.B. "2 Damen + 2 Herren".
export function formatCombination(combo) {
  const dLabel = combo.damen === 1 ? 'Dame' : 'Damen';
  const hLabel = combo.herren === 1 ? 'Herr' : 'Herren';
  return `${combo.damen} ${dLabel} + ${combo.herren} ${hLabel}`;
}