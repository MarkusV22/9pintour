// Minimaler D1-Ersatz auf Basis von node:sqlite – für Tests (und später als Vorlage für den Pi-Betrieb).
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Val = string | number | null | bigint | Uint8Array;
const norm = (v: unknown): Val => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : (v as Val));

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private params: Val[] = []) {}
  bind(...p: unknown[]) { return new Stmt(this.db, this.sql, p.map(norm)); }
  private prep() { return this.db.prepare(this.sql); }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.prep().get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
  async all<T>() { return { results: this.prep().all(...this.params) as T[], success: true, meta: {} }; }
  async run() { const r = this.prep().run(...this.params); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  /** wie D1: SELECT liefert results, alles andere meta */
  _exec() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) return { results: this.prep().all(...this.params), success: true, meta: {} };
    const r = this.prep().run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }
}

export function createD1(migrationsDir = join(__dirname, "..", "migrations")) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    // D1-batch ist eine Transaktion
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s._exec());
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    async exec(sql: string) { db.exec(sql); return { count: 1 }; },
    raw: db,
  };
  return d1 as unknown as D1Database & { raw: DatabaseSync };
}
