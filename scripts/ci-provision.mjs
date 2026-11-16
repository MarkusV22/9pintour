// CI: D1-Datenbank und R2-Bucket anlegen (falls nötig) und die echte Datenbank-ID in wrangler.jsonc eintragen.
// Läuft in GitHub Actions mit CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DB = "9pintour";
const BUCKET = "9pintour-media";
const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const list = JSON.parse(sh("npx wrangler d1 list --json"));
let db = list.find((d) => d.name === DB);
if (!db) {
  console.log(`D1-Datenbank ${DB} wird angelegt …`);
  sh(`npx wrangler d1 create ${DB} --location weur`);
  db = JSON.parse(sh("npx wrangler d1 list --json")).find((d) => d.name === DB);
}
if (!db?.uuid) throw new Error("D1-Datenbank nicht gefunden");
console.log(`D1: ${DB} (${db.uuid})`);

// R2 ist optional: ohne aktiviertes R2 läuft die App, nur Bild-Uploads sind gesperrt.
let r2 = true;
try {
  const buckets = sh("npx wrangler r2 bucket list");
  if (!buckets.includes(BUCKET)) {
    console.log(`R2-Bucket ${BUCKET} wird angelegt …`);
    sh(`npx wrangler r2 bucket create ${BUCKET} --location weur`);
  }
} catch {
  r2 = false;
  console.log("::warning::R2 ist im Cloudflare-Konto nicht aktiviert – Veröffentlichung ohne Bild-Uploads.");
}

let cfg = readFileSync("wrangler.jsonc", "utf8").replace("LOCAL-ONLY-REPLACE-AFTER-wrangler-d1-create", db.uuid);
if (!r2) cfg = cfg.replace(/\s*"r2_buckets": \[[^\]]*\],/, "");
writeFileSync("wrangler.jsonc", cfg);
