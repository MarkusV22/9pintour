// Öffentliche Lese-Schnittstelle (ohne Login sichtbar): Turniere, Ranglisten, Spielerprofile
import { Hono } from "hono";
import { HttpError, type AppEnv } from "../env";
import { finishedInSeason, standardRanking, futureRanking } from "../../rules/ranking";
import { FUTURE_AGE_CLASSES } from "../../rules/points";
import { activeSeason, loadPlans, loadPlayers, loadResults, loadScores, loadTournaments, settings, PUBLIC_PLAYER_COLUMNS } from "../services/data";

const pub = new Hono<AppEnv>();

/** Einstellungen, die das Frontend braucht (keine Preis-IDs o. Ä.) */
const PUBLIC_SETTINGS = ["discord_url", "dashboard_banner_url", "ads_enabled", "ads_html", "future_series_visible", "newsletter_enabled", "online_payment_enabled",
  "ads_premium_yearly_label", "ads_premium_lifetime_label"];
pub.get("/settings", async (c) => {
  const s = await settings(c.env.DB);
  return c.json(Object.fromEntries(PUBLIC_SETTINGS.filter((k) => k in s).map((k) => [k, s[k]])));
});

pub.get("/seasons", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, name, start_date, end_date, is_active FROM seasons ORDER BY start_date DESC").all();
  return c.json(results);
});

const TOURNAMENT_LIST_COLUMNS = `id, name, date, end_date, location, status, tier, series_type, category, team_size, lane_count, logo_url,
  livestream_url, mode, registration_type, season_id`;

pub.get("/tournaments", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${TOURNAMENT_LIST_COLUMNS} FROM tournaments WHERE deleted_at IS NULL ORDER BY date DESC`).all();
  return c.json(results);
});

pub.get("/tournaments/:id", async (c) => {
  const id = c.req.param("id");
  const t = await c.env.DB.prepare("SELECT * FROM tournaments WHERE id = ? AND deleted_at IS NULL").bind(id).first<Record<string, unknown>>();
  if (!t) throw new HttpError(404, "Turnier nicht gefunden.");
  // Zahlungs-Interna nur für Veranstalter (eigene Admin-Schnittstelle)
  for (const k of ["einzelstarter_paid_ids", "einzelstarter_online_paid_ids", "tour_fee_remitted_cents", "co_organizer_emails"]) delete t[k];
  const db = c.env.DB;
  const [teams, schedules, scores, results] = await Promise.all([
    db.prepare("SELECT id, name, category, player1_id, player2_id, player3_id, player4_id, player5_id, player6_id, delete_requested FROM teams WHERE tournament_id = ? ORDER BY created_at").bind(id).all(),
    db.prepare("SELECT id, team_id, player_id, is_placeholder, placeholder_label, start_time, lane, day, venue FROM schedules WHERE tournament_id = ? ORDER BY day, start_time, lane").bind(id).all(),
    db.prepare("SELECT id, team_id, schedule_id, player_id, score, notes, category, grp FROM scores WHERE tournament_id = ?").bind(id).all(),
    db.prepare("SELECT player_id, player_name, position, points, notes FROM results WHERE tournament_id = ? ORDER BY notes, position").bind(id).all(),
  ]);
  // Spieler dieses Turniers (nur öffentliche Felder)
  const { results: players } = await db.prepare(
    `SELECT ${PUBLIC_PLAYER_COLUMNS} FROM players WHERE id IN (
       SELECT player_id FROM schedules WHERE tournament_id = ?1 UNION SELECT player_id FROM scores WHERE tournament_id = ?1
       UNION SELECT player_id FROM results WHERE tournament_id = ?1
       UNION SELECT value FROM teams, json_each(json_array(player1_id, player2_id, player3_id, player4_id, player5_id, player6_id)) WHERE tournament_id = ?1)`,
  ).bind(id).all();
  return c.json({ tournament: t, teams: teams.results, schedules: schedules.results, scores: scores.results, results: results.results, players });
});

/** Tour-Rangliste der aktiven (oder gewählten) Saison, Herren/Damen */
pub.get("/ranking", async (c) => {
  const db = c.env.DB;
  const seasonId = c.req.query("season");
  const season = seasonId
    ? await db.prepare("SELECT id, name, start_date, end_date FROM seasons WHERE id = ?").bind(seasonId).first<{ id: string; name: string; start_date: string; end_date: string }>()
    : await activeSeason(db);
  const [tournaments, results, scores] = await Promise.all([loadTournaments(db), loadResults(db), loadScores(db)]);
  const finished = finishedInSeason(tournaments, results, season, "standard");
  return c.json({
    season,
    tournaments: finished.map((t) => t.id),
    herren: standardRanking("Herren", finished, results, scores),
    damen: standardRanking("Damen", finished, results, scores),
  });
});

/** 9PinFuture-Rangliste je Altersklasse und Geschlecht */
pub.get("/ranking/future", async (c) => {
  const db = c.env.DB;
  const season = await activeSeason(db);
  const [tournaments, results, scores, players, plans] = await Promise.all([loadTournaments(db), loadResults(db), loadScores(db), loadPlayers(db), loadPlans(db)]);
  const finished = finishedInSeason(tournaments, results, season, "future");
  const groups = ["Herren", "Damen"].flatMap((gender) => FUTURE_AGE_CLASSES.map((age_class) => ({
    gender, age_class, rows: futureRanking(age_class, gender, finished, results, scores, players, plans),
  })));
  return c.json({ season, tournaments: finished.map((t) => t.id), groups });
});

pub.get("/players", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${PUBLIC_PLAYER_COLUMNS} FROM players ORDER BY name`).all();
  return c.json(results);
});

pub.get("/players/:id", async (c) => {
  const id = c.req.param("id");
  const player = await c.env.DB.prepare(`SELECT ${PUBLIC_PLAYER_COLUMNS} FROM players WHERE id = ?`).bind(id).first();
  if (!player) throw new HttpError(404, "Spieler nicht gefunden.");
  const { results } = await c.env.DB.prepare(
    `SELECT r.tournament_id, t.name AS tournament_name, t.date, t.tier, t.series_type, r.position, r.points, r.notes
       FROM results r JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.player_id = ? AND t.deleted_at IS NULL ORDER BY t.date DESC`,
  ).bind(id).all();
  const { results: scores } = await c.env.DB.prepare(
    `SELECT s.tournament_id, s.score, s.notes FROM scores s JOIN tournaments t ON t.id = s.tournament_id
      WHERE s.player_id = ? AND t.deleted_at IS NULL`,
  ).bind(id).all();
  return c.json({ player, results, scores });
});

export default pub;
