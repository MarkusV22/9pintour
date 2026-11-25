// Veranstalter-Aktionen (Admin, Turnier-Admin, Ersteller oder Mitveranstalter des Turniers)
import { Hono } from "hono";
import { HttpError, nowIso, type AppEnv, type Ctx } from "../env";
import { requireUser } from "../auth/session";
import { newId } from "../auth/crypto";
import { coOrganizerEmails, isTournamentOrganizer, protectedCoOrganizers } from "../../rules/roles";
import { generateResultRecords } from "../../rules/results";
import { loadPlans, loadPlayers, loadScores } from "../services/data";
import { sendMail } from "../mail";

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

/**
 * Mitveranstalter-Auswahl im Dialog „Turnier bearbeiten“: Spieler mit verknüpftem Konto (Name + E-Mail) und die
 * geschützten Einträge (Hauptveranstalter, erster Mitveranstalter). Nur für Veranstalter dieses Turniers –
 * die E-Mails bleiben in der normalen Spielerliste weiterhin verborgen.
 */
org.get("/tournaments/:id/co-organizer-options", requireUser, async (c) => {
  const t = await organizerTournament(c);
  const db = c.env.DB;
  const [{ results: players }, creator] = await Promise.all([
    // alle Spieler (auch ohne Konto – die können per E-Mail eingeladen und verknüpft werden)
    db.prepare("SELECT id, name, first_name, last_name, club, NULLIF(user_email, '') AS user_email FROM players ORDER BY name").all(),
    t.created_by ? db.prepare("SELECT email FROM users WHERE id = ? OR base44_id = ?").bind(t.created_by, t.created_by).first<{ email: string }>() : null,
  ]);
  return c.json({ players, creator_email: creator?.email ?? null, protected: protectedCoOrganizers(coOrganizerEmails(t), creator?.email) });
});

/**
 * Mitveranstalter einladen: E-Mail in die Liste aufnehmen, optional einen Spieler ohne Konto mit dieser E-Mail verknüpfen
 * (er wird bei der Registrierung automatisch zugeordnet) und eine Einladungs-Mail schicken (Konto-Mail, geht immer).
 */
org.post("/tournaments/:id/co-organizers/invite", requireUser, async (c) => {
  const t = await organizerTournament(c);
  const db = c.env.DB;
  const u = c.var.user!;
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; player_id?: string };
  const email = String(b.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, "Bitte eine gültige E-Mail-Adresse eingeben.");
  const lower = email.toLowerCase();
  const stmts: D1PreparedStatement[] = [];

  const linked = await db.prepare("SELECT id, name FROM players WHERE lower(user_email) = ? LIMIT 1").bind(lower).first<{ id: string; name: string }>();
  let player = linked;
  if (!linked && b.player_id) {
    const p = await db.prepare("SELECT id, name, user_email FROM players WHERE id = ?").bind(String(b.player_id)).first<{ id: string; name: string; user_email: string | null }>();
    if (!p) throw new HttpError(404, "Spieler nicht gefunden.");
    if (p.user_email) throw new HttpError(409, `${p.name} ist bereits mit einem anderen Konto verknüpft.`);
    const now = nowIso();
    stmts.push(
      db.prepare("UPDATE players SET user_email = ?, updated_at = ? WHERE id = ?").bind(email, now, p.id),
      db.prepare(`INSERT INTO player_action_log (id, player_id, player_name, action, changed_fields, old_values, new_values, actor_id, actor_email, actor_name, created_at)
        VALUES (?, ?, ?, 'update', '["user_email"]', '{"user_email":null}', ?, ?, ?, ?, ?)`)
        .bind(newId(), p.id, p.name, JSON.stringify({ user_email: email }), u.id, u.email, u.full_name ?? u.email, now),
    );
    player = p;
  }

  const list = coOrganizerEmails(t);
  const already = list.some((e) => e.toLowerCase() === lower);
  const next = already ? list : [...list, email];
  if (!already) stmts.push(db.prepare("UPDATE tournaments SET co_organizer_emails = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(next), nowIso(), t.id));
  if (stmts.length) await db.batch(stmts);

  const registered = !!(await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(lower).first());
  const link = `${c.env.APP_URL}/tournaments/${t.id}`;
  const login = `${c.env.APP_URL}/login?redirect=${encodeURIComponent(`/tournaments/${t.id}`)}`;
  const inviter = u.full_name || u.email;
  const mail = await sendMail(c.env, "account", {
    to: email,
    reply_to: u.email,
    subject: `Einladung als Mitveranstalter: ${t.name}`,
    text: `Servus${player ? ` ${player.name}` : ""}!\n\n${inviter} hat dich als Mitveranstalter für das Turnier „${t.name}“ auf 9pintour.at eingetragen.\n` +
      `Als Mitveranstalter kannst du den Startplan bearbeiten, Ergebnisse eintragen und weitere Mitveranstalter einladen.\n\n` +
      (registered
        ? `Zum Turnier: ${link}\n`
        : `Du hast noch kein Konto. Registriere dich bitte mit genau dieser E-Mail-Adresse (${email}) – per Google oder mit Passwort – dann hast du sofort Zugriff:\n${login}\n` +
          (player ? `Dein Spielerprofil (${player.name}) wird dabei automatisch mit deinem Konto verbunden.\n` : "")) +
      `\nGut Holz!\n9-Pin Tour`,
  }).catch((e) => { console.log("Einladungs-Mail fehlgeschlagen", e); return "failed" as const; });

  return c.json({ ok: true, co_organizer_emails: next, registered, player: player ? { id: player.id, name: player.name } : null, mail });
});

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
