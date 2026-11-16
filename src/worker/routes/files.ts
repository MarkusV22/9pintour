// Datei-Upload (R2) und E-Mail-Versand im Stil von base44.integrations.Core.UploadFile / SendEmail
import { Hono } from "hono";
import { HttpError, type AppEnv } from "../env";
import { requireUser, isTurnierAdmin } from "../auth/session";
import { newId } from "../auth/crypto";
import { sendMail } from "../mail";

const files = new Hono<AppEnv>();

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "application/pdf": "pdf",
};
const MAX_BYTES = 10 * 1024 * 1024;

files.post("/upload", requireUser, async (c) => {
  if (!c.env.MEDIA) throw new HttpError(404, "Datei-Upload ist noch nicht eingerichtet.");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Keine Datei erhalten.");
  const ext = TYPES[file.type];
  if (!ext) throw new HttpError(422, "Bitte ein Bild (JPG, PNG, WebP, GIF, SVG) oder PDF wählen.");
  if (file.size > MAX_BYTES) throw new HttpError(422, "Die Datei ist zu groß (max. 10 MB).");
  const key = `uploads/${new Date().toISOString().slice(0, 7)}/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable", ...(ext === "svg" ? { contentDisposition: "attachment" } : {}) },
  });
  return c.json({ file_url: `/api/media/${key}` });
});

/**
 * E-Mail aus der App (z. B. „neue Mannschaft angemeldet“ an den Veranstalter, Einladung als Mitveranstalter).
 * Gegen Missbrauch: Empfänger muss Veranstalter eines Turniers sein – außer der Absender ist selbst Veranstalter/Turnier-Admin.
 * Versand nur mit EMAILS_ENABLED=true, sonst nur Protokoll.
 */
files.post("/send-email", requireUser, async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { to?: string; subject?: string; body?: string };
  const to = String(b.to ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(422, "Ungültige Empfängeradresse.");
  const u = c.var.user!;
  const organizerOf = async (email: string) => !!(await c.env.DB.prepare(
    "SELECT 1 FROM tournaments WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM json_each(co_organizer_emails) WHERE lower(value) = ?) LIMIT 1",
  ).bind(email).first());
  if (!isTurnierAdmin(u) && !(await organizerOf(u.email.toLowerCase())) && !(await organizerOf(to))) throw new HttpError(403, "An diese Adresse kann keine Mail geschickt werden.");
  const result = await sendMail(c.env, "request", {
    to, subject: String(b.subject ?? "9-Pin Tour").slice(0, 200), text: String(b.body ?? "").slice(0, 10000), reply_to: u.email,
  });
  return c.json({ ok: true, mail: result });
});

export default files;
