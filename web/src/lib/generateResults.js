import { getPoints, getFuturePoints, FUTURE_APPEARANCE_POINTS } from './tournamentPoints';
import { isEmptyScoreRecord } from './collectPlayerEntries';

// Helper: Abräumen + Fehlwurf aus score notes (JSON) parsen.
//notes kann entweder ein Array von Bahn-Daten {voll, abraeumen} oder
//ein Gesamt-Objekt {gesamt: true, voll, abraeumen, fehlwurf} sein.
function parseAbraeumen(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) {
      return {
        abraeumen: parseInt(parsed.abraeumen) || 0,
        fehlwurf: parseInt(parsed.fehlwurf) || 0,
      };
    }
    if (Array.isArray(parsed)) {
      return {
        abraeumen: parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0),
        fehlwurf: parsed.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0),
      };
    }
  } catch {}
  return { abraeumen: 0, fehlwurf: 0 };
}

// W.O. (Walkover): Spieler hat kein Ergebnis erzielt
// (Score 0, notes {wo: true}).
function isWalkover(notesStr) {
  try {
    return JSON.parse(notesStr || '')?.wo === true;
  } catch {}
  return false;
}

// No-Show: Spieler nicht angetreten (Score 0, notes {no_show: true}) –
// keine Position, keine Punkte, zählt nicht zur Teilnehmerzahl.
function isNoShow(notesStr) {
  try {
    return JSON.parse(notesStr || '')?.no_show === true;
  } catch {}
  return false;
}

/**
 * Generate TournamentResult records from TournamentScore data.
 * Groups players by their profile category, ranks by best score,
 * and assigns points based on the tournament tier.
 * Tie-breaker bei Kegelgleichstand: mehr abgeräumte Würfe gewinnen;
 * bei weiterer Gleichheit gewinnt der Spieler mit weniger Fehlwürfen.
 * For final tournaments: only group-phase scores (group A/B) are used for ranking.
 */
export function generateResultRecords({ scores, playerMap, tier, tournamentId, isFinal = false, seriesType = 'standard', includeHobby = true, teams = [], schedules = [] }) {
  // Startplan-Mitgliedschaft: bei Finalturnieren definieren die Gruppen die
  // Teilnehmer; sonst zählen nur Spieler, die aktuell im Startplan stehen
  // (Mannschafts-Kader oder Einzelstarter-Slot). Spieler, die aus dem Startplan
  // entfernt wurden, fallen damit aus der Wertung – auch wenn noch Scores existieren.
  let startplanIds = null;
  if (!isFinal && (teams.length > 0 || schedules.length > 0)) {
    startplanIds = new Set();
    teams.forEach(t =>
      [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id]
        .filter(Boolean)
        .forEach(pid => startplanIds.add(pid))
    );
    schedules.forEach(s => { if (!s.is_placeholder && s.player_id) startplanIds.add(s.player_id); });
  }

  // For final tournaments, only use group-phase scores (not K.O. duel scores)
  const relevantScores = (isFinal
    ? scores.filter(s => s.group === 'A' || s.group === 'B')
    : scores
  ).filter(s => !startplanIds || startplanIds.has(s.player_id));

  // Best score per player (deduplicates across teams).
  // Bei Kegelgleichstand gewinnt der Eintrag mit mehr abgeräumten Würfen.
  const playerBest = {};
  relevantScores.forEach(s => {
    if (!s.player_id || s.score == null) return;
    // Leerer Datensatz (kein Ergebnis eingetragen): zählt wie keine Teilnahme
    if (isEmptyScoreRecord(s)) return;
    // No-Show: komplett aus der Wertung entfernt
    if (isNoShow(s.notes)) return;
    // Lochkegel-Sportler: keine Einzelwertung, keine Tour-Punkte
    if (!includeHobby && playerMap?.[s.player_id]?.is_hobby) return;
    const current = playerBest[s.player_id];
    if (!current) {
      playerBest[s.player_id] = s;
      return;
    }
    if (s.score > current.score) {
      playerBest[s.player_id] = s;
    } else if (s.score === current.score) {
      const sAbr = parseAbraeumen(s.notes).abraeumen;
      const cAbr = parseAbraeumen(current.notes).abraeumen;
      if (sAbr > cAbr) playerBest[s.player_id] = s;
    }
  });

  // Future-Serie: Wertung pro Altersklasse UND Geschlecht (Herren/Damen getrennt),
  // Standard-Serie: Gruppierung nach Geschlechter-Kategorie (Herren/Damen/Mixed)
  const isFuture = seriesType === 'future';
  const byGroup = {};
  Object.values(playerBest).forEach(s => {
    const p = playerMap?.[s.player_id];
    const groupKey = isFuture
      ? `${p?.age_class || 'Sonstige'}__${p?.category || 'Herren'}`
      : (p?.category || s.category || 'Herren');
    if (!byGroup[groupKey]) byGroup[groupKey] = [];
    byGroup[groupKey].push(s);
  });

  const results = [];
  Object.entries(byGroup).forEach(([groupKey, groupScores]) => {
    // Sortierung: 1. höhere Score, 2. mehr Abräumen, 3. weniger Fehlwurf
    groupScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aAbr = parseAbraeumen(a.notes);
      const bAbr = parseAbraeumen(b.notes);
      if (bAbr.abraeumen !== aAbr.abraeumen) return bAbr.abraeumen - aAbr.abraeumen;
      return aAbr.fehlwurf - bAbr.fehlwurf;
    });
    // Für Future-Rangliste (notes) nur die Altersklasse speichern,
    // damit die Rangliste nach Altersklasse weiterhin funktioniert.
    const notesKey = isFuture ? groupKey.split('__')[0] : groupKey;
    // Future-Serie: W.O.-Spieler haben keinen Score erzielt – sie erhalten
    // NUR die 2 Antrittspunkte, keine Platzierungspunkte, und zählen nicht
    // zur Teilnehmerzahl der Platzierungswertung.
    const scoredCount = isFuture ? groupScores.filter(s => !isWalkover(s.notes)).length : groupScores.length;
    groupScores.forEach((s, i) => {
      const position = i + 1;
      const points = isFuture
        ? (isWalkover(s.notes) ? FUTURE_APPEARANCE_POINTS : getFuturePoints(position, scoredCount))
        : getPoints(tier, position);
      results.push({
        tournament_id: tournamentId,
        player_id: s.player_id,
        position,
        points,
        notes: notesKey,
      });
    });
  });

  return results;
}