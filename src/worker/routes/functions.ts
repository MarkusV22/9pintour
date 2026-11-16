// Serverfunktionen mit den bisherigen Namen (base44.functions.invoke('…')) – POST /api/functions/:name
import { Hono } from "hono";
import { HttpError, nowIso, type AppEnv, type Ctx } from "../env";
import { isTurnierAdmin } from "../auth/session";
import { newId } from "../auth/crypto";
import { getPoints } from "../../rules/points";
import { computeTeamCategory } from "../../rules/teamCategory";

const fn = new Hono<AppEnv>();

const requireTA = (c: Ctx) => {
  if (!c.var.user) throw new HttpError(401, "Bitte melde dich an.");
  if (!isTurnierAdmin(c.var.user)) throw new HttpError(403, "Keine Berechtigung.");
};
const requireAdmin = (c: Ctx) => {
  if (!c.var.user) throw new HttpError(401, "Bitte melde dich an.");
  if (c.var.user.role !== "admin") throw new HttpError(403, "Nur für Admins.");
};
const body = async (c: Ctx) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
const PLAYER_SLOTS = ["player1_id", "player2_id", "player3_id", "player4_id", "player5_id", "player6_id"];

// ---- Newsletter
fn.post("/functions/subscribeNewsletter", async (c) => {
  const b = await body(c);
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Gültige E-Mail-Adresse erforderlich");
  const enabled = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'newsletter_enabled'").first<{ value: string }>();
  if (enabled?.value === "false") throw new HttpError(403, "Der Newsletter ist aktuell deaktiviert.");
  const ex = await c.env.DB.prepare("SELECT id, is_active, name FROM newsletter_subscribers WHERE email = ?").bind(email).first<{ id: string; is_active: number; name: string | null }>();
  const name = String(b.name ?? "").trim().slice(0, 100) || null;
  if (ex) {
    if (!ex.is_active) await c.env.DB.prepare("UPDATE newsletter_subscribers SET is_active = 1, name = COALESCE(?, name) WHERE id = ?").bind(name, ex.id).run();
    return c.json({ success: true, message: "Sie sind bereits angemeldet!" });
  }
  await c.env.DB.prepare("INSERT INTO newsletter_subscribers (id, email, name, source, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .bind(newId(), email, name, String(b.source ?? "dashboard").slice(0, 40), nowIso()).run();
  return c.json({ success: true, message: "Erfolgreich angemeldet!" });
});

fn.post("/functions/getNewsletterStatus", async (c) => {
  if (!c.var.user) throw new HttpError(401, "Nicht angemeldet");
  const ex = await c.env.DB.prepare("SELECT is_active FROM newsletter_subscribers WHERE email = ?").bind(c.var.user.email).first<{ is_active: number }>();
  return c.json({ subscribed: !!ex, is_active: !!ex?.is_active });
});

fn.post("/functions/unsubscribeNewsletter", async (c) => {
  if (!c.var.user) throw new HttpError(401, "Nicht angemeldet");
  const b = await body(c);
  // Nur die eigene Adresse – Admins dürfen jede abmelden
  const email = (c.var.user.role === "admin" && b.email ? String(b.email) : c.var.user.email).trim().toLowerCase();
  const r = await c.env.DB.prepare("UPDATE newsletter_subscribers SET is_active = 0 WHERE email = ?").bind(email).run();
  return c.json({ success: true, message: r.meta.changes ? "Erfolgreich abgemeldet" : "Nicht abonniert" });
});

// ---- Spieler zusammenführen (Duplikate): alle Verweise auf keepId umhängen, removeId löschen
fn.post("/functions/mergePlayers", async (c) => {
  requireTA(c);
  const b = await body(c);
  const keepId = String(b.keepId ?? ""), removeId = String(b.removeId ?? "");
  if (!keepId || !removeId || keepId === removeId) throw new HttpError(400, "keepId und removeId müssen angegeben und verschieden sein");
  const db = c.env.DB;
  const keep = await db.prepare("SELECT * FROM players WHERE id = ?").bind(keepId).first<Record<string, unknown>>();
  if (!keep) throw new HttpError(404, "Spieler (behalten) nicht gefunden");
  const remove = await db.prepare("SELECT * FROM players WHERE id = ?").bind(removeId).first<Record<string, unknown>>();
  const stmts: D1PreparedStatement[] = [];
  if (remove) {
    const patch: Record<string, unknown> = {};
    for (const k of ["photo_url", "club", "age_class", "user_email", "phone", "birth_date", "whatsapp", "personal_best"]) if (!keep[k] && remove[k]) patch[k] = remove[k];
    if (Object.keys(patch).length) stmts.push(db.prepare(`UPDATE players SET ${Object.keys(patch).map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(patch), nowIso(), keepId));
  }
  for (const t of ["scores", "schedules", "results"]) stmts.push(db.prepare(`UPDATE ${t} SET player_id = ? WHERE player_id = ?`).bind(keepId, removeId));
  for (const s of PLAYER_SLOTS) stmts.push(db.prepare(`UPDATE teams SET ${s} = ? WHERE ${s} = ?`).bind(keepId, removeId));
  if (remove) stmts.push(db.prepare("DELETE FROM players WHERE id = ?").bind(removeId));
  const name = (p: Record<string, unknown>) => String(p.name || `${p.first_name ?? ""} ${p.last_name ?? ""}`).trim();
  const keepName = name(keep), removeName = remove ? name(remove) : "(bereits gelöscht)";
  stmts.push(db.prepare(`INSERT INTO player_merges (id, keep_player_id, keep_player_name, keep_player_number, remove_player_id, remove_player_name, remove_player_number, is_repair, performed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(newId(), keepId, keepName, keep.number ?? null, removeId, removeName, remove?.number ?? null, remove ? 0 : 1, c.var.user!.email, nowIso()));
  await db.batch(stmts);
  return c.json({ success: true, keepId, removeId, wasRepair: !remove, keepPlayerName: keepName, removePlayerName: removeName });
});

// ---- Verweise auf nicht (mehr) vorhandene Spieler finden
fn.post("/functions/getOrphanedPlayerRefs", async (c) => {
  requireTA(c);
  const { results } = await c.env.DB.prepare(
    `WITH refs(player_id, src) AS (
       SELECT player_id, 'scores' FROM scores UNION ALL SELECT player_id, 'schedules' FROM schedules
       UNION ALL SELECT player_id, 'results' FROM results
       UNION ALL SELECT value, 'teams' FROM teams, json_each(json_array(player1_id, player2_id, player3_id, player4_id, player5_id, player6_id)))
     SELECT player_id, SUM(src='scores') AS scores, SUM(src='schedules') AS schedules, SUM(src='results') AS results, SUM(src='teams') AS teams, COUNT(*) AS total
       FROM refs WHERE player_id IS NOT NULL AND player_id NOT IN (SELECT id FROM players)
      GROUP BY player_id ORDER BY total DESC`,
  ).all();
  return c.json({ totalOrphans: results.length, orphans: results });
});

// ---- Spielern ohne Nummer eine Nummer geben (Herren ab 1001, Damen ab 2001 bzw. höchste + 1)
fn.post("/functions/renumberAllPlayers", async (c) => {
  requireAdmin(c);
  const db = c.env.DB;
  const max = await db.prepare("SELECT MAX(CASE WHEN category='Herren' THEN number END) AS h, MAX(CASE WHEN category='Damen' THEN number END) AS d FROM players").first<{ h: number | null; d: number | null }>();
  let nh = Math.max(1001, (max?.h ?? 1000) + 1), nd = Math.max(2001, (max?.d ?? 2000) + 1);
  const { results } = await db.prepare("SELECT id, category FROM players WHERE number IS NULL OR number = 0 ORDER BY created_at").all<{ id: string; category: string }>();
  let herren = 0, damen = 0;
  const stmts = results.map((p) => {
    const n = p.category === "Damen" ? (damen++, nd++) : (herren++, nh++);
    return db.prepare("UPDATE players SET number = ?, updated_at = ? WHERE id = ?").bind(n, nowIso(), p.id);
  });
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  const total = await db.prepare("SELECT COUNT(*) AS n FROM players").first<{ n: number }>();
  return c.json({ success: true, message: `${herren} Herren und ${damen} Damen neu nummeriert.`, herrenUpdated: herren, damenUpdated: damen, totalWithoutNumber: results.length, totalPlayers: total?.n ?? 0, done: true });
});

// ---- Mannschaftskategorien anhand der Spieler neu bestimmen
fn.post("/functions/recategorizeTeams", async (c) => {
  requireTA(c);
  const db = c.env.DB;
  const [{ results: teams }, { results: players }, { results: tournaments }] = await Promise.all([
    db.prepare("SELECT * FROM teams").all<Record<string, string | null>>(),
    db.prepare("SELECT id, category FROM players").all<{ id: string; category: string }>(),
    db.prepare("SELECT id, team_size, allowed_categories, mixed_combinations FROM tournaments").all<{ id: string; team_size: number | null; allowed_categories: string | null; mixed_combinations: string | null }>(),
  ]);
  const pc = new Map(players.map((p) => [p.id, p.category]));
  const tm = new Map(tournaments.map((t) => [t.id, t]));
  const details: { id: string; old: string | null; new: string; name: string | null }[] = [];
  for (const team of teams) {
    const t = tm.get(String(team.tournament_id));
    const cats = PLAYER_SLOTS.map((s) => team[s]).filter(Boolean).map((id) => pc.get(id!)).filter(Boolean) as string[];
    const computed = computeTeamCategory(cats, t?.team_size || 4, t?.allowed_categories ?? null, t?.mixed_combinations ?? null);
    if (computed && computed !== team.category) details.push({ id: String(team.id), old: team.category, new: computed, name: team.name });
  }
  if (details.length) await db.batch(details.map((d) => db.prepare("UPDATE teams SET category = ?, updated_at = ? WHERE id = ?").bind(d.new, nowIso(), d.id)));
  return c.json({ totalTeams: teams.length, checked: teams.length, corrected: details.length, details });
});

// ---- Finalturnier: Qualifikationsrangliste aus den Scores der Saison (wie bisher, ohne Finalturniere und K.-o.-Scores)
fn.post("/functions/generateFinalGroups", async (c) => {
  requireTA(c);
  const b = await body(c);
  const topN = Number(b.top_n) || 30;
  const db = c.env.DB;
  const season = b.season_id ? await db.prepare("SELECT start_date, end_date FROM seasons WHERE id = ?").bind(String(b.season_id)).first<{ start_date: string; end_date: string }>() : null;
  const { results: tournaments } = await db.prepare("SELECT id, date, status, mode, tier FROM tournaments ORDER BY date DESC").all<{ id: string; date: string | null; status: string; mode: string; tier: string | null }>();
  const finished = tournaments.filter((t) => (!season || (t.date && t.date.slice(0, 10) >= season.start_date && t.date.slice(0, 10) <= season.end_date)) && t.status === "abgeschlossen" && t.mode !== "final");
  const { results: scores } = await db.prepare("SELECT tournament_id, player_id, score, category, grp FROM scores WHERE player_id IS NOT NULL AND score IS NOT NULL").all<{ tournament_id: string; player_id: string; score: number; category: string | null; grp: string | null }>();
  const { results: players } = await db.prepare("SELECT id, first_name, last_name, category FROM players").all<{ id: string; first_name: string | null; last_name: string | null; category: string }>();
  const pm = new Map(players.map((p) => [p.id, p]));
  const build = (category: string) => {
    const pts = new Map<string, number>(), cnt = new Map<string, number>(), bestAll = new Map<string, number>();
    for (const t of finished) {
      const best = new Map<string, number>();
      for (const s of scores) {
        if (s.tournament_id !== t.id || s.grp?.startsWith("KO-")) continue;
        const cat = pm.get(s.player_id)?.category ?? s.category;
        if (cat !== category) continue;
        if (!best.has(s.player_id) || s.score > best.get(s.player_id)!) best.set(s.player_id, s.score);
      }
      [...best].sort((a, b2) => b2[1] - a[1]).forEach(([pid, sc], i) => {
        pts.set(pid, (pts.get(pid) ?? 0) + getPoints(t.tier || "Masters 250", i + 1));
        cnt.set(pid, (cnt.get(pid) ?? 0) + 1);
        if (!bestAll.has(pid) || sc > bestAll.get(pid)!) bestAll.set(pid, sc);
      });
    }
    return [...pts].map(([pid, points]) => {
      const p = pm.get(pid);
      return { player_id: pid, name: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "Unbekannt", points, tournaments: cnt.get(pid) ?? 0, best_score: bestAll.get(pid) ?? 0 };
    }).sort((a, b2) => b2.points - a.points || b2.tournaments - a.tournaments).slice(0, topN);
  };
  return c.json({ herren: build("Herren"), damen: build("Damen") });
});

// ---- Online-Zahlung (Stripe): vorbereitet, aber aus
fn.post("/functions/createCheckoutSession", async (c) => {
  const on = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'online_payment_enabled'").first<{ value: string }>();
  if (on?.value !== "true" || !c.env.STRIPE_SECRET_KEY) throw new HttpError(400, "Online-Zahlung ist derzeit nicht aktiviert. Bitte vor Ort bezahlen.");
  throw new HttpError(400, "Online-Zahlung wird gerade eingerichtet. Bitte vor Ort bezahlen.");
});

fn.post("/functions/:name", (c) => { throw new HttpError(404, `Funktion ${c.req.param("name")} gibt es (noch) nicht.`); });

export default fn;
