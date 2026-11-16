// Veranstalter-Aktionen (Admin, Turnier-Admin, Ersteller oder Mitveranstalter des Turniers)
import { Hono } from "hono";
import { HttpError, nowIso, type AppEnv, type Ctx } from "../env";
import { requireUser } from "../auth/session";
import { newId } from "../auth/crypto";
import { isTournamentOrganizer } from "../../rules/roles";
import { generateResultRecords } from "../../rules/results";
import { loadPlans, loadPlayers, loadScores } from "../services/data";

const org = new Hono<AppEnv>();

interface TournamentRow { id: string; name: string; status: string; tier: string | null; mode: string; series_type: string; created_by: string | null; co_organizer_emails: string }

async function organizerTournament(c: Ctx): Promise<TournamentRow> {
  const t = await c.env.DB.prepare("SELECT id, name, status, tier, mode, series_type, created_by, co_organizer_emails FROM tournaments WHERE id = ? AND deleted_at IS NULL")
    .bind(c.req.param("id")).first<TournamentRow>();
  if (!t) throw new HttpError(404, "Turnier nicht gefunden.");
  const u = c.var.user!;
  const b44 = await c.env.DB.prepare("SELECT base44_id FROM users WHERE id = ?").bind(u.id).first<{ base44_id: string | null }>();
  if (!isTournamentOrganizer({ ...u, base44_id: b44?.base44_id }, t)) throw new HttpError(403, "Du bist nicht Veranstalter dieses Turniers.");
  return t;
}

function logAction(c: Ctx, t: TournamentRow, action: string, field: string, oldValue: string, newValue: string) {
  const u = c.var.user!;
  return c.env.DB.prepare(
    `INSERT INTO action_log (id, tournament_id, tournament_name, action, field, old_value, new_value, actor_id, actor_email, actor_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId(), t.id, t.name, action, field, oldValue, newValue, u.id, u.email, u.full_name ?? u.email, nowIso());
}

/** Turnier abschließen: Platzierungen + Tour-Punkte aus den aktuellen Scores neu vergeben */
org.post("/tournaments/:id/finish", requireUser, async (c) => {
  const t = await organizerTournament(c);
  if (t.status === "abgeschlossen") throw new HttpError(409, "Das Turnier ist schon abgeschlossen.");
  await assertSeasonOpen(c, t.id);
  const db = c.env.DB;
  const [scores, players, plans] = await Promise.all([loadScores(db, t.id), loadPlayers(db), loadPlans(db, t.id)]);
  const plan = plans.get(t.id) ?? { teams: [], schedules: [] };
  const records = generateResultRecords({
    scores, players, tier: t.tier || "Masters 250", tournamentId: t.id, isFinal: t.mode === "final",
    includeHobby: true, seriesType: t.series_type || "standard", teams: plan.teams, schedules: plan.schedules,
  });
  const now = nowIso();
  await db.batch([
    db.prepare("DELETE FROM results WHERE tournament_id = ?").bind(t.id),
    ...records.map((r) => db.prepare("INSERT INTO results (id, tournament_id, player_id, position, points, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), r.tournament_id, r.player_id, r.position, r.points, r.notes, now)),
    logAction(c, t, "tournament_finish", "status", t.status, "abgeschlossen"),
    db.prepare("UPDATE tournaments SET status = 'abgeschlossen', updated_at = ? WHERE id = ?").bind(now, t.id),
  ]);
  return c.json({ ok: true, results: records.length });
});

/** Turnier wiedereröffnen: vergebene Ergebnisse werden gelöscht (wie bisher), bis zum erneuten Abschluss */
org.post("/tournaments/:id/reopen", requireUser, async (c) => {
  const t = await organizerTournament(c);
  if (t.status !== "abgeschlossen") throw new HttpError(409, "Das Turnier ist nicht abgeschlossen.");
  await assertSeasonOpen(c, t.id);
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM results WHERE tournament_id = ?").bind(t.id),
    logAction(c, t, "tournament_reopen", "status", "abgeschlossen", "laufend"),
    c.env.DB.prepare("UPDATE tournaments SET status = 'laufend', updated_at = ? WHERE id = ?").bind(now, t.id),
  ]);
  return c.json({ ok: true });
});

/** Turniere einer abgeschlossenen (inaktiven) Saison sind gesperrt – wie bisher */
async function assertSeasonOpen(c: Ctx, tournamentId: string) {
  const s = await c.env.DB.prepare("SELECT s.is_active FROM tournaments t JOIN seasons s ON s.id = t.season_id WHERE t.id = ?").bind(tournamentId).first<{ is_active: number }>();
  if (s && !s.is_active) throw new HttpError(409, "Die Saison dieses Turniers ist abgeschlossen.");
}

export default org;
