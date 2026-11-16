// /api/auth/* und /api/me
import { Hono } from "hono";
import { hashPassword, verifyPassword, passwordProblem, randomToken, sha256Hex, newId } from "../auth/crypto";
import { createSession, destroySession, destroyAllSessions, requireUser, requireAdmin, loadUser } from "../auth/session";
import { sendMail, passwordMail, sendMailBatch, migrationMail } from "../mail";
import { HttpError, iterations, nowIso, type AppEnv, type Ctx } from "../env";

const auth = new Hono<AppEnv>();

const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 30;
const FAIL_WINDOW_MIN = 15;
const RESET_HOURS = 2;
const SET_PASSWORD_HOURS = 24 * 21; // Umzugs-Mail: 3 Wochen gültig

const normEmail = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const clientIp = (c: Ctx) => c.req.header("CF-Connecting-IP") || "local";

async function body<T>(c: Ctx): Promise<Partial<T>> {
  try { return (await c.req.json()) as Partial<T>; } catch { throw new HttpError(400, "Ungültige Anfrage."); }
}

// ---- Rate-Limit für Login-Versuche
async function checkRateLimit(c: Ctx, email: string) {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
  const row = await c.env.DB.prepare(
    `SELECT SUM(key = ?1) AS by_email, SUM(key = ?2) AS by_ip FROM login_attempts WHERE created_at > ?3 AND key IN (?1, ?2)`,
  ).bind(`email:${email}`, `ip:${clientIp(c)}`, since).first<{ by_email: number | null; by_ip: number | null }>();
  if ((row?.by_email ?? 0) >= MAX_FAILS_PER_EMAIL || (row?.by_ip ?? 0) >= MAX_FAILS_PER_IP) {
    throw new HttpError(429, `Zu viele Fehlversuche. Bitte warte ${FAIL_WINDOW_MIN} Minuten oder setze dein Passwort zurück.`);
  }
}
async function recordFailure(c: Ctx, email: string) {
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO login_attempts (key, created_at) VALUES (?, ?)").bind(`email:${email}`, now),
    c.env.DB.prepare("INSERT INTO login_attempts (key, created_at) VALUES (?, ?)").bind(`ip:${clientIp(c)}`, now),
    c.env.DB.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(new Date(Date.now() - 86_400_000).toISOString()),
  ]);
}

// ---- Passwort-Token (setzen/zurücksetzen)
export async function createPasswordLink(c: Ctx, userId: string, purpose: "set_password" | "reset_password"): Promise<{ link: string; hours: number }> {
  const token = randomToken();
  const hours = purpose === "set_password" ? SET_PASSWORD_HOURS : RESET_HOURS;
  const now = new Date();
  await c.env.DB.batch([
    // ältere, unbenutzte Links desselben Nutzers entwerten
    c.env.DB.prepare("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(now.toISOString(), userId),
    c.env.DB.prepare("INSERT INTO auth_tokens (id, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256Hex(token), userId, purpose, now.toISOString(), new Date(now.getTime() + hours * 3_600_000).toISOString()),
  ]);
  const base = (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, "");
  return { link: `${base}/passwort?token=${token}`, hours };
}

// ---- E-Mail/Passwort
auth.post("/auth/login", async (c) => {
  const b = await body<{ email: string; password: string }>(c);
  const email = normEmail(b.email);
  if (!email || typeof b.password !== "string") throw new HttpError(400, "E-Mail und Passwort angeben.");
  await checkRateLimit(c, email);
  const u = await c.env.DB.prepare("SELECT id, password_hash, google_sub FROM users WHERE email = ?").bind(email)
    .first<{ id: string; password_hash: string | null; google_sub: string | null }>();
  if (!u?.password_hash) {
    await recordFailure(c, email);
    // Umgezogene Konten haben noch kein Passwort → freundlicher Hinweis statt "falsch"
    if (u) throw new HttpError(401, u.google_sub
      ? "Für dieses Konto ist noch kein Passwort gesetzt. Melde dich mit Google an oder nutze „Passwort vergessen“."
      : "Für dieses Konto ist noch kein Passwort gesetzt. Nutze „Passwort vergessen“, um eines festzulegen.");
    throw new HttpError(401, "E-Mail oder Passwort ist falsch.");
  }
  const { ok, needsRehash } = await verifyPassword(b.password, u.password_hash, iterations(c.env), c.env.PASSWORD_PEPPER);
  if (!ok) {
    await recordFailure(c, email);
    throw new HttpError(401, "E-Mail oder Passwort ist falsch.");
  }
  if (needsRehash) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(b.password, iterations(c.env), c.env.PASSWORD_PEPPER), nowIso(), u.id).run();
  }
  await c.env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(`email:${email}`).run();
  await createSession(c, u.id);
  return c.json(await loadUser(c, u.id));
});

auth.post("/auth/register", async (c) => {
  const b = await body<{ email: string; password: string; full_name: string }>(c);
  const email = normEmail(b.email);
  if (!validEmail(email)) throw new HttpError(422, "Bitte eine gültige E-Mail-Adresse angeben.");
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(422, problem);
  await checkRateLimit(c, email);
  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new HttpError(409, "Für diese E-Mail gibt es schon ein Konto. Melde dich an oder nutze „Passwort vergessen“.");
  const id = newId();
  const fullName = typeof b.full_name === "string" && b.full_name.trim() ? b.full_name.trim().slice(0, 80) : null;
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, role, full_name, password_hash, created_at, updated_at) VALUES (?, ?, 'user', ?, ?, ?, ?)`,
  ).bind(id, email, fullName, await hashPassword(b.password!, iterations(c.env), c.env.PASSWORD_PEPPER), now, now).run();
  await createSession(c, id);
  return c.json(await loadUser(c, id), 201);
});

auth.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// Antwort immer gleich – verrät nicht, ob es die Adresse gibt
auth.post("/auth/forgot", async (c) => {
  const email = normEmail((await body<{ email: string }>(c)).email);
  if (!validEmail(email)) throw new HttpError(422, "Bitte eine gültige E-Mail-Adresse angeben.");
  await checkRateLimit(c, email);
  await recordFailure(c, email); // zählt mit, damit niemand Mails im Sekundentakt auslöst
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (u) {
    const { link, hours } = await createPasswordLink(c, u.id, "reset_password");
    await sendMail(c.env, "account", { to: email, ...passwordMail(link, "reset_password", hours) });
  }
  return c.json({ ok: true, message: "Falls es ein Konto mit dieser Adresse gibt, ist eine E-Mail unterwegs." });
});

auth.post("/auth/password", async (c) => {
  const b = await body<{ token: string; password: string }>(c);
  if (typeof b.token !== "string" || !b.token) throw new HttpError(400, "Der Link ist unvollständig.");
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(422, problem);
  const row = await c.env.DB.prepare("SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE id = ?").bind(await sha256Hex(b.token))
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at < nowIso()) throw new HttpError(400, "Der Link ist abgelaufen oder wurde schon benutzt. Fordere bitte einen neuen an.");
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(b.password!, iterations(c.env), c.env.PASSWORD_PEPPER), now, row.user_id),
    c.env.DB.prepare("UPDATE auth_tokens SET used_at = ? WHERE id = ?").bind(now, row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  await createSession(c, row.user_id);
  return c.json(await loadUser(c, row.user_id));
});

// Eingeloggt: Passwort ändern (bzw. erstmals setzen, z. B. als Google-Nutzer)
auth.post("/auth/change-password", requireUser, async (c) => {
  const b = await body<{ current: string; password: string }>(c);
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(422, problem);
  const u = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(c.var.user!.id).first<{ password_hash: string | null }>();
  if (u?.password_hash) {
    const { ok } = await verifyPassword(String(b.current ?? ""), u.password_hash, iterations(c.env), c.env.PASSWORD_PEPPER);
    if (!ok) throw new HttpError(401, "Das aktuelle Passwort stimmt nicht.");
  }
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(await hashPassword(b.password!, iterations(c.env), c.env.PASSWORD_PEPPER), nowIso(), c.var.user!.id).run();
  await destroyAllSessions(c, c.var.user!.id, c.var.sessionId);
  return c.json({ ok: true });
});

// ---- Google (OpenID Connect, Authorization-Code-Flow)
auth.get("/auth/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) throw new HttpError(404, "Google-Login ist noch nicht eingerichtet.");
  const redirectTo = safeRedirect(c.req.query("redirect"));
  const state = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(new Date(Date.now() - 3_600_000).toISOString()),
    c.env.DB.prepare("INSERT INTO oauth_states (id, redirect_to, created_at) VALUES (?, ?, ?)").bind(await sha256Hex(state), redirectTo, nowIso()),
  ]);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(c), response_type: "code",
    scope: "openid email profile", state, prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
});

auth.get("/auth/google/callback", async (c) => {
  const fail = (msg: string) => c.redirect(`/login?fehler=${encodeURIComponent(msg)}`);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || !c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return fail("Google-Anmeldung abgebrochen.");
  const stateId = await sha256Hex(state);
  const st = await c.env.DB.prepare("SELECT redirect_to, created_at FROM oauth_states WHERE id = ?").bind(stateId).first<{ redirect_to: string; created_at: string }>();
  await c.env.DB.prepare("DELETE FROM oauth_states WHERE id = ?").bind(stateId).run();
  if (!st || Date.now() - new Date(st.created_at).getTime() > 600_000) return fail("Die Anmeldung hat zu lange gedauert. Bitte nochmal versuchen.");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(c), grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return fail("Google-Anmeldung fehlgeschlagen.");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) return fail("Google-Anmeldung fehlgeschlagen.");
  const info = (await infoRes.json()) as GoogleProfile;
  const userId = await upsertGoogleUser(c, info);
  if (!userId) return fail("Deine Google-E-Mail-Adresse ist nicht bestätigt.");
  await createSession(c, userId);
  return c.redirect(st.redirect_to);
});

export interface GoogleProfile { sub: string; email: string; email_verified: boolean; name?: string; picture?: string }

/** Google-Konto zuordnen: zuerst über google_sub, dann über die E-Mail (bestehendes Konto), sonst neu anlegen */
export async function upsertGoogleUser(c: Ctx, info: GoogleProfile): Promise<string | null> {
  if (!info.sub || !info.email || info.email_verified !== true) return null;
  const email = normEmail(info.email);
  const now = nowIso();
  const bySub = await c.env.DB.prepare("SELECT id FROM users WHERE google_sub = ?").bind(info.sub).first<{ id: string }>();
  if (bySub) return bySub.id;
  const byEmail = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (byEmail) {
    await c.env.DB.prepare("UPDATE users SET google_sub = ?, email_verified = 1, updated_at = ? WHERE id = ?").bind(info.sub, now, byEmail.id).run();
    return byEmail.id;
  }
  const id = newId();
  const fullName = info.name?.trim() || null;
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, role, full_name, google_sub, email_verified, created_at, updated_at) VALUES (?, ?, 'user', ?, ?, 1, ?, ?)`,
  ).bind(id, email, fullName, info.sub, now, now).run();
  return id;
}

function googleRedirectUri(c: Ctx) {
  return `${new URL(c.req.url).origin}/api/auth/google/callback`;
}
/** Nur interne Pfade als Ziel nach dem Login (kein Open Redirect) */
export function safeRedirect(p: string | undefined): string {
  return p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") ? p : "/";
}

// ---- Eigenes Profil
auth.get("/me", (c) => c.json(c.var.user));

auth.patch("/me", requireUser, async (c) => {
  const b = await body<{ full_name: string | null }>(c);
  const cur = c.var.user!;
  const fullName = b.full_name === undefined ? cur.full_name : typeof b.full_name === "string" && b.full_name.trim() ? b.full_name.trim().slice(0, 80) : null;
  await c.env.DB.prepare("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?").bind(fullName, nowIso(), cur.id).run();
  return c.json(await loadUser(c, cur.id));
});

// ---- Bilder aus R2 (Turnierlogos, Spielerfotos, PDF-Logos)
auth.get("/media/*", async (c) => {
  if (!c.env.MEDIA) throw new HttpError(404, "Nicht gefunden");
  const key = c.req.path.replace(/^\/api\/media\//, "");
  if (!/^[\w\-/.]+$/.test(key) || key.includes("..")) throw new HttpError(404, "Nicht gefunden");
  const obj = await c.env.MEDIA.get(key);
  if (!obj) throw new HttpError(404, "Nicht gefunden");
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers });
});

// ---- Admin: Passwort-Link für einen Nutzer erzeugen (z. B. zum manuellen Verschicken)
auth.post("/admin/users/:id/password-link", requireAdmin, async (c) => {
  const u = await c.env.DB.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").bind(c.req.param("id")).first<{ id: string; email: string; password_hash: string | null }>();
  if (!u) throw new HttpError(404, "Nutzer nicht gefunden.");
  const purpose = u.password_hash ? "reset_password" : "set_password";
  const { link, hours } = await createPasswordLink(c, u.id, purpose);
  const send = c.req.query("senden") === "1";
  const result = send ? await sendMail(c.env, "account", { to: u.email, ...passwordMail(link, purpose, hours) }) : "not_sent";
  await c.env.DB.prepare("INSERT INTO audit_log (user_id, action, details, created_at) VALUES (?, 'password_link', ?, ?)")
    .bind(c.var.user!.id, JSON.stringify({ target: u.id, purpose, mail: result }), nowIso()).run();
  return c.json({ link, valid_hours: hours, mail: result });
});

// ---- Admin: Umzugs-Mail an alle, die noch nicht umgezogen sind (kein Passwort, kein Google, noch nicht angeschrieben)
// Resend-Gratisplan: 100 Mails/Tag → in Portionen verschicken.
const MIGRATION_PENDING = `FROM users u WHERE u.password_hash IS NULL AND u.google_sub IS NULL
  AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.action = 'migration_mail' AND json_extract(a.details, '$.target') = u.id)`;

auth.get("/admin/migration-mail", requireAdmin, async (c) => {
  const pending = await c.env.DB.prepare(`SELECT COUNT(*) AS n ${MIGRATION_PENDING}`).first<{ n: number }>();
  const sent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'migration_mail'").first<{ n: number }>();
  const moved = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL OR google_sub IS NOT NULL").first<{ n: number }>();
  // Wer wurde wann angeschrieben – und ist inzwischen umgezogen?
  const { results: recipients } = await c.env.DB.prepare(
    `SELECT u.email, u.full_name, MAX(a.created_at) AS sent_at,
            (u.password_hash IS NOT NULL OR u.google_sub IS NOT NULL) AS moved
       FROM audit_log a JOIN users u ON u.id = json_extract(a.details, '$.target')
      WHERE a.action = 'migration_mail'
      GROUP BY u.id ORDER BY sent_at DESC, u.email`,
  ).all<{ email: string; full_name: string | null; sent_at: string; moved: number }>();
  return c.json({ pending: pending?.n ?? 0, sent: sent?.n ?? 0, moved: moved?.n ?? 0, mail_ready: !!c.env.RESEND_API_KEY, recipients });
});

auth.post("/admin/migration-mail", requireAdmin, async (c) => {
  const b = await body<{ limit?: number; test?: boolean }>(c);
  const base = (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, "");
  if (b.test) {
    // Testmail an den angemeldeten Admin – mit Beispiel-Link (kein echter Token)
    const me = c.var.user!;
    const result = await sendMail(c.env, "account", { to: me.email, ...migrationMail(base, `${base}/passwort?token=BEISPIEL`, 24 * 21) })
      .catch((e: Error) => { throw new HttpError(422, `Mailversand fehlgeschlagen: ${e.message}`); });
    return c.json({ test: true, to: me.email, mail: result });
  }
  if (!c.env.RESEND_API_KEY) throw new HttpError(400, "Mailversand ist noch nicht eingerichtet (RESEND_API_KEY fehlt).");
  const limit = Math.max(1, Math.min(95, Number(b.limit) || 95));
  const { results } = await c.env.DB.prepare(`SELECT u.id, u.email ${MIGRATION_PENDING} ORDER BY u.created_at LIMIT ?`).bind(limit).all<{ id: string; email: string }>();
  if (!results.length) return c.json({ sent: 0, pending: 0 });
  const mails = [];
  for (const u of results) {
    const { link, hours } = await createPasswordLink(c, u.id, "set_password");
    mails.push({ to: u.email, ...migrationMail(base, link, hours) });
  }
  await sendMailBatch(c.env, mails).catch((e: Error) => { throw new HttpError(422, `Mailversand fehlgeschlagen: ${e.message}`); });
  const now = nowIso();
  await c.env.DB.batch(results.map((u) => c.env.DB.prepare("INSERT INTO audit_log (user_id, action, details, created_at) VALUES (?, 'migration_mail', ?, ?)")
    .bind(c.var.user!.id, JSON.stringify({ target: u.id }), now)));
  const rest = await c.env.DB.prepare(`SELECT COUNT(*) AS n ${MIGRATION_PENDING}`).first<{ n: number }>();
  return c.json({ sent: results.length, pending: rest?.n ?? 0, recipients: results.map((u) => u.email) });
});

export default auth;
