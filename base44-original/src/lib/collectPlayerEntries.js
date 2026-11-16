// Sammelt alle Spieler-Einträge eines Turniers: sowohl aus echten Mannschaften
// als auch aus Einzelstartern (Spieler im Startplan ohne Mannschaft).
// Wird von Zwischenstand und Punktetabelle genutzt, damit Future-Turniere
// (deren Teilnehmer als Einzelstarter geführt werden) nicht leer bleiben.
//
// Pro Spieler wird dabei immer der BESTE Score über alle seine Einträge
// (mehrere Mannschaften, Mannschaft + Einzelstarter, mehrere Score-Datensätze)
// gewertet – analog zur Rangliste (generateResults / PlayerStatsPanel).

// Liefert den besten Score-Datensatz aus einer Liste (höchster score,
// null-Scores werden ignoriert). Bei Kegelgleichstand gewinnt der
// Eintrag mit mehr abgeräumten Würfen.
function parseAbraeumen(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) return parseInt(parsed.abraeumen) || 0;
    if (Array.isArray(parsed)) return parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0);
  } catch {}
  return 0;
}

// Leerer Score-Datensatz: kein Ergebnis eingetragen (Score 0/null ohne
// Wurfdaten) – zählt wie keine Teilnahme (z.B. verwaiste Datensätze eines
// gelöschten Startplatzes). Markierungen (W.O. / No-Show) sind echte Datensätze.
export function isEmptyScoreRecord(s) {
  if (!s) return true;
  if (s.score != null && s.score !== 0) return false;
  try {
    const parsed = JSON.parse(s.notes || '');
    if (parsed?.wo === true || parsed?.no_show === true) return false;
    if (parsed?.gesamt === true) {
      return !String(parsed.voll ?? '').trim() &&
        !String(parsed.abraeumen ?? '').trim() &&
        !String(parsed.fehlwurf ?? '').trim();
    }
    if (Array.isArray(parsed)) {
      return parsed.every((b) => !String(b.voll ?? '').trim() && !String(b.abraeumen ?? '').trim());
    }
  } catch {}
  return true;
}

function bestScoreOf(scoreRecords) {
  return scoreRecords.reduce((best, s) => {
    if (s.score == null || isEmptyScoreRecord(s)) return best;
    if (!best || s.score > best.score) return s;
    if (s.score === best.score && parseAbraeumen(s.notes) > parseAbraeumen(best.notes)) return s;
    return best;
  }, null);
}

// No-Show: Spieler nicht angetreten – zählt wie kein Score.
function isNoShowNotes(notesStr) {
  try {
    return JSON.parse(notesStr || '')?.no_show === true;
  } catch {}
  return false;
}

export function collectPlayerEntries(teams, scores, schedules, playerMap, includeHobby = false, isFutureSeries = false) {
  // Alle Kandidaten sammeln (pro Spieler pro Mannschaft/Einzelstarter) …
  const allCandidates = [];

  teams.forEach(team => {
    [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id]
      .filter(Boolean)
      .forEach(playerId => {
        if (!includeHobby && playerMap?.[playerId]?.is_hobby) return; // Lochkegel: keine Einzelwertung
        const teamScores = scores.filter(s => s.team_id === team.id && s.player_id === playerId);
        const best = bestScoreOf(teamScores);
        allCandidates.push({
          playerId,
          teamName: team.name,
          teamCategory: team.category,
          score: best?.score ?? null,
          notes: best?.notes || '',
        });
      });
  });

  // Einzelstarter (geplante Spieler ohne Mannschaft)
  (schedules || [])
    .filter(s => !s.is_placeholder && s.player_id && !s.team_id)
    .forEach(sched => {
      if (!includeHobby && playerMap?.[sched.player_id]?.is_hobby) return; // Lochkegel: keine Einzelwertung
      const ezScores = scores.filter(s => !s.team_id && s.player_id === sched.player_id);
      const best = bestScoreOf(ezScores);
      allCandidates.push({
        playerId: sched.player_id,
        // 9PinFuture: Verein des Spielers anzeigen statt „Einzelstarter"
        teamName: isFutureSeries && playerMap?.[sched.player_id]?.club ? playerMap[sched.player_id].club : 'Einzelstarter',
        teamCategory: playerMap?.[sched.player_id]?.category || 'Herren',
        score: best?.score ?? null,
        notes: best?.notes || '',
      });
    });

  // … und pro Spieler nur den Eintrag mit dem besten Score behalten.
  // Bei Kegelgleichstand gewinnt der Eintrag mit mehr abgeräumten Würfen
  // (gleicher Tie-Breaker wie in bestScoreOf / generateResults).
  const byPlayer = {};
  allCandidates.forEach(c => {
    const prev = byPlayer[c.playerId];
    const merged = bestScoreOf([prev, c].filter(Boolean));
    byPlayer[c.playerId] = merged || prev || c;
  });
  // No-Show: Score auf null setzen, damit der Spieler wie „ohne Ergebnis"
  // behandelt wird (Startplan bleibt unverändert).
  return Object.values(byPlayer).map(c => isNoShowNotes(c.notes) ? { ...c, score: null } : c);
}