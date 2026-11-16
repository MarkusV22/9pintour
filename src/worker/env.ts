import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;                  // Turnierlogos, Spielerfotos, PDF-Logos
  APP_URL: string;
  EMAILS_ENABLED: string;            // Newsletter/Bestätigungs-Mails (vorerst "false"); Konto-Mails immer
  PASSWORD_ITERATIONS?: string;      // PBKDF2-Runden; Gratis-Plan: 30000, bezahlt: 100000
  // Secrets (wrangler secret put …; lokal in .dev.vars)
  PASSWORD_PEPPER: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;        // vorbereitet, Online-Zahlung standardmäßig aus
  STRIPE_WEBHOOK_SECRET?: string;
}

export type Role = "user" | "turnier_admin" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  premium_type: string | null;
  premium_expires_at: string | null;
  has_password: number;
  has_google: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null; sessionId: string | null } };
export type Ctx = Context<AppEnv>;

export const iterations = (env: Env) => Number(env.PASSWORD_ITERATIONS) || 30000;
export const nowIso = () => new Date().toISOString();

/** Fachlicher Fehler mit Statuscode – wird als JSON {error} ausgegeben */
export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422 | 429, message: string) {
    super(message);
  }
}
