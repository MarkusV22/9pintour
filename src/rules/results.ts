// Turnierwertung: aus Scores die Platzierungen + Tour-Punkte erzeugen
// (1:1 aus Base44 src/lib/generateResults.js, Aufruf beim Abschließen mit includeHobby = true)
import { getPoints, getFuturePoints, FUTURE_APPEARANCE_POINTS } from "./points";
import { isEmptyScore, isNoShow, isWalkover, lanes, type ScoreRow } from "./scoreNotes";

export interface PlayerInfo { id: string; category?: string | null; age_class?: string | null; is_hobby?: boolean | number | null; club?: string | null }
export interface TeamRow { id: string; name?: string; category?: string | null; player_ids: (string | null)[] }
export interface ScheduleRow { player_id: string | null; team_id?: string | null; is_placeholder?: boolean | number | null }
export interface ResultRecord { tournament_id: string; player_id: string; position: number; points: number; notes: string }

export interface GenerateInput {
  scores: ScoreRow[];
  players: Map<string, PlayerInfo>;
  tier: string;
  tournamentId: string;
  isFinal?: boolean;
  seriesType?: string;
  includeHobby?: boolean;
  teams?: TeamRow[];
  schedules?: ScheduleRow[];
}

/** Reihung: 1. mehr Kegel, 2. mehr Abräumen, 3. weniger Fehlwürfe */
export function compareScores(a: ScoreRow, b: ScoreRow): number {
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
  const la = lanes(a.notes), lb = lanes(b.notes);
  if (lb.abraeumen !== la.abraeumen) return lb.abraeumen - la.abraeumen;
  return la.fehlwurf - lb.fehlwurf;
}

/** Spieler im Startplan (Mannschafts-Kader + Einzelstarter-Slots ohne Platzhalter) */
export function startplanIds(teams: TeamRow[], schedules: ScheduleRow[]): Set<string> {
  const ids = new Set<string>();
  for (const t of teams) for (const p of t.player_ids) if (p) ids.add(p);
  for (const s of schedules) if (!s.is_placeholder && s.player_id) ids.add(s.player_id);
  return ids;
}

export function generateResultRecords(inp: GenerateInput): ResultRecord[] {
  const { scores, players, tier, tournamentId, isFinal = false, seriesType = "standard", includeHobby = true, teams = [], schedules = [] } = inp;
  const plan = !isFinal && (teams.length > 0 || schedules.length > 0) ? startplanIds(teams, schedules) : null;

  const relevant = (isFinal ? scores.filter((s) => s.grp === "A" || s.grp === "B") : scores)
    .filter((s) => !plan || (s.player_id != null && plan.has(s.player_id)));

  // Bestes Ergebnis je Spieler; bei Kegelgleichstand gewinnt der Eintrag mit mehr Abräumen
  const best = new Map<string, ScoreRow>();
  for (const s of relevant) {
    if (!s.player_id || s.score == null) continue;
    if (isEmptyScore(s)) continue;
    if (isNoShow(s.notes)) continue;
    if (!includeHobby && players.get(s.player_id)?.is_hobby) continue;
    const cur = best.get(s.player_id);
    if (!cur || s.score > (cur.score ?? 0) || (s.score === cur.score && lanes(s.notes).abraeumen > lanes(cur.notes).abraeumen)) {
      best.set(s.player_id, s);
    }
  }

  // Gruppen: Standard nach Kategorie; Future nach Altersklasse + Geschlecht
  const isFuture = seriesType === "future";
  const groups = new Map<string, ScoreRow[]>();
  for (const s of best.values()) {
    const p = players.get(s.player_id!);
    const key = isFuture ? `${p?.age_class || "Sonstige"}__${p?.category || "Herren"}` : (p?.category || s.category || "Herren");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const out: ResultRecord[] = [];
  for (const [key, list] of groups) {
    list.sort(compareScores);
    const notes = isFuture ? key.split("__")[0] : key;
    // Future: W.O. = nur Antrittspunkte, zählt nicht zur Teilnehmerzahl
    const scored = isFuture ? list.filter((s) => !isWalkover(s.notes)).length : list.length;
    list.forEach((s, i) => {
      const position = i + 1;
      const points = isFuture
        ? (isWalkover(s.notes) ? FUTURE_APPEARANCE_POINTS : getFuturePoints(position, scored))
        : getPoints(tier, position);
      out.push({ tournament_id: tournamentId, player_id: s.player_id!, position, points, notes });
    });
  }
  return out;
}
