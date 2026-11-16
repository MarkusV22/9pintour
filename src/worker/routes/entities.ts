// Kompatible Lese-Schnittstelle im Stil von Base44 (entities.X.list / filter / get), damit die bisherigen
// Seiten fast unverändert weiterlaufen. Felder werden ins alte Format übersetzt (created_date, group, …).
// Schreibzugriffe kommen je Entity mit eigenen Berechtigungen dazu.
import { Hono } from "hono";
import { HttpError, type AppEnv, type SessionUser } from "../env";
import { isTurnierAdmin } from "../auth/session";

const ent = new Hono<AppEnv>();

type Access = "public" | "turnier_admin" | "admin";
interface EntityDef {
  table: string;
  read: Access;
  bools?: string[];
  jsonArrays?: string[];           // in Base44 echte Arrays
  key?: string;                    // Primärschlüssel, falls nicht "id"
}

export const ENTITIES: Record<string, EntityDef> = {
  Tournament: { table: "tournaments", read: "public", bools: ["payment_enabled"], jsonArrays: ["co_organizer_emails"] },
  Team: { table: "teams", read: "public", bools: ["delete_requested"] },
  TournamentSchedule: { table: "schedules", read: "public", bools: ["is_placeholder"] },
  TournamentScore: { table: "scores", read: "public" },
  TournamentResult: { table: "results", read: "public" },
  Season: { table: "seasons", read: "public", bools: ["is_active"] },
  AppSetting: { table: "app_settings", read: "public", key: "key" },
  Player: { table: "players", read: "public", bools: ["whatsapp", "is_hobby", "privacy_accepted"] },
  ActionLog: { table: "action_log", read: "turnier_admin" },
  PlayerActionLog: { table: "player_action_log", read: "turnier_admin" },
  PlayerMerge: { table: "player_merges", read: "turnier_admin", bools: ["is_repair"] },
  PlayerChangeRequest: { table: "player_change_requests", read: "turnier_admin" },
  TournamentRequest: { table: "tournament_requests", read: "admin" },
  NewsletterSubscriber: { table: "newsletter_subscribers", read: "admin", bools: ["is_active"] },
};

/** Base44-Feldname → Spalte */
const FIELD_TO_COL: Record<string, string> = { created_date: "created_at", updated_date: "updated_at", created_by_id: "created_by", group: "grp" };
const COL_TO_FIELD: Record<string, string> = Object.fromEntries(Object.entries(FIELD_TO_COL).map(([f, c]) => [c, f]));

/** Private Spielerfelder – nur für Admins/Turnier-Admins und den eigenen Spieler */
const PRIVATE_PLAYER_FIELDS = ["phone", "birth_date", "user_email", "whatsapp", "privacy_accepted", "privacy_accepted_at", "created_by_id"];

const columnsCache = new Map<string, Set<string>>();
async function columns(db: D1Database, table: string): Promise<Set<string>> {
  if (!columnsCache.has(table)) {
    const { results } = await db.prepare(`SELECT name FROM pragma_table_info(?)`).bind(table).all<{ name: string }>();
    columnsCache.set(table, new Set(results.map((r) => r.name)));
  }
  return columnsCache.get(table)!;
}

function canRead(def: EntityDef, user: SessionUser | null) {
  if (def.read === "public") return true;
  if (def.read === "turnier_admin") return isTurnierAdmin(user);
  return user?.role === "admin";
}

export function toEntity(def: EntityDef, row: Record<string, unknown>, user: SessionUser | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[COL_TO_FIELD[k] ?? k] = v;
  for (const b of def.bools ?? []) if (b in out) out[b] = out[b] === 1 || out[b] === true;
  for (const a of def.jsonArrays ?? []) if (a in out) {
    try { const p = JSON.parse(String(out[a] ?? "[]")); out[a] = Array.isArray(p) ? p : []; } catch { out[a] = []; }
  }
  if (def.key) out.id = out[def.key];
  if (def.table === "tournaments" && !user) delete out.co_organizer_emails;
  if (def.table === "players" && !isTurnierAdmin(user)) {
    const own = !!user && typeof out.user_email === "string" && out.user_email.toLowerCase() === user.email.toLowerCase();
    if (!own) for (const f of PRIVATE_PLAYER_FIELDS) delete out[f];
  }
  return out;
}

async function query(c: import("../env").Ctx, entity: string, filter: Record<string, unknown>, sort: string | undefined, limit: number | undefined) {
  const def = ENTITIES[entity];
  if (!def) throw new HttpError(404, `Unbekannte Tabelle ${entity}.`);
  const user = c.var.user;
  // Eigene Datensätze dürfen auch Nicht-Admins lesen (z. B. eigene Änderungsanträge)
  const ownFilter = entity === "PlayerChangeRequest" && user && String(filter.requested_by_email ?? "").toLowerCase() === user.email.toLowerCase();
  if (!canRead(def, user) && !ownFilter) throw new HttpError(user ? 403 : 401, user ? "Keine Berechtigung." : "Bitte melde dich an.");
  if (def.table === "players" && "user_email" in filter && !isTurnierAdmin(user)) {
    // Spieler über die Konto-E-Mail suchen: nur die eigene
    if (!user || String(filter.user_email ?? "").toLowerCase() !== user.email.toLowerCase()) return [];
  }

  const cols = await columns(c.env.DB, def.table);
  const where: string[] = [];
  const binds: unknown[] = [];
  for (const [field, value] of Object.entries(filter)) {
    const col = field === "id" && def.key ? def.key : FIELD_TO_COL[field] ?? field;
    if (!cols.has(col)) throw new HttpError(400, `Unbekanntes Feld ${field}.`);
    if (value === null) { where.push(`${col} IS NULL`); continue; }
    where.push(def.bools?.includes(field) ? `${col} = ?` : `${col} = ? COLLATE NOCASE`);
    binds.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  let order = "";
  if (sort) {
    const desc = sort.startsWith("-");
    const f = desc ? sort.slice(1) : sort;
    const col = FIELD_TO_COL[f] ?? f;
    if (cols.has(col)) order = ` ORDER BY ${col} ${desc ? "DESC" : "ASC"}`;
  }
  const lim = limit && limit > 0 ? ` LIMIT ${Math.min(Math.floor(limit), 100000)}` : "";
  const sql = `SELECT * FROM ${def.table}${where.length ? " WHERE " + where.join(" AND ") : ""}${order}${lim}`;
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return results.map((r) => toEntity(def, r, user));
}

// GET /api/entities/Player?sort=name&limit=9999&q={"user_email":"…"}
ent.get("/entities/:entity", async (c) => {
  let filter: Record<string, unknown> = {};
  const q = c.req.query("q");
  if (q) {
    try { filter = JSON.parse(q); } catch { throw new HttpError(400, "Ungültiger Filter."); }
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new HttpError(400, "Ungültiger Filter.");
    for (const v of Object.values(filter)) if (v !== null && typeof v === "object") throw new HttpError(400, "Nur einfache Filter werden unterstützt.");
  }
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  return c.json(await query(c, c.req.param("entity"), filter, c.req.query("sort"), limit));
});

ent.get("/entities/:entity/:id", async (c) => {
  const rows = await query(c, c.req.param("entity"), { id: c.req.param("id") }, undefined, 1);
  if (!rows.length) throw new HttpError(404, "Nicht gefunden.");
  return c.json(rows[0]);
});

export default ent;
