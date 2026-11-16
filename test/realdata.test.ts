// Abgleich mit dem echten Base44-Export (nur lokal – data-base44/ liegt nicht im Git)
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadBase44 } from "../scripts/base44Data";
import { reconcile } from "../scripts/reconcileCore";

const DIR = join(__dirname, "..", "data-base44", "csv");

describe.skipIf(!existsSync(join(DIR, "Tournament.csv")))("Base44-Export", () => {
  const { tables } = loadBase44(DIR);
  const report = reconcile(tables);
  const name = (id: string) => report.names.get(id);

  it("Turnierwertung stimmt überein (bekannte Abweichungen durch spätere Datenänderungen ausgenommen)", () => {
    const known = new Set(["Pongauer Stier 2026", "2. Blaufränkisch Open", "Marchfeldturnier 2026"]);
    for (const c of report.tournaments) if (!known.has(c.name)) expect(c.diffs, c.name).toEqual([]);
  });

  it("Rangliste Tour 2026/2027 wie in der laufenden App (Stand 16.11.2026)", () => {
    const h = report.ranking["Tour Herren"].slice(0, 3).map((r) => [name(r.player_id), r.points]);
    const d = report.ranking["Tour Damen"].slice(0, 3).map((r) => [name(r.player_id), r.points]);
    expect(h).toEqual([["Lukas Temistokle", 2750], ["Philipp Vsetecka", 2450], ["Lukas Huber", 2010]]);
    expect(d).toEqual([["Sarah Walch", 2175], ["Lara Flatscher", 2000], ["Maja Nikolic", 1780]]);
  });
});
