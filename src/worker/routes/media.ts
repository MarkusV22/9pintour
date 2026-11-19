// Admin: Bilder von Base44 (base44.app) in den eigenen R2-Speicher kopieren und die Verweise umstellen.
// Läuft in Portionen (Gratis-Plan: begrenzte Anzahl ausgehender Anfragen pro Aufruf) – das Frontend ruft so lange auf, bis nichts mehr offen ist.
import { Hono } from "hono";
import { HttpError, nowIso, type AppEnv } from "../env";
import { requireAdmin } from "../auth/session";
import { newId } from "../auth/crypto";

const media = new Hono<AppEnv>();
const BATCH = 15;
const isBase44 = (u: unknown) => typeof u === "string" && /^https:\/\/([a-z0-9-]+\.)*base44\.(app|com)\//i.test(u);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "application/pdf": "pdf" };

interface Ref { table: "tournaments" | "players" | "app_settings"; key: string; column: string; url: string }

async function pending(db: D1Database): Promise<Ref[]> {
  const like = "%base44.%";
  const [t, p, s] = await Promise.all([
    db.prepare("SELECT id AS key, logo_url AS url FROM tournaments WHERE logo_url LIKE ?").bind(like).all<{ key: string; url: string }>(),
    db.prepare("SELECT id AS key, photo_url AS url FROM players WHERE photo_url LIKE ?").bind(like).all<{ key: string; url: string }>(),
    db.prepare("SELECT key, value AS url FROM app_settings WHERE value LIKE ?").bind(like).all<{ key: string; url: string }>(),
  ]);
  return [
    ...t.results.map((r) => ({ table: "tournaments" as const, column: "logo_url", ...r })),
    ...p.results.map((r) => ({ table: "players" as const, column: "photo_url", ...r })),
    ...s.results.map((r) => ({ table: "app_settings" as const, column: "value", ...r })),
  ].filter((r) => isBase44(r.url));
}

media.get("/admin/media-migration", requireAdmin, async (c) => c.json({ pending: (await pending(c.env.DB)).length }));

media.post("/admin/media-migration", requireAdmin, async (c) => {
  if (!c.env.MEDIA) throw new HttpError(404, "Bildspeicher (R2) ist nicht eingerichtet.");
  const db = c.env.DB;
  const refs = await pending(db);
  // gleiche Adresse nur einmal kopieren
  const urls = [...new Set(refs.map((r) => r.url))].slice(0, BATCH);
  const done: string[] = [], failed: { url: string; error: string }[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const ext = EXT[type] ?? url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1]?.toLowerCase() ?? "bin";
      const key = `base44/${newId()}.${ext}`;
      await c.env.MEDIA.put(key, await res.arrayBuffer(), {
        httpMetadata: { contentType: type || "application/octet-stream", cacheControl: "public, max-age=31536000, immutable", ...(ext === "svg" ? { contentDisposition: "attachment" } : {}) },
      });
      const local = `/api/media/${key}`;
      const now = nowIso();
      await db.batch(refs.filter((r) => r.url === url).map((r) =>
        r.table === "app_settings"
          ? db.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?").bind(local, now, r.key)
          : db.prepare(`UPDATE ${r.table} SET ${r.column} = ?, updated_at = ? WHERE id = ?`).bind(local, now, r.key)));
      done.push(url);
    } catch (e) {
      failed.push({ url, error: (e as Error).message });
    }
  }
  const rest = (await pending(db)).length;
  return c.json({ copied: done.length, failed, pending: rest });
});

export default media;
