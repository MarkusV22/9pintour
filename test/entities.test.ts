import { describe, expect, it, beforeEach, vi } from "vitest";
import app from "../src/worker/index";
import { createD1 } from "./d1shim";
import type { Env } from "../src/worker/env";

const ORIGIN = "http://localhost";
const NOW = "2026-11-16T00:00:00Z";
let env: Env & { DB: ReturnType<typeof createD1> };

function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGIN };
  if (init.cookie) headers.Cookie = init.cookie;
  return app.request(`${ORIGIN}${path}`, { method: init.method ?? (init.body !== undefined ? "POST" : "GET"), headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined }, env);
}
const json = async (r: Response) => (await r.json()) as any;
function insert(table: string, row: Record<string, unknown>) {
  env.DB.raw.prepare(`INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).run(...(Object.values(row) as never[]));
}
async function login(email: string, role = "user") {
  const res = await req("/api/auth/register", { body: { email, password: "geheim1234", full_name: email.split("@")[0] } });
  if (role !== "user") env.DB.raw.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, email);
  return (res.headers.get("Set-Cookie") ?? "").split(";")[0];
}

beforeEach(() => {
  env = { DB: createD1(), APP_URL: ORIGIN, EMAILS_ENABLED: "false", PASSWORD_PEPPER: "pepper", PASSWORD_ITERATIONS: "1000" };
  vi.spyOn(console, "log").mockImplementation(() => {});
  insert("players", { id: "p1", name: "Anna A", category: "Damen", phone: "0664 1", birth_date: "1990-01-01", user_email: "anna@x.at", created_at: NOW, updated_at: NOW });
  insert("players", { id: "p2", name: "Bert B", category: "Herren", created_at: NOW, updated_at: NOW });
  insert("tournaments", { id: "t1", name: "Einladung", status: "laufend", registration_type: "einladung", co_organizer_emails: '["veranst@x.at"]', created_at: NOW, updated_at: NOW });
  insert("tournaments", { id: "t2", name: "Offen", status: "geplant", registration_type: "offen", co_organizer_emails: "[]", created_at: NOW, updated_at: NOW });
  insert("schedules", { id: "frei", tournament_id: "t2", start_time: "10:00", lane: 1, created_at: NOW, updated_at: NOW });
  insert("schedules", { id: "belegt", tournament_id: "t2", start_time: "10:00", lane: 2, player_id: "p2", created_at: NOW, updated_at: NOW });
  insert("app_settings", { key: "ads_enabled", value: "true", updated_at: NOW });
  insert("action_log", { id: "a1", tournament_id: "t1", action: "score_create", created_at: NOW });
});

describe("Lesen", () => {
  it("anonym: keine privaten Spielerdaten, keine Mitveranstalter, keine Protokolle", async () => {
    const players = await json(await req("/api/entities/Player?sort=name"));
    expect(players.map((p: any) => p.name)).toEqual(["Anna A", "Bert B"]);
    expect(players[0].phone).toBeUndefined();
    expect(players[0].user_email).toBeUndefined();
    expect((await json(await req("/api/entities/Tournament/t1"))).co_organizer_emails).toBeUndefined();
    expect((await req("/api/entities/ActionLog")).status).toBe(401);
    expect(await json(await req(`/api/entities/Player?q=${encodeURIComponent('{"user_email":"anna@x.at"}')}`))).toEqual([]);
  });

  it("eigener Spieler mit allen Feldern, Turnier-Admin sieht alles", async () => {
    const anna = await login("anna@x.at");
    const own = await json(await req(`/api/entities/Player?q=${encodeURIComponent('{"user_email":"anna@x.at"}')}`, { cookie: anna }));
    expect(own[0].phone).toBe("0664 1");
    const ta = await login("ta@x.at", "turnier_admin");
    expect((await json(await req("/api/entities/Player/p1", { cookie: ta }))).birth_date).toBe("1990-01-01");
    expect(await json(await req("/api/entities/ActionLog", { cookie: ta }))).toHaveLength(1);
    expect((await req("/api/entities/ActionLog", { cookie: anna })).status).toBe(403);
  });

  it("Base44-Format: created_date, Booleans, Arrays, AppSetting-id = key", async () => {
    const u = await login("veranst@x.at");
    const t = await json(await req("/api/entities/Tournament/t1", { cookie: u }));
    expect(t.co_organizer_emails).toEqual(["veranst@x.at"]);
    expect(t.created_date).toBe(NOW);
    expect(typeof t.payment_enabled).toBe("boolean");
    expect(await json(await req(`/api/entities/AppSetting?q=${encodeURIComponent('{"key":"ads_enabled"}')}`))).toMatchObject([{ id: "ads_enabled", value: "true" }]);
  });
});

describe("Schreiben", () => {
  it("Ergebnisse nur durch Veranstalter; Action-Log mit echtem Absender", async () => {
    const fremd = await login("fremd@x.at");
    const score = { tournament_id: "t1", player_id: "p2", score: 450, notes: null };
    expect((await req("/api/entities/TournamentScore", { body: score, cookie: fremd })).status).toBe(403);
    expect((await req("/api/entities/TournamentScore", { body: score })).status).toBe(401);
    const v = await login("veranst@x.at");
    const created = await json(await req("/api/entities/TournamentScore", { body: { ...score, group: "A" }, cookie: v }));
    expect(created).toMatchObject({ score: 450, group: "A", tournament_id: "t1" });
    // Turnier wechseln geht nicht
    expect((await req(`/api/entities/TournamentScore/${created.id}`, { method: "PATCH", body: { tournament_id: "t2" }, cookie: v })).status).toBe(403);
    const log = await json(await req("/api/entities/ActionLog", { body: { tournament_id: "t1", action: "score_create", actor_email: "gefaelscht@x.at" }, cookie: v }));
    expect(log.actor_email).toBe("veranst@x.at");
    expect((await json(await req("/api/entities/TournamentScore/delete-many", { body: { tournament_id: "t1" }, cookie: v }))).deleted).toBe(1);
  });

  it("Einstellungen nur Admin", async () => {
    const u = await login("u@x.at");
    expect((await req("/api/entities/AppSetting/ads_enabled", { method: "PATCH", body: { value: "false" }, cookie: u })).status).toBe(403);
    const a = await login("admin@x.at", "admin");
    expect(await json(await req("/api/entities/AppSetting/ads_enabled", { method: "PATCH", body: { value: "false" }, cookie: a }))).toMatchObject({ id: "ads_enabled", value: "false" });
    expect((await req("/api/entities/AppSetting", { body: { key: "discord_url", value: "x" }, cookie: a })).status).toBe(201);
  });

  it("offene Anmeldung: freie Startplätze buchen, belegte nicht; Einladungsturnier gesperrt", async () => {
    const u = await login("spieler@x.at");
    const team = await json(await req("/api/entities/Team", { body: { tournament_id: "t2", name: "Neu", category: "Herren", player1_id: "p2" }, cookie: u }));
    expect(team.name).toBe("Neu");
    expect((await req("/api/entities/Team", { body: { tournament_id: "t1", name: "X" }, cookie: u })).status).toBe(403);
    expect((await req("/api/entities/TournamentSchedule/frei", { method: "PATCH", body: { team_id: team.id, lane: 9 }, cookie: u })).status).toBe(200);
    const slot = await json(await req("/api/entities/TournamentSchedule/frei"));
    expect(slot).toMatchObject({ team_id: team.id, lane: 1 }); // Bahn bleibt
    expect((await req("/api/entities/TournamentSchedule/belegt", { method: "PATCH", body: { team_id: team.id }, cookie: u })).status).toBe(403);
    expect((await req("/api/entities/TournamentSchedule/frei", { method: "DELETE", cookie: u })).status).toBe(403);
  });

  it("Spieler: eigenes Profil verknüpfen/ändern, fremde nicht; Änderungsprotokoll", async () => {
    const u = await login("bert@x.at");
    expect((await req("/api/entities/Player/p1", { method: "PATCH", body: { name: "Hack" }, cookie: u })).status).toBe(403);
    expect((await req("/api/entities/Player/p2", { method: "PATCH", body: { user_email: "bert@x.at" }, cookie: u })).status).toBe(200);
    expect((await req("/api/entities/Player/p2", { method: "PATCH", body: { name: "Bert Neu" }, cookie: u })).status).toBe(200);
    expect((await req("/api/entities/Player", { body: { name: "Fremd", category: "Herren", user_email: "anna@x.at" }, cookie: u })).status).toBe(403);
    expect((await req("/api/entities/Player/p2", { method: "DELETE", cookie: u })).status).toBe(403);
    const ta = await login("ta@x.at", "turnier_admin");
    const log = await json(await req("/api/entities/PlayerActionLog?sort=-created_date", { cookie: ta }));
    expect(log.map((l: any) => JSON.parse(l.changed_fields))).toEqual(expect.arrayContaining([["user_email"], ["name"]]));
  });

  it("Turnieranfrage ohne Login möglich, Status vom Server", async () => {
    const r = await json(await req("/api/entities/TournamentRequest", { body: { tournament_name: "Mein Turnier", status: "genehmigt", assigned_tier: "Grand Slam" } }));
    expect(r).toMatchObject({ status: "offen" });
    expect(r.assigned_tier ?? null).toBeNull();
  });
});

describe("Funktionen", () => {
  it("Spieler zusammenführen nur Turnier-Admin, Verweise werden umgehängt", async () => {
    insert("teams", { id: "T", tournament_id: "t1", name: "T", player1_id: "p2", created_at: NOW, updated_at: NOW });
    insert("players", { id: "p3", name: "Bert B", category: "Herren", phone: "0660", created_at: NOW, updated_at: NOW });
    const u = await login("u@x.at");
    expect((await req("/api/functions/mergePlayers", { body: { keepId: "p3", removeId: "p2" }, cookie: u })).status).toBe(403);
    const ta = await login("ta@x.at", "turnier_admin");
    expect(await json(await req("/api/functions/mergePlayers", { body: { keepId: "p3", removeId: "p2" }, cookie: ta }))).toMatchObject({ success: true, wasRepair: false });
    expect(env.DB.raw.prepare("SELECT player1_id FROM teams").get()).toEqual({ player1_id: "p3" });
    expect(env.DB.raw.prepare("SELECT player_id FROM schedules WHERE id='belegt'").get()).toEqual({ player_id: "p3" });
    expect(env.DB.raw.prepare("SELECT COUNT(*) n FROM players WHERE id='p2'").get()).toEqual({ n: 0 });
  });

  it("Newsletter an- und abmelden", async () => {
    expect(await json(await req("/api/functions/subscribeNewsletter", { body: { email: "Neu@X.at" } }))).toMatchObject({ success: true });
    const u = await login("neu@x.at");
    expect(await json(await req("/api/functions/getNewsletterStatus", { body: {}, cookie: u }))).toEqual({ subscribed: true, is_active: true });
    await req("/api/functions/unsubscribeNewsletter", { body: { email: "andere@x.at" }, cookie: u }); // fremde Adresse wird ignoriert
    expect(await json(await req("/api/functions/getNewsletterStatus", { body: {}, cookie: u }))).toEqual({ subscribed: true, is_active: false });
  });
});
