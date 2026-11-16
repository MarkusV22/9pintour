// CI: vorhandene GitHub-Secrets als Worker-Secrets setzen (leere werden übersprungen).
import { writeFileSync } from "node:fs";
const NAMES = ["PASSWORD_PEPPER", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "MAIL_FROM", "IMPORT_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
const out = Object.fromEntries(NAMES.filter((n) => process.env[n]).map((n) => [n, process.env[n]]));
if (!out.PASSWORD_PEPPER) throw new Error("Secret PASSWORD_PEPPER fehlt – ohne ihn kann sich niemand anmelden.");
writeFileSync(process.argv[2], JSON.stringify(out));
console.log("Secrets:", Object.keys(out).join(", "));
