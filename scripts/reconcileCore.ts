// Abgleich: Werden aus den übernommenen Scores dieselben Platzierungen/Punkte berechnet wie in Base44 gespeichert?
// Und welche Ranglisten ergeben sich daraus?
import { generateResultRecords, type PlayerInfo, type TeamRow, type ResultRecord } from "../src/rules/results";
import { finishedInSeason, standardRanking, futureRanking, type TournamentPlan, type RankingRow } from "../src/rules/ranking";
import { FUTURE_AGE_CLASSES } from "../src/rules/points";
import type { ScoreRow } from "../src/rules/scoreNotes";
import type { Tables, Row } from "./base44Data";

export interface TournamentCheck {
  id: string; name: string; stored: number; computed: number;
  diffs: { player_id: string; name: string; stored?: string; computed?: string }[];
}
export interface ReconcileReport {
  tournaments: TournamentCheck[];
  ranking: Record<string, RankingRow[]>;
  names: Map<string, string>;
}

const s = (v: Row[string]) => (v == null ? null : String(v));

export function domain(t: Tables) {
  const players = new Map<string, PlayerInfo>(t.players.map((p) => [String(p.id), {
    id: String(p.id), category: s(p.category), age_class: s(p.age_class), is_hobby: !!p.is_hobby, club: s(p.club),
  }]));
  const names = new Map(t.players.map((p) => [String(p.id), String(p.name)]));
  const teams: (TeamRow & { tournament_id: string })[] = t.teams.map((x) => ({
    id: String(x.id), tournament_id: String(x.tournament_id), name: String(x.name), category: s(x.category),
    player_ids: [x.player1_id, x.player2_id, x.player3_id, x.player4_id, x.player5_id, x.player6_id].map(s),
  }));
  const schedules = t.schedules.map((x) => ({ tournament_id: String(x.tournament_id), player_id: s(x.player_id), team_id: s(x.team_id), is_placeholder: !!x.is_placeholder }));
  const scores: ScoreRow[] = t.scores.map((x) => ({
    id: String(x.id), tournament_id: String(x.tournament_id), player_id: s(x.player_id), team_id: s(x.team_id), schedule_id: s(x.schedule_id),
    score: x.score == null ? null : Number(x.score), notes: s(x.notes), category: s(x.category), grp: s(x.grp),
  }));
  const results: ResultRecord[] = t.results.filter((r) => r.player_id).map((r) => ({
    tournament_id: String(r.tournament_id), player_id: String(r.player_id), position: Number(r.position), points: Number(r.points), notes: String(r.notes ?? ""),
  }));
  const tournaments = t.tournaments.map((x) => ({
    id: String(x.id), name: String(x.name), date: s(x.date), status: String(x.status), series_type: s(x.series_type),
    deleted_at: s(x.deleted_at), tier: s(x.tier), mode: s(x.mode),
  }));
  const plans = new Map<string, TournamentPlan>(tournaments.map((tt) => [tt.id, {
    teams: teams.filter((x) => x.tournament_id === tt.id), schedules: schedules.filter((x) => x.tournament_id === tt.id),
  }]));
  return { players, names, teams, schedules, scores, results, tournaments, plans };
}

export function reconcile(t: Tables): ReconcileReport {
  const d = domain(t);
  const checks: TournamentCheck[] = [];
  for (const tt of d.tournaments) {
    const stored = d.results.filter((r) => r.tournament_id === tt.id);
    if (!stored.length) continue;
    const plan = d.plans.get(tt.id)!;
    const computed = generateResultRecords({
      scores: d.scores.filter((x) => x.tournament_id === tt.id), players: d.players, tier: tt.tier || "Masters 250",
      tournamentId: tt.id, isFinal: tt.mode === "final", includeHobby: true, seriesType: tt.series_type || "standard",
      teams: plan.teams, schedules: plan.schedules,
    });
    const key = (r: ResultRecord) => `${r.notes} Platz ${r.position} · ${r.points} P`;
    const a = new Map(stored.map((r) => [r.player_id, key(r)]));
    const b = new Map(computed.map((r) => [r.player_id, key(r)]));
    const diffs = [...new Set([...a.keys(), ...b.keys()])]
      .filter((id) => a.get(id) !== b.get(id))
      .map((id) => ({ player_id: id, name: d.names.get(id) ?? id, stored: a.get(id), computed: b.get(id) }));
    checks.push({ id: tt.id, name: tt.name, stored: stored.length, computed: computed.length, diffs });
  }

  const season = t.seasons.find((x) => x.is_active);
  const seasonInfo = season ? { start_date: String(season.start_date), end_date: String(season.end_date) } : null;
  const ranking: Record<string, RankingRow[]> = {};
  const std = finishedInSeason(d.tournaments, d.results, seasonInfo, "standard");
  for (const cat of ["Herren", "Damen"]) ranking[`Tour ${cat}`] = standardRanking(cat, std, d.results, d.scores);
  const fut = finishedInSeason(d.tournaments, d.results, seasonInfo, "future");
  for (const g of ["Herren", "Damen"]) for (const ak of FUTURE_AGE_CLASSES) {
    ranking[`9PinFuture ${ak} ${g}`] = futureRanking(ak, g, fut, d.results, d.scores, d.players, d.plans);
  }
  return { tournaments: checks, ranking, names: d.names };
}

export function formatReport(r: ReconcileReport, top = 10): string {
  const out: string[] = ["ABGLEICH TURNIERWERTUNG (gespeichert in Base44 vs. neu berechnet)"];
  for (const c of r.tournaments) {
    out.push(`  ${c.diffs.length ? "✗" : "✓"} ${c.name}: ${c.stored} gespeichert, ${c.computed} berechnet${c.diffs.length ? `, ${c.diffs.length} Abweichungen` : ""}`);
    for (const x of c.diffs.slice(0, 8)) out.push(`      ${x.name}: Base44 ${x.stored ?? "—"} | neu ${x.computed ?? "—"}`);
    if (c.diffs.length > 8) out.push(`      … und ${c.diffs.length - 8} weitere`);
  }
  out.push("", `RANGLISTEN (aktive Saison, Top ${top})`);
  for (const [name, rows] of Object.entries(r.ranking)) {
    if (!rows.length) continue;
    out.push(`  ${name} (${rows.length} Spieler)`);
    for (const x of rows.slice(0, top)) out.push(`    ${String(x.rank).padStart(3)}. ${(r.names.get(x.player_id) ?? x.player_id).padEnd(28)} ${String(x.points).padStart(5)} P  ${x.tournaments} T`);
  }
  return out.join("\n");
}
