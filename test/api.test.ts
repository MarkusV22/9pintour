import { describe, expect, it, beforeEach, vi } from "vitest";
import app from "../src/worker/index";
import { createD1 } from "./d1shim";
import type { Env } from "../src/worker/env";

const ORIGIN = "http://localhost";
let env: Env & { DB: ReturnType<typeof createD1> };

function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGIN };
  if (init.cookie) headers.Cookie = init.cookie;
  return app.request(`${ORIGIN}${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), headers, body: init.body ? JSON.stringify(init.body) : undefined }, env);
}
const cookieOf = (res: Response) => (res.headers.get("Set-Cookie") ?? "").split(";")[0];
const NOW = "2026-11-16T00:00:00Z";

function insert(table: string, row: Record<string, unknown>) {
  env.DB.raw.prepare(`INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).run(...(Object.values(row) as never[]));
}

async function login(email: string, role = "user") {
  const res = await req("/api/auth/register", { body: { email, password: "geheim1234", full_name: "Test" } });
  expect(res.status).toBe(201);
  if (role !== "user") env.DB.raw.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, email);
  return cookieOf(res);
}

beforeEach(() => {
  env = { DB: createD1(), APP_URL: ORIGIN, EMAILS_ENABLED: "false", PASSWORD_PEPPER: "pepper", PASSWORD_ITERATIONS: "1000" };
  vi.spyOn(console, "log").mockImplementation(() => {});
  insert("seasons", { id: "s1", name: "2026/2027", start_date: "2026-01-01", end_date: "2027-04-30", is_active: 1, created_at: NOW });
  for (const [id, name, category] of [["p1", "Anna A", "Damen"], ["p2", "Bert B", "Herren"], ["p3", "Carl C", "Herren"]]) {
    insert("players", { id, name, category, birth_date: "1990-01-01", phone: "0664 123", user_email: `${id}@x.at`, created_at: NOW, updated_at: NOW });
  }
  insert("tournaments", { id: "t1", name: "Testturnier", date: "2026-08-01", status: "laufend", tier: "Masters 500", co_organizer_emails: '["veranstalter@x.at"]', created_at: NOW, updated_at: NOW });
  insert("teams", { id: "T1", tournament_id: "t1", name: "Team 1", category: "Mixed", player1_id: "p1", player2_id: "p2", player3_id: "p3", created_at: NOW, updated_at: NOW });
  for (const [id, p, s] of [["s1", "p1", 420], ["s2", "p2", 480], ["s3", "p3", 510]]) {
    insert("scores", { id, tournament_id: "t1", team_id: "T1", player_id: p, score: s, notes: null, created_at: NOW, updated_at: NOW });
  }
});

describe("öffentliche API", () => {
  it("Turnier ohne Login sichtbar, ohne private Spielerdaten", async () => {
    const res = await req("/api/tournaments/t1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tournament: Record<string, unknown>; players: Record<string, unknown>[] };
    expect(body.tournament.name).toBe("Testturnier");
    expect(body.tournament.co_organizer_emails).toBeUndefined();
    expect(body.players).toHaveLength(3);
    for (const p of body.players) {
      expect(p.phone).toBeUndefined();
      expect(p.birth_date).toBeUndefined();
      expect(p.user_email).toBeUndefined();
    }
  });
});

describe("Turnier abschließen", () => {
  it("nur Veranstalter; vergibt Punkte, Rangliste und Action-Log folgen", async () => {
    const fremd = await login("fremd@x.at");
    expect((await req("/api/tournaments/t1/finish", { method: "POST", cookie: fremd })).status).toBe(403);
    expect((await req("/api/tournaments/t1/finish", { method: "POST" })).status).toBe(401);

    const co = await login("veranstalter@x.at");
    const res = await req("/api/tournaments/t1/finish", { method: "POST", cookie: co });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, results: 3 });

    const rank = (await (await req("/api/ranking")).json()) as { herren: { player_id: string; points: number; rank: number }[]; damen: { player_id: string; points: number }[] };
    expect(rank.herren.map((r) => [r.player_id, r.points, r.rank])).toEqual([["p3", 500, 1], ["p2", 300, 2]]);
    expect(rank.damen.map((r) => [r.player_id, r.points])).toEqual([["p1", 500]]);

    const log = env.DB.raw.prepare("SELECT action, actor_email FROM action_log").all();
    expect(log).toEqual([{ action: "tournament_finish", actor_email: "veranstalter@x.at" }]);

    // erneut abschließen geht nicht, wiedereröffnen löscht die Ergebnisse
    expect((await req("/api/tournaments/t1/finish", { method: "POST", cookie: co })).status).toBe(409);
    expect((await req("/api/tournaments/t1/reopen", { method: "POST", cookie: co })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM results").get()).toEqual({ n: 0 });
  });

  it("Turnier-Admin darf jedes Turnier abschließen", async () => {
    const ta = await login("ta@x.at", "turnier_admin");
    expect((await req("/api/tournaments/t1/finish", { method: "POST", cookie: ta })).status).toBe(200);
  });
});

describe("Datenimport /einrichtung", () => {
  it("gesperrt ohne IMPORT_KEY, nur Datenanweisungen, Admin-Link am Ende", async () => {
    expect((await req("/api/setup/check", { method: "POST", body: {} })).status).toBe(404);
    env.IMPORT_KEY = "geheim";
    const call = (path: string, body: unknown, key = "geheim") => app.request(`${ORIGIN}/api${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Import-Key": key }, body: JSON.stringify(body),
    }, env);
    expect((await call("/setup/check", {}, "falsch")).status).toBe(403);
    expect((await call("/setup/import/chunk", { statements: ["DROP TABLE players;"] })).status).toBe(400);
    const ok = await call("/setup/import/chunk", { statements: [
      "INSERT OR IGNORE INTO users (id, email, role, created_at, updated_at) VALUES ('u1', 'chef@x.at', 'admin', '2026-01-01', '2026-01-01');",
      "INSERT OR REPLACE INTO seasons (id, name, start_date, end_date, is_active, created_at) VALUES ('s9', 'A' || char(10) || 'B', '2026-01-01', '2026-12-31', 0, '2026-01-01');",
    ] });
    expect(ok.status).toBe(200);
    const fin = (await (await call("/setup/import/finish", {})).json()) as { admin_links: { link: string }[] };
    expect(fin.admin_links).toHaveLength(1);
    expect(fin.admin_links[0].link).toMatch(/\/passwort\?token=/);
    expect(env.DB.raw.prepare("SELECT name FROM seasons WHERE id='s9'").get()).toEqual({ name: "A\nB" });
  });
});

describe("Mitveranstalter verwalten", () => {
  const patch = (cookie: string, emails: string[]) => req("/api/entities/Tournament/t1", { method: "PATCH", cookie, body: { co_organizer_emails: emails } });
  const list = () => JSON.parse((env.DB.raw.prepare("SELECT co_organizer_emails AS c FROM tournaments WHERE id='t1'").get() as { c: string }).c);

  it("Mitveranstalter sieht Spieler mit Konto und darf weitere hinzufügen/entfernen, aber nicht den ersten", async () => {
    const co = await login("veranstalter@x.at");
    const opt = (await (await req("/api/tournaments/t1/co-organizer-options", { cookie: co })).json()) as { players: { user_email: string }[]; protected: string[] };
    expect(opt.players.map((p) => p.user_email)).toEqual(["p1@x.at", "p2@x.at", "p3@x.at"]);
    expect(opt.protected).toEqual(["veranstalter@x.at"]);
    expect((await req("/api/tournaments/t1/co-organizer-options", { cookie: await login("fremd@x.at") })).status).toBe(403);

    expect((await patch(co, ["veranstalter@x.at", "p1@x.at", "p2@x.at"])).status).toBe(200);
    expect(list()).toEqual(["veranstalter@x.at", "p1@x.at", "p2@x.at"]);

    // weiterer Mitveranstalter entfernt einen anderen – erlaubt; den ersten – nicht
    const p1 = await login("p1@x.at");
    expect((await patch(p1, ["veranstalter@x.at", "p1@x.at"])).status).toBe(200);
    expect((await patch(p1, ["p1@x.at"])).status).toBe(403);
    expect((await patch(p1, ["p1@x.at", "Veranstalter@x.at"])).status).toBe(403); // erster muss vorne bleiben
    expect(list()).toEqual(["veranstalter@x.at", "p1@x.at"]);

    // Turnier-Admin darf alles
    expect((await patch(await login("ta@x.at", "turnier_admin"), ["p1@x.at"])).status).toBe(200);
  });

  it("Hauptveranstalter (Ersteller) in der Liste ist geschützt", async () => {
    const chef = await login("chef@x.at");
    const chefId = (env.DB.raw.prepare("SELECT id FROM users WHERE email='chef@x.at'").get() as { id: string }).id;
    env.DB.raw.prepare("UPDATE tournaments SET created_by = ?, co_organizer_emails = ? WHERE id='t1'").run(chefId, '["veranstalter@x.at","chef@x.at","p2@x.at"]');
    const co = await login("veranstalter@x.at");
    expect((await patch(co, ["veranstalter@x.at", "p2@x.at"])).status).toBe(403);
    expect((await patch(co, ["veranstalter@x.at", "chef@x.at"])).status).toBe(200);
    expect(chef).toBeTruthy();
  });
});
