// Einmaliger Datenimport (Base44 → D1) über den Browser (/einrichtung).
// Nur aktiv, solange das Worker-Secret IMPORT_KEY gesetzt ist; jede Anfrage muss den Schlüssel mitschicken.
// Die Importdatei (scripts/import-base44.ts) hat eine SQL-Anweisung pro Zeile; der Browser schickt sie in Blöcken,
// jeder Block läuft als eine Transaktion.
import { Hono } from "hono";
import { HttpError, type AppEnv } from "../env";
import { sha256Hex } from "../auth/crypto";
import { createPasswordLink } from "./auth";

const setup = new Hono<AppEnv>();
const MAX_STATEMENTS = 200;
const MAX_STATEMENT_LEN = 100_000;
// Nur Datenanweisungen – keine Schema-Änderungen
const ALLOWED = /^(INSERT( OR (IGNORE|REPLACE))? INTO|DELETE FROM) [a-z_]+[ ;(]/i;

setup.use("/setup/*", async (c, next) => {
  const key = c.env.IMPORT_KEY;
  if (!key) throw new HttpError(404, "Nicht gefunden.");
  const given = c.req.header("X-Import-Key") || "";
  if ((await sha256Hex(given)) !== (await sha256Hex(key))) throw new HttpError(403, "Import-Schlüssel stimmt nicht.");
  await next();
});

setup.post("/setup/check", (c) => c.json({ ok: true }));

setup.post("/setup/import/chunk", async (c) => {
  const b = await c.req.json<{ statements?: unknown }>().catch(() => ({} as { statements?: unknown }));
  const list = b.statements;
  if (!Array.isArray(list) || !list.length || list.length > MAX_STATEMENTS) throw new HttpError(400, `1–${MAX_STATEMENTS} Anweisungen pro Block.`);
  const stmts = list.map((s) => {
    if (typeof s !== "string" || !s.trim() || s.length > MAX_STATEMENT_LEN || !ALLOWED.test(s.trim())) throw new HttpError(400, "Ungültige Anweisung.");
    return s.trim();
  });
  try {
    await c.env.DB.batch([c.env.DB.prepare("PRAGMA defer_foreign_keys = ON"), ...stmts.map((s) => c.env.DB.prepare(s))]);
  } catch (e) {
    throw new HttpError(400, `Block fehlgeschlagen: ${(e as Error).message}`);
  }
  return c.json({ ok: true, count: stmts.length });
});

setup.post("/setup/import/finish", async (c) => {
  const counts = await c.env.DB.prepare(
    `SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM players) players, (SELECT count(*) FROM tournaments) tournaments,
            (SELECT count(*) FROM teams) teams, (SELECT count(*) FROM scores) scores, (SELECT count(*) FROM results) results`,
  ).first();
  const { results: admins } = await c.env.DB.prepare("SELECT id, email, full_name FROM users WHERE role = 'admin' AND password_hash IS NULL")
    .all<{ id: string; email: string; full_name: string | null }>();
  const links = [];
  for (const a of admins) {
    const { link } = await createPasswordLink(c, a.id, "set_password");
    links.push({ name: a.full_name || a.email, link });
  }
  return c.json({ counts, admin_links: links });
});

export default setup;
