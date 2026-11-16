// Sitzungen: zufälliges Token im HttpOnly-Cookie, in der DB nur dessen SHA-256.
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { randomToken, sha256Hex } from "./crypto";
import { HttpError, nowIso, type AppEnv, type Ctx, type SessionUser } from "../env";

export const COOKIE = "pt_session";
const SESSION_DAYS = 60;
const RENEW_AFTER_DAYS = 7; // gleitend verlängern, höchstens einmal pro Woche schreiben

const days = (n: number) => n * 24 * 60 * 60 * 1000;

export async function createSession(c: Ctx, userId: string): Promise<void> {
  const token = randomToken();
  const now = new Date();
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now.toISOString(), new Date(now.getTime() + days(SESSION_DAYS)).toISOString())
    .run();
  setSessionCookie(c, token);
}

function setSessionCookie(c: Ctx, token: string) {
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: days(SESSION_DAYS) / 1000 });
}

export async function destroySession(c: Ctx): Promise<void> {
  if (c.var.sessionId) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(c.var.sessionId).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Alle Sitzungen eines Nutzers beenden (z. B. nach Passwort-Änderung), optional außer der aktuellen */
export async function destroyAllSessions(c: Ctx, userId: string, exceptId?: string | null): Promise<void> {
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?").bind(userId, exceptId ?? null).run();
}

const USER_COLUMNS = `u.id, u.email, u.role, u.full_name, u.premium_type, u.premium_expires_at,
  (u.password_hash IS NOT NULL) AS has_password, (u.google_sub IS NOT NULL) AS has_google`;

export async function loadUser(c: Ctx, userId: string): Promise<SessionUser | null> {
  return c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`).bind(userId).first<SessionUser>();
}

/** Liest die Sitzung (falls vorhanden) und setzt c.var.user */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("sessionId", null);
  const token = getCookie(c, COOKIE);
  if (token && token.length < 100) {
    const id = await sha256Hex(token);
    const row = await c.env.DB.prepare(
      `SELECT s.expires_at, ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    ).bind(id).first<SessionUser & { expires_at: string }>();
    if (row && row.expires_at > nowIso()) {
      const { expires_at, ...user } = row;
      c.set("user", user);
      c.set("sessionId", id);
      // gleitende Verlängerung
      const left = new Date(expires_at).getTime() - Date.now();
      if (left < days(SESSION_DAYS - RENEW_AFTER_DAYS)) {
        await c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(new Date(Date.now() + days(SESSION_DAYS)).toISOString(), id).run();
        setSessionCookie(c, token);
      }
    } else if (row) {
      await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
      deleteCookie(c, COOKIE, { path: "/" });
    }
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new HttpError(401, "Bitte melde dich an.");
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new HttpError(401, "Bitte melde dich an.");
  if (c.var.user.role !== "admin") throw new HttpError(403, "Nur für Admins.");
  await next();
};

/** Admin oder Turnier-Admin (Turniere, Startpläne, Ergebnisse, Spielerdatenbank) */
export const requireTurnierAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new HttpError(401, "Bitte melde dich an.");
  if (!isTurnierAdmin(c.var.user)) throw new HttpError(403, "Keine Berechtigung.");
  await next();
};

export const isTurnierAdmin = (u: SessionUser | null) => u?.role === "admin" || u?.role === "turnier_admin";

/** Schreibende Anfragen nur von der eigenen Seite (CSRF-Schutz zusätzlich zu SameSite=Lax) */
export const sameOriginWrites: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    const own = new URL(c.req.url).origin;
    const app = c.env.APP_URL ? new URL(c.env.APP_URL).origin : own;
    if (origin && origin !== own && origin !== app) throw new HttpError(403, "Ungültige Herkunft der Anfrage.");
  }
  await next();
};
