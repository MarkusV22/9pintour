// Laden der Turnierdaten aus D1 in die Formen der Regeln (src/rules)
import type { PlayerInfo, TeamRow, ScheduleRow, ResultRecord } from "../../rules/results";
import type { ScoreRow } from "../../rules/scoreNotes";
import type { TournamentInfo, TournamentPlan } from "../../rules/ranking";

export interface TeamDb { id: string; tournament_id: string; name: string; category: string | null;
  player1_id: string | null; player2_id: string | null; player3_id: string | null; player4_id: string | null; player5_id: string | null; player6_id: string | null }

export const toTeam = (t: TeamDb): TeamRow & { tournament_id: string } => ({
  id: t.id, tournament_id: t.tournament_id, name: t.name, category: t.category,
  player_ids: [t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id],
});

/** Öffentliche Spielerfelder (ohne Telefon, Geburtsdatum, Konto-E-Mail) */
export const PUBLIC_PLAYER_COLUMNS = "id, first_name, last_name, name, number, photo_url, category, age_class, club, personal_best, walk_on_song, is_hobby";

export async function loadPlayers(db: D1Database): Promise<Map<string, PlayerInfo & { name: string }>> {
  const { results } = await db.prepare("SELECT id, name, category, age_class, is_hobby, club FROM players").all<PlayerInfo & { name: string }>();
  return new Map(results.map((p) => [p.id, { ...p, is_hobby: !!p.is_hobby }]));
}

export async function loadTournaments(db: D1Database): Promise<(TournamentInfo & { name: string; tier: string | null; mode: string })[]> {
  const { results } = await db.prepare("SELECT id, name, date, status, series_type, deleted_at, tier, mode FROM tournaments").all<TournamentInfo & { name: string; tier: string | null; mode: string }>();
  return results;
}

export async function loadResults(db: D1Database, tournamentId?: string): Promise<ResultRecord[]> {
  const sql = "SELECT tournament_id, player_id, position, points, notes FROM results WHERE player_id IS NOT NULL" + (tournamentId ? " AND tournament_id = ?" : "");
  const stmt = tournamentId ? db.prepare(sql).bind(tournamentId) : db.prepare(sql);
  const { results } = await stmt.all<ResultRecord>();
  return results.map((r) => ({ ...r, notes: r.notes ?? "" }));
}

export async function loadScores(db: D1Database, tournamentId?: string): Promise<ScoreRow[]> {
  const sql = "SELECT id, tournament_id, team_id, schedule_id, player_id, score, notes, category, grp FROM scores" + (tournamentId ? " WHERE tournament_id = ?" : "") + " ORDER BY created_at DESC";
  const stmt = tournamentId ? db.prepare(sql).bind(tournamentId) : db.prepare(sql);
  return (await stmt.all<ScoreRow>()).results;
}

export async function loadPlans(db: D1Database, tournamentId?: string): Promise<Map<string, TournamentPlan>> {
  const where = tournamentId ? " WHERE tournament_id = ?" : "";
  const bind = <T>(s: D1PreparedStatement) => (tournamentId ? s.bind(tournamentId) : s).all<T>();
  const teams = (await bind<TeamDb>(db.prepare(`SELECT id, tournament_id, name, category, player1_id, player2_id, player3_id, player4_id, player5_id, player6_id FROM teams${where}`))).results;
  const scheds = (await bind<ScheduleRow & { tournament_id: string }>(db.prepare(`SELECT tournament_id, team_id, player_id, is_placeholder FROM schedules${where}`))).results;
  const plans = new Map<string, TournamentPlan>();
  const get = (id: string) => { if (!plans.has(id)) plans.set(id, { teams: [], schedules: [] }); return plans.get(id)!; };
  for (const t of teams) get(t.tournament_id).teams.push(toTeam(t));
  for (const s of scheds) get(s.tournament_id).schedules.push({ ...s, is_placeholder: !!s.is_placeholder });
  return plans;
}

export async function activeSeason(db: D1Database): Promise<{ id: string; name: string; start_date: string; end_date: string } | null> {
  return db.prepare("SELECT id, name, start_date, end_date FROM seasons WHERE is_active = 1 ORDER BY start_date DESC LIMIT 1").first();
}

export async function settings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}
