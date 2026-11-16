// Base44-CSV-Export → SQL für D1.
//   npx tsx scripts/import-base44.ts <csv-ordner> <ausgabe.sql> [--reset]
// --reset: vorhandene Daten (außer Sitzungen/Passwörtern bereits angemeldeter Nutzer) vorher löschen.
import { writeFileSync } from "node:fs";
import { loadBase44, TABLE_ORDER, type Row } from "./base44Data";
import { reconcile, formatReport } from "./reconcileCore";

const [dir, out, ...flags] = process.argv.slice(2);
if (!dir || !out) {
  console.error("Aufruf: tsx scripts/import-base44.ts <csv-ordner> <ausgabe.sql> [--reset]");
  process.exit(1);
}

const q = (v: Row[string]) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const { tables, warnings } = loadBase44(dir);
const lines: string[] = ["PRAGMA defer_foreign_keys = ON;"];
if (flags.includes("--reset")) {
  for (const t of [...TABLE_ORDER].reverse()) if (t !== "users") lines.push(`DELETE FROM ${t};`);
}
for (const name of TABLE_ORDER) {
  const rows = tables[name] ?? [];
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  // Nutzer: vorhandene Konten (Passwort/Google) nicht überschreiben
  const verb = name === "users" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50).map((r) => `(${cols.map((c) => q(r[c])).join(", ")})`).join(",\n  ");
    lines.push(`${verb} INTO ${name} (${cols.join(", ")}) VALUES\n  ${chunk};`);
  }
}
writeFileSync(out, lines.join("\n") + "\n");

console.log("Import-SQL geschrieben:", out);
for (const name of TABLE_ORDER) console.log(`  ${name.padEnd(24)} ${String(tables[name]?.length ?? 0).padStart(5)}`);
if (warnings.length) console.log(`\nHinweise (${warnings.length}):\n  ` + [...new Set(warnings)].slice(0, 30).join("\n  "));

console.log("\n" + formatReport(reconcile(tables)));
