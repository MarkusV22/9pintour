// Admin: Datenprüfung – zeigt Unstimmigkeiten im Datenbestand, korrigiert wird nur auf ausdrücklichen Knopfdruck.
import { Hono } from "hono";
import { HttpError, nowIso, type AppEnv } from "../env";
import { requireTurnierAdmin, requireAdmin } from "../auth/session";
import { newId } from "../auth/crypto";
import { generateResultRecords, type ResultRecord } from "../../rules/results";
import { loadPlans, loadPlayers, loadScores } from "../services/data";

const dc = new Hono<AppEnv>();

interface StoredResult { tournament_id: string; player_id: string; position: number; points: number; notes: string | null }
interface T { id: string; name: string; date: string | null; tier: string | null; mode: string; series_type: string; status: string }

async function recompute(db: D1Database, t: T): Promise<ResultRecord[]> {
  const [scores, players, plans] = await Promise.all([loadScores(db, t.id), loadPlayers(db), loadPlans(db, t.id)]);
  const plan = plans.get(t.id) ?? { teams: [], schedules: [] };
  return generateResultRecords({
    scores, players, tier: t.tier || "Masters 250", tournamentId: t.id, isFinal: t.mode === "final",
    includeHobby: true, seriesType: t.series_type || "standard", teams: plan.teams, schedules: plan.schedules,
  });
}

dc.get("/admin/data-check", requireTurnierAdmin, async (c) => {
  const db = c.env.DB;
  const { results: tournaments } = await db.prepare(
    "SELECT id, name, date, tier, mode, series_type, status FROM tournaments WHERE deleted_at IS NULL AND id IN (SELECT DISTINCT tournament_id FROM results) ORDER BY date DESC",
  ).all<T>();
  const { results: names } = await db.prepare("SELECT id, name, number, category, club FROM players").all<{ id: string; name: string; number: number | null; category: string; club: string | null }>();
  const pn = new Map(names.map((p) => [p.id, p]));
  const label = (id: string) => pn.get(id)?.name ?? "(Spieler gelöscht)";

  // 1) Spieler mehrfach in derselben Turnierwertung
  const { results: dupRows } = await db.prepare(
    `SELECT r.tournament_id, r.player_id, r.notes, r.position, r.points FROM results r
      JOIN (SELECT tournament_id, player_id FROM results WHERE player_id IS NOT NULL GROUP BY tournament_id, player_id HAVING COUNT(*) > 1) d
        ON d.tournament_id = r.tournament_id AND d.player_id = r.player_id
      ORDER BY r.tournament_id, r.player_id, r.position`,
  ).all<StoredResult>();
  const doubleEntries = Object.values(dupRows.reduce<Record<string, { tournament_id: string; tournament_name: string; player_id: string; player_name: string; entries: { notes: string | null; position: number; points: number }[] }>>((acc, r) => {
    const k = `${r.tournament_id}|${r.player_id}`;
    acc[k] ??= { tournament_id: r.tournament_id, tournament_name: tournaments.find((t) => t.id === r.tournament_id)?.name ?? r.tournament_id, player_id: r.player_id, player_name: label(r.player_id), entries: [] };
    acc[k].entries.push({ notes: r.notes, position: r.position, points: r.points });
    return acc;
  }, {}));

  // 2) Gleicher Name mehrfach mit unterschiedlicher Kategorie (mögliche Duplikate mit falschem Geschlecht)
  const { results: catDups } = await db.prepare(
    `SELECT p.id, p.name, p.number, p.category, p.club,
            (SELECT COUNT(*) FROM results r WHERE r.player_id = p.id) AS results,
            (SELECT COALESCE(SUM(points), 0) FROM results r WHERE r.player_id = p.id) AS points,
            (SELECT COUNT(*) FROM scores s WHERE s.player_id = p.id) AS scores,
            (SELECT COUNT(*) FROM teams t WHERE p.id IN (t.player1_id, t.player2_id, t.player3_id, t.player4_id, t.player5_id, t.player6_id)) AS teams
       FROM players p
      WHERE lower(trim(p.name)) IN (SELECT lower(trim(name)) FROM players GROUP BY lower(trim(name)) HAVING COUNT(DISTINCT category) > 1)
      ORDER BY lower(p.name), p.category`,
  ).all<{ id: string; name: string; number: number | null; category: string; club: string | null; results: number; points: number; scores: number; teams: number }>();
  const categoryDuplicates = Object.values(catDups.reduce<Record<string, { name: string; players: typeof catDups }>>((acc, p) => {
    const k = p.name.trim().toLowerCase();
    (acc[k] ??= { name: p.name, players: [] }).players.push(p);
    return acc;
  }, {})).filter((g) => g.players.some((p) => p.results || p.scores));

  // 3) Gespeicherte Wertung weicht von einer Neuberechnung ab
  const { results: stored } = await db.prepare("SELECT tournament_id, player_id, position, points, notes FROM results WHERE player_id IS NOT NULL").all<StoredResult>();
  const recalculation = [];
  for (const t of tournaments) {
    const s = stored.filter((r) => r.tournament_id === t.id);
    const n = await recompute(db, t);
    const key = (r: { notes: string | null; position: number; points: number }) => `${r.notes}|${r.position}|${r.points}`;
    const byPlayer = (list: { player_id: string; notes: string | null; position: number; points: number }[]) => {
      const m = new Map<string, { notes: string | null; position: number; points: number }[]>();
      for (const r of list) (m.get(r.player_id) ?? m.set(r.player_id, []).get(r.player_id)!).push(r);
      return m;
    };
    const a = byPlayer(s), b = byPlayer(n);
    const rows = [...new Set([...a.keys(), ...b.keys()])].map((pid) => ({
      player_id: pid, player_name: label(pid),
      stored: a.get(pid) ?? [], computed: b.get(pid) ?? [],
    })).filter((r) => r.stored.map(key).join() !== r.computed.map(key).join());
    if (rows.length) {
      const pointsDiff = rows.reduce((sum, r) => sum + r.computed.reduce((x, y) => x + y.points, 0) - r.stored.reduce((x, y) => x + y.points, 0), 0);
      rows.sort((x, y) => Math.min(...[...x.stored, ...x.computed].map((e) => e.position)) - Math.min(...[...y.stored, ...y.computed].map((e) => e.position)));
      recalculation.push({ tournament_id: t.id, tournament_name: t.name, date: t.date, changed_players: rows.length, points_diff: pointsDiff, rows });
    }
  }

  return c.json({ double_entries: doubleEntries, category_duplicates: categoryDuplicates, recalculation });
});

/** Turnier neu werten (gespeicherte Platzierungen/Punkte durch Neuberechnung ersetzen) – nur Admin */
dc.post("/admin/tournaments/:id/rewertung", requireAdmin, async (c) => {
  const db = c.env.DB;
  const t = await db.prepare("SELECT id, name, date, tier, mode, series_type, status FROM tournaments WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("id")).first<T>();
  if (!t) throw new HttpError(404, "Turnier nicht gefunden.");
  if (t.status !== "abgeschlossen") throw new HttpError(409, "Nur abgeschlossene Turniere können neu gewertet werden.");
  const records = await recompute(db, t);
  const u = c.var.user!;
  const now = nowIso();
  await db.batch([
    db.prepare("DELETE FROM results WHERE tournament_id = ?").bind(t.id),
    ...records.map((r) => db.prepare("INSERT INTO results (id, tournament_id, player_id, position, points, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), r.tournament_id, r.player_id, r.position, r.points, r.notes, now)),
    db.prepare(`INSERT INTO action_log (id, tournament_id, tournament_name, action, field, old_value, new_value, actor_id, actor_email, actor_name, created_at)
      VALUES (?, ?, ?, 'tournament_rescore', 'results', 'gespeichert', 'neu berechnet', ?, ?, ?, ?)`).bind(newId(), t.id, t.name, u.id, u.email, u.full_name ?? u.email, now),
  ]);
  return c.json({ ok: true, results: records.length });
});

export default dc;
