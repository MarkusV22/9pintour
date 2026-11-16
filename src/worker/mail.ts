// E-Mail-Versand über Resend. Konto-Mails (Passwort setzen/zurücksetzen) sind immer aktiv, sobald
// RESEND_API_KEY gesetzt ist. Newsletter/Bestätigungs-Mails zusätzlich nur mit EMAILS_ENABLED=true.
import type { Env } from "./env";

export interface Mail { to: string; subject: string; text: string; html?: string; reply_to?: string }
export type MailKind = "account" | "newsletter" | "request";

export async function sendMail(env: Env, kind: MailKind, mail: Mail): Promise<"sent" | "disabled" | "logged"> {
  if (kind !== "account" && env.EMAILS_ENABLED !== "true") return "disabled";
  if (!env.RESEND_API_KEY) {
    console.log(`[mail:${kind}] an ${mail.to}: ${mail.subject}\n${mail.text}`);
    return "logged";
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress(env), to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, reply_to: mail.reply_to }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return "sent";
}

export async function sendMailBatch(env: Env, mails: Mail[]): Promise<"sent" | "logged"> {
  if (!mails.length) return "sent";
  if (mails.length > 100) throw new Error("Höchstens 100 Mails pro Batch.");
  if (!env.RESEND_API_KEY) {
    for (const m of mails) console.log(`[mail:batch] an ${m.to}: ${m.subject}`);
    return "logged";
  }
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(mails.map((m) => ({ from: fromAddress(env), to: [m.to], subject: m.subject, text: m.text, reply_to: m.reply_to }))),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return "sent";
}

const fromAddress = (env: Env) => env.MAIL_FROM || "9-Pin Tour <noreply@9pintour.at>";
export const CONTACT_EMAIL = "9pintour.info@gmail.com";

export function passwordMail(link: string, purpose: "set_password" | "reset_password", hoursValid: number): Omit<Mail, "to"> {
  const intro = purpose === "set_password"
    ? "Die 9-Pin Tour ist umgezogen! Deine Turniere, Ergebnisse und dein Spielerprofil sind schon da. Damit du dich anmelden kannst, lege bitte einmalig ein neues Passwort fest:"
    : "Du hast ein neues Passwort für 9pintour.at angefordert. Lege es hier fest:";
  const validity = hoursValid >= 48 ? `${Math.round(hoursValid / 24)} Tage` : `${hoursValid} Stunden`;
  return {
    subject: purpose === "set_password" ? "9pintour.at – bitte Passwort festlegen" : "9pintour.at – Passwort zurücksetzen",
    text: `Servus!\n\n${intro}\n\n${link}\n\nDer Link ist ${validity} gültig. Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren.\n\nGut Holz!\n9-Pin Tour`,
  };
}

/** Umzugs-Mail an alle, die sich in der neuen App noch nicht angemeldet haben (Text vor dem Versand abstimmen) */
export function migrationMail(appUrl: string, link: string, hoursValid: number): Omit<Mail, "to"> {
  const days = Math.round(hoursValid / 24);
  return {
    subject: "9pintour.at ist umgezogen – bitte kurz neu anmelden",
    reply_to: CONTACT_EMAIL,
    text: `Servus!

die 9-Pin Tour ist umgezogen und läuft ab sofort auf einer neuen Plattform. Turniere, Startpläne, Ergebnisse, Ranglisten und dein Spielerprofil sind alle mitgekommen.

SO KOMMST DU WIEDER REIN
• Mit Google: auf ${appUrl} „Mit Google anmelden“ wählen.
• Mit E-Mail: lege bitte einmalig ein neues Passwort fest. Dein persönlicher Link (${days} Tage gültig):
  ${link}

Fragen oder Probleme? Antworte einfach auf diese Mail.

Gut Holz!
9-Pin Tour`,
  };
}
