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

// Werte als SQL-Literal; Zeilenumbrüche über char(10), damit jede Anweisung genau eine Zeile ist
// (die Import-Seite /einrichtung schickt die Datei zeilenweise in Blöcken).
const q = (v: Row[string]) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  const s = "'" + String(v).replace(/'/g, "''") + "'";
  return s.replace(/\r?\n/g, "' || char(10) || '").replace(/\r/g, "");
};

const { tables, warnings } = loadBase44(dir);
const lines: string[] = ["-- 9pintour.at Datenimport (eine Anweisung pro Zeile)"];
if (flags.includes("--reset")) {
  // alles außer Konten/Sitzungen (bereits gesetzte Passwörter bleiben erhalten)
  for (const t of [...TABLE_ORDER].reverse()) if (t !== "users") lines.push(`DELETE FROM ${t};`);
}
for (const name of TABLE_ORDER) {
  const rows = tables[name] ?? [];
  // Nutzer: vorhandene Konten (Passwort/Google) nicht überschreiben
  const verb = name === "users" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";
  for (const r of rows) {
    const cols = Object.keys(r);
    lines.push(`${verb} INTO ${name} (${cols.join(", ")}) VALUES (${cols.map((c) => q(r[c])).join(", ")});`);
  }
}
writeFileSync(out, lines.join("\n") + "\n");

console.log("Import-SQL geschrieben:", out);
for (const name of TABLE_ORDER) console.log(`  ${name.padEnd(24)} ${String(tables[name]?.length ?? 0).padStart(5)}`);
if (warnings.length) console.log(`\nHinweise (${warnings.length}):\n  ` + [...new Set(warnings)].slice(0, 30).join("\n  "));

console.log("\n" + formatReport(reconcile(tables)));
