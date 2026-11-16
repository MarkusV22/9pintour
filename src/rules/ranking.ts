// Ranglisten (1:1 aus Base44 src/pages/Ranking.jsx und FutureRanking.jsx)
import { getFuturePoints } from "./points";
import { isNoShow, isWalkover, type ScoreRow } from "./scoreNotes";
import { startplanIds, type TeamRow, type ScheduleRow, type ResultRecord, type PlayerInfo } from "./results";

export interface TournamentInfo {
  id: string;
  date: string | null;
  status: string;
  series_type?: string | null;
  deleted_at?: string | null;
}
export interface Season { start_date: string; end_date: string }

export interface RankingRow {
  player_id: string;
  rank: number;
  points: number;
  tournaments: number;
  best_score: number;
  base_points?: number;
  bonus_points?: number;
  schnitt?: number | null;
}

/** Turniere der Saison (nach Datum), abgeschlossen, nicht gelöscht, mit vergebenen Ergebnissen */
export function finishedInSeason(tournaments: TournamentInfo[], results: ResultRecord[], season: Season | null, series: "standard" | "future"): TournamentInfo[] {
  const awarded = new Set(results.map((r) => r.tournament_id));
  return tournaments.filter((t) => {
    const isFuture = t.series_type === "future";
    if (series === "future" ? !isFuture : isFuture) return false;
    if (t.deleted_at) return false;
    if (season) {
      if (!t.date) return false;
      const d = t.date.slice(0, 10);
      if (d < season.start_date || d > season.end_date) return false;
    }
    return t.status === "abgeschlossen" && awarded.has(t.id);
  });
}

function bestScore(scores: ScoreRow[], playerId: string, tournamentId: string, extra?: (s: ScoreRow) => boolean): number {
  return scores
    .filter((s) => s.player_id === playerId && s.tournament_id === tournamentId && s.score != null && (!extra || extra(s)))
    .reduce((m, s) => Math.max(m, s.score!), 0);
}

/** Konkurrenz-Rang: gleiche Punkte → gleicher Rang (1, 2, 2, 4 …) */
function withRanks<T extends { points: number }>(rows: T[]): (T & { rank: number })[] {
  let prevPoints: number | null = null, prevRank = 0;
  return rows.map((r, i) => {
    const rank = r.points === prevPoints ? prevRank : i + 1;
    prevPoints = r.points; prevRank = rank;
    return { ...r, rank };
  });
}

/** Standard-Rangliste: Summe der Tour-Punkte, getrennt nach Kategorie (results.notes = "Herren"/"Damen") */
export function standardRanking(category: string, finished: TournamentInfo[], results: ResultRecord[], scores: ScoreRow[]): RankingRow[] {
  const pts = new Map<string, number>(), cnt = new Map<string, number>(), best = new Map<string, number>();
  for (const t of finished) {
    for (const r of results) {
      if (r.tournament_id !== t.id || !r.player_id || r.notes !== category) continue;
      pts.set(r.player_id, (pts.get(r.player_id) ?? 0) + (r.points || 0));
      cnt.set(r.player_id, (cnt.get(r.player_id) ?? 0) + 1);
      const b = bestScore(scores, r.player_id, t.id);
      if (!best.has(r.player_id) || b > best.get(r.player_id)!) best.set(r.player_id, b);
    }
  }
  const rows = [...pts].map(([player_id, points]) => ({ player_id, points, tournaments: cnt.get(player_id) ?? 0, best_score: best.get(player_id) ?? 0 }))
    .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments);
  return withRanks(rows);
}

export interface TournamentPlan { teams: TeamRow[]; schedules: ScheduleRow[] }

/**
 * 9PinFuture-Rangliste je Altersklasse + Geschlecht.
 * Ausgeschlossen: Spieler nicht (mehr) im Startplan bzw. in allen Scores No-Show.
 * Schnitt-Bonus: Ø der besten 5 Turnierergebnisse, Bonus ab 3 Teilnahmen nach Future-Punkteschema.
 * (Wie bisher ohne Konkurrenz-Rang – Rang = Position.)
 */
export function futureRanking(
  ageClass: string, gender: string, finished: TournamentInfo[], results: ResultRecord[], scores: ScoreRow[],
  players: Map<string, PlayerInfo>, plans: Map<string, TournamentPlan>,
): RankingRow[] {
  const pts = new Map<string, number>(), cnt = new Map<string, number>(), best = new Map<string, number>();
  const tScores = new Map<string, number[]>();
  for (const t of finished) {
    const plan = plans.get(t.id);
    const planIds = plan ? startplanIds(plan.teams, plan.schedules) : new Set<string>();
    const byPlayer = new Map<string, ScoreRow[]>();
    for (const s of scores) if (s.tournament_id === t.id && s.player_id) {
      if (!byPlayer.has(s.player_id)) byPlayer.set(s.player_id, []);
      byPlayer.get(s.player_id)!.push(s);
    }
    const noShow = new Set([...byPlayer].filter(([, l]) => l.every((s) => isNoShow(s.notes))).map(([id]) => id));

    for (const r of results) {
      if (r.tournament_id !== t.id || !r.player_id || r.notes !== ageClass) continue;
      if (players.get(r.player_id)?.category !== gender) continue;
      if (noShow.has(r.player_id)) continue;
      if (planIds.size > 0 && !planIds.has(r.player_id)) continue;
      pts.set(r.player_id, (pts.get(r.player_id) ?? 0) + (r.points || 0));
      cnt.set(r.player_id, (cnt.get(r.player_id) ?? 0) + 1);
      const b = bestScore(scores, r.player_id, t.id, (s) => !isWalkover(s.notes) && !isNoShow(s.notes));
      if (b > 0) { if (!tScores.has(r.player_id)) tScores.set(r.player_id, []); tScores.get(r.player_id)!.push(b); }
      if (!best.has(r.player_id) || b > best.get(r.player_id)!) best.set(r.player_id, b);
    }
  }

  const schnitt = [...tScores].map(([player_id, l]) => {
    const top5 = [...l].sort((a, b) => b - a).slice(0, 5);
    return { player_id, schnitt: top5.reduce((s, v) => s + v, 0) / top5.length, count: l.length };
  });
  const bonusList = schnitt.filter((e) => e.count >= 3).sort((a, b) => b.schnitt - a.schnitt);
  const bonus = new Map(bonusList.map((e, i) => [e.player_id, getFuturePoints(i + 1, bonusList.length)]));

  const rows = [...pts].map(([player_id, base]) => {
    const sd = schnitt.find((s) => s.player_id === player_id);
    const b = bonus.get(player_id) ?? 0;
    return {
      player_id, points: base + b, base_points: base, bonus_points: b,
      schnitt: sd ? Math.round(sd.schnitt * 10) / 10 : null,
      tournaments: cnt.get(player_id) ?? 0, best_score: best.get(player_id) ?? 0,
    };
  }).sort((a, b) => b.points - a.points || b.tournaments - a.tournaments);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
