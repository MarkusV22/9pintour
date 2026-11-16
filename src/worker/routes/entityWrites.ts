// Schreibzugriffe im Base44-Stil (create / update / delete / bulkCreate / deleteMany) mit Berechtigungen je Tabelle.
// Grundsatz: Turnierdaten nur für Veranstalter des jeweiligen Turniers (inkl. Turnier-Admin/Admin),
// Einstellungen/Saisonen nur Admin, Spieler-Stammdaten Turnier-Admin oder der eigene Spieler.
import { Hono } from "hono";
import { HttpError, nowIso, type AppEnv, type Ctx, type SessionUser } from "../env";
import { isTurnierAdmin } from "../auth/session";
import { newId } from "../auth/crypto";
import { isTournamentOrganizer } from "../../rules/roles";
import { ENTITIES, toEntity } from "./entities";

const w = new Hono<AppEnv>();

type Row = Record<string, unknown>;
type Op = "create" | "update" | "delete";

const FIELD_TO_COL: Record<string, string> = { created_date: "created_at", updated_date: "updated_at", created_by_id: "created_by", group: "grp" };
/** Nie vom Client setzbar */
const PROTECTED = new Set(["id", "created_at", "updated_at", "created_by"]);

const colsCache = new Map<string, Set<string>>();
async function cols(db: D1Database, table: string) {
  if (!colsCache.has(table)) {
    const { results } = await db.prepare("SELECT name FROM pragma_table_info(?)").bind(table).all<{ name: string }>();
    colsCache.set(table, new Set(results.map((r) => r.name)));
  }
  return colsCache.get(table)!;
}

const isAdminUser = (u: SessionUser | null) => u?.role === "admin";
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

async function userWithB44(c: Ctx) {
  const u = c.var.user;
  if (!u) return null;
  const r = await c.env.DB.prepare("SELECT base44_id FROM users WHERE id = ?").bind(u.id).first<{ base44_id: string | null }>();
  return { ...u, base44_id: r?.base44_id ?? null };
}

async function tournamentOf(c: Ctx, id: unknown) {
  if (!id) return null;
  return c.env.DB.prepare("SELECT id, name, status, registration_type, created_by, co_organizer_emails, season_id FROM tournaments WHERE id = ?").bind(String(id))
    .first<{ id: string; name: string; status: string; registration_type: string; created_by: string | null; co_organizer_emails: string; season_id: string | null }>();
}

async function isOrganizerOf(c: Ctx, tournamentId: unknown) {
  const t = await tournamentOf(c, tournamentId);
  return !!t && isTournamentOrganizer(await userWithB44(c), t);
}

/** Veranstalter irgendeines Turniers (dürfen Spieler für ihre Turniere anlegen/bearbeiten) */
async function isAnyOrganizer(c: Ctx) {
  const u = await userWithB44(c);
  if (!u) return false;
  if (isTurnierAdmin(u)) return true;
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM tournaments WHERE deleted_at IS NULL AND (created_by IN (?, ?) OR EXISTS (SELECT 1 FROM json_each(co_organizer_emails) WHERE lower(value) = ?)) LIMIT 1`,
  ).bind(u.id, u.base44_id ?? "", u.email.toLowerCase()).first();
  return !!row;
}

/**
 * Prüft, ob die Aktion erlaubt ist. `before` = bisheriger Datensatz (update/delete), `data` = neue Werte (create/update).
 * Gibt ggf. bereinigte Daten zurück (z. B. erzwungene Felder).
 */
async function authorize(c: Ctx, entity: string, op: Op, before: Row | null, data: Row): Promise<Row> {
  const u = c.var.user;
  const deny = (msg = "Keine Berechtigung.") => { throw new HttpError(u ? 403 : 401, u ? msg : "Bitte melde dich an."); };
  const tId = data.tournament_id ?? before?.tournament_id;

  switch (entity) {
    case "Tournament": {
      if (op === "create") { if (!isTurnierAdmin(u)) deny("Turniere legen Turnier-Admins an – oder über „Turnier anmelden“."); break; }
      if (!(await isOrganizerOf(c, before!.id))) deny("Du bist nicht Veranstalter dieses Turniers.");
      if (op === "delete" && !isAdminUser(u)) deny("Endgültig löschen darf nur der Admin.");
      if (!isTurnierAdmin(u)) for (const k of ["tier", "mode", "season_id", "tour_fee_remitted_cents"]) delete data[k]; // Wertung/Saison nur Turnier-Admins
      break;
    }
    case "Team":
    case "TournamentSchedule": {
      if (before && data.tournament_id && data.tournament_id !== before.tournament_id) deny("Turnier kann nicht gewechselt werden.");
      if (await isOrganizerOf(c, tId)) break;
      // Offene Anmeldung: angemeldete Spieler buchen freie Startplätze (SpotBooking)
      const t = await tournamentOf(c, tId);
      if (!u || !t || t.registration_type !== "offen" || t.status === "abgeschlossen") deny();
      if (entity === "Team" && op === "create") break;
      if (entity === "TournamentSchedule" && op === "update" && before && !before.player_id && !before.team_id) {
        const allowed = ["team_id", "player_id", "is_placeholder", "placeholder_label"];
        for (const k of Object.keys(data)) if (!allowed.includes(k)) delete data[k];
        break;
      }
      deny();
      break;
    }
    case "TournamentScore":
    case "TournamentResult": {
      if (before && data.tournament_id && data.tournament_id !== before.tournament_id) deny("Turnier kann nicht gewechselt werden.");
      if (!(await isOrganizerOf(c, tId))) deny("Du bist nicht Veranstalter dieses Turniers.");
      break;
    }
    case "ActionLog": {
      if (op !== "create" || !(await isOrganizerOf(c, data.tournament_id))) deny();
      Object.assign(data, { actor_id: u!.id, actor_email: u!.email, actor_name: u!.full_name || u!.email });
      break;
    }
    case "Player": {
      if (!u) deny();
      if (op === "delete") { if (!isTurnierAdmin(u)) deny(); break; }
      const own = before && lower(before.user_email) === lower(u!.email);
      const claim = op === "update" && before && !before.user_email && Object.keys(data).length === 1 && lower(data.user_email) === lower(u!.email);
      if (isTurnierAdmin(u)) break;
      if (claim) break; // Spieler mit dem eigenen Konto verknüpfen
      if ("user_email" in data && data.user_email && lower(data.user_email) !== lower(u!.email)) deny("Nur das eigene Konto kann verknüpft werden.");
      if (op === "update" && own) break; // eigener Spieler (Name, Profil; Verknüpfung lösen erlaubt)
      if (op === "create") break; // neue Spieler (eigenes Profil, Einzelstarter, Mannschaftsanmeldung)
      if (await isAnyOrganizer(c)) { delete data.user_email; break; }
      deny();
      break;
    }
    case "PlayerChangeRequest": {
      if (op === "create") { if (!u) deny(); Object.assign(data, { requested_by_email: u!.email, requested_by_name: u!.full_name || u!.email, status: "offen" }); break; }
      if (!isTurnierAdmin(u)) deny();
      data.reviewed_by_email = u!.email;
      break;
    }
    case "TournamentRequest": {
      if (op === "create") { data.status = "offen"; delete data.assigned_tier; delete data.admin_notes; break; }
      if (!isAdminUser(u)) deny();
      break;
    }
    case "AppSetting":
    case "Season":
    case "NewsletterSubscriber":
      if (!isAdminUser(u)) deny("Nur für Admins.");
      break;
    default:
      deny("Diese Tabelle kann nicht direkt geändert werden.");
  }
  return data;
}

/** Felder ins Spaltenformat (Arrays/Objekte → JSON, true/false → 1/0) */
async function toColumns(c: Ctx, entity: string, data: Row): Promise<Row> {
  const def = ENTITIES[entity];
  const allowed = await cols(c.env.DB, def.table);
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    const col = FIELD_TO_COL[k] ?? k;
    if (PROTECTED.has(col) || !allowed.has(col)) continue;
    out[col] = v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  }
  return out;
}

async function loadRow(c: Ctx, entity: string, id: string): Promise<Row | null> {
  const def = ENTITIES[entity];
  return c.env.DB.prepare(`SELECT * FROM ${def.table} WHERE ${def.key ?? "id"} = ?`).bind(id).first<Row>();
}

/** Base44-Form des alten Datensatzes (für die Berechtigungsprüfung mit Feldnamen wie im Client) */
const asFields = (row: Row): Row => { const o: Row = {}; for (const [k, v] of Object.entries(row)) o[Object.entries(FIELD_TO_COL).find(([, col]) => col === k)?.[0] ?? k] = v; return o; };

async function create(c: Ctx, entity: string, input: Row) {
  const def = ENTITIES[entity];
  if (!def) throw new HttpError(404, `Unbekannte Tabelle ${entity}.`);
  const data = await authorize(c, entity, "create", null, { ...input });
  const row = await toColumns(c, entity, data);
  const now = nowIso();
  const has = await cols(c.env.DB, def.table);
  if (def.key) { if (!row[def.key]) throw new HttpError(422, `${def.key} fehlt.`); }
  else row.id = newId();
  if (has.has("created_at")) row.created_at = now;
  if (has.has("updated_at")) row.updated_at = now;
  if (has.has("created_by")) row.created_by = c.var.user?.id ?? null;
  const keys = Object.keys(row);
  return { sql: c.env.DB.prepare(`INSERT INTO ${def.table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).bind(...keys.map((k) => row[k])), id: String(row[def.key ?? "id"]) };
}

async function sideEffects(c: Ctx, entity: string, op: Op, before: Row | null, after: Row | null) {
  // Spieler-Änderungsprotokoll (bisher Base44-Automation „Spieler-Action-Log protokollieren“)
  if (entity !== "Player") return;
  const u = c.var.user!;
  const changed = before && after ? Object.keys(after).filter((k) => !["updated_at"].includes(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k])) : [];
  if (op === "update" && !changed.length) return;
  const pick = (r: Row | null) => (r ? Object.fromEntries(changed.map((k) => [k, r[k]])) : null);
  await c.env.DB.prepare(
    `INSERT INTO player_action_log (id, player_id, player_name, action, changed_fields, old_values, new_values, actor_id, actor_email, actor_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId(), (after ?? before)!.id, (after ?? before)!.name, op, JSON.stringify(changed), JSON.stringify(pick(before)), JSON.stringify(pick(after)),
    u.id, u.email, u.full_name ?? u.email, nowIso()).run();
}

w.post("/entities/:entity/bulk", async (c) => {
  const entity = c.req.param("entity");
  const rows = await c.req.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length > 2000) throw new HttpError(400, "Liste mit höchstens 2000 Einträgen erwartet.");
  const made = [];
  for (const r of rows) made.push(await create(c, entity, r ?? {}));
  for (let i = 0; i < made.length; i += 100) await c.env.DB.batch(made.slice(i, i + 100).map((m) => m.sql));
  const def = ENTITIES[entity];
  const out = [];
  for (const m of made) { const row = await loadRow(c, entity, m.id); if (row) out.push(toEntity(def, row, c.var.user)); }
  return c.json(out, 201);
});

w.post("/entities/:entity/delete-many", async (c) => {
  const entity = c.req.param("entity");
  const def = ENTITIES[entity];
  if (!def) throw new HttpError(404, `Unbekannte Tabelle ${entity}.`);
  if (!["Team", "TournamentSchedule", "TournamentScore", "TournamentResult"].includes(entity)) throw new HttpError(400, "Für diese Tabelle nicht möglich.");
  const filter = (await c.req.json().catch(() => ({}))) as Row;
  // nur innerhalb eines Turniers (verhindert versehentliches Löschen ganzer Tabellen)
  if (!filter.tournament_id || Object.keys(filter).some((k) => k !== "tournament_id" && k !== "player_id")) throw new HttpError(400, "Nur nach Turnier (und Spieler) löschbar.");
  await authorize(c, entity, "delete", { tournament_id: filter.tournament_id }, {});
  const where = Object.keys(filter).map((k) => `${k} = ?`).join(" AND ");
  const r = await c.env.DB.prepare(`DELETE FROM ${def.table} WHERE ${where}`).bind(...Object.values(filter)).run();
  return c.json({ deleted: r.meta.changes ?? 0 });
});

w.post("/entities/:entity", async (c) => {
  const entity = c.req.param("entity");
  const input = await c.req.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Ungültige Daten.");
  const m = await create(c, entity, input as Row);
  await m.sql.run();
  const row = await loadRow(c, entity, m.id);
  await sideEffects(c, entity, "create", null, row);
  return c.json(toEntity(ENTITIES[entity], row!, c.var.user), 201);
});

w.patch("/entities/:entity/:id", async (c) => {
  const entity = c.req.param("entity");
  const def = ENTITIES[entity];
  if (!def) throw new HttpError(404, `Unbekannte Tabelle ${entity}.`);
  const before = await loadRow(c, entity, c.req.param("id"));
  if (!before) throw new HttpError(404, "Nicht gefunden.");
  const input = await c.req.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Ungültige Daten.");
  const data = await authorize(c, entity, "update", asFields(before), { ...(input as Row) });
  const row = await toColumns(c, entity, data);
  if (def.key) delete row[def.key];
  const has = await cols(c.env.DB, def.table);
  if (has.has("updated_at")) row.updated_at = nowIso();
  const keys = Object.keys(row);
  if (keys.length) {
    await c.env.DB.prepare(`UPDATE ${def.table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE ${def.key ?? "id"} = ?`)
      .bind(...keys.map((k) => row[k]), c.req.param("id")).run();
  }
  const after = await loadRow(c, entity, c.req.param("id"));
  await sideEffects(c, entity, "update", before, after);
  return c.json(toEntity(def, after!, c.var.user));
});

w.delete("/entities/:entity/:id", async (c) => {
  const entity = c.req.param("entity");
  const def = ENTITIES[entity];
  if (!def) throw new HttpError(404, `Unbekannte Tabelle ${entity}.`);
  const before = await loadRow(c, entity, c.req.param("id"));
  if (!before) return c.json({ ok: true });
  await authorize(c, entity, "delete", asFields(before), {});
  await c.env.DB.prepare(`DELETE FROM ${def.table} WHERE ${def.key ?? "id"} = ?`).bind(c.req.param("id")).run();
  await sideEffects(c, entity, "delete", before, null);
  return c.json({ ok: true });
});

export default w;
