import { describe, expect, it } from "vitest";
import { getPoints, getFuturePoints } from "../src/rules/points";
import { isEmptyScore, lanes } from "../src/rules/scoreNotes";
import { generateResultRecords, type PlayerInfo } from "../src/rules/results";
import { standardRanking, futureRanking, finishedInSeason } from "../src/rules/ranking";
import { isTournamentOrganizer } from "../src/rules/roles";
import type { ScoreRow } from "../src/rules/scoreNotes";

const gesamt = (voll: number, abr: number, fehl = 0) => JSON.stringify({ gesamt: true, voll: String(voll), abraeumen: String(abr), fehlwurf: String(fehl) });
const players = (list: [string, string, string?, boolean?][]) =>
  new Map<string, PlayerInfo>(list.map(([id, category, age_class, hobby]) => [id, { id, category, age_class: age_class ?? "Allgemeine Klasse", is_hobby: !!hobby }]));

describe("Tour-Punkte", () => {
  it("Platzierungsgruppen je Kategorie", () => {
    expect(getPoints("Grand Slam", 1)).toBe(2000);
    expect(getPoints("Grand Slam", 5)).toBe(480);
    expect(getPoints("Masters 1000", 10)).toBe(100);
    expect(getPoints("Masters 250", 61)).toBe(0);
    expect(getPoints("Challenger", 70)).toBe(0);
    expect(getPoints("Grand Slam", 70)).toBe(1);
    expect(getPoints("Grand Slam", 71)).toBe(0);
    expect(getPoints("Competition", 1)).toBe(0);
    expect(getPoints("unbekannt", 1)).toBe(250); // Fallback Masters 250
  });
  it("9PinFuture: 2 Antrittspunkte + Teilnehmer − Platz + 1", () => {
    expect(getFuturePoints(1, 5)).toBe(7);
    expect(getFuturePoints(5, 5)).toBe(3);
    expect(getFuturePoints(6, 5)).toBe(0);
  });
});

describe("Score-Notizen", () => {
  it("summiert Bahnen und erkennt leere Datensätze", () => {
    expect(lanes(JSON.stringify([{ voll: "100", abraeumen: "40", fehlwurf: "1" }, { voll: "90", abraeumen: "50" }]))).toEqual({ voll: 190, abraeumen: 90, fehlwurf: 1 });
    expect(isEmptyScore({ score: 0, notes: JSON.stringify([{ voll: "", abraeumen: "" }]) })).toBe(true);
    expect(isEmptyScore({ score: 0, notes: '{"wo":true}' })).toBe(false);
    expect(isEmptyScore({ score: 0, notes: null })).toBe(true);
    expect(isEmptyScore({ score: 431, notes: null })).toBe(false);
  });
});

describe("Turnierwertung", () => {
  const P = players([["a", "Herren"], ["b", "Herren"], ["c", "Herren"], ["d", "Damen"], ["h", "Herren", undefined, true], ["x", "Herren"]]);
  const sc = (player_id: string, score: number, notes = gesamt(score - 100, 100)): ScoreRow => ({ player_id, score, notes, tournament_id: "t" });

  it("bestes Ergebnis je Spieler, Gleichstand → Abräumen, dann Fehlwürfe; getrennt nach Kategorie", () => {
    const r = generateResultRecords({
      tournamentId: "t", tier: "Masters 500", players: P,
      scores: [sc("a", 400), sc("a", 450), sc("b", 450, gesamt(300, 150)), sc("c", 450, gesamt(300, 150, 2)), sc("d", 380)],
    });
    expect(r.filter((x) => x.notes === "Herren").map((x) => [x.player_id, x.position, x.points])).toEqual([["b", 1, 500], ["c", 2, 300], ["a", 3, 180]]);
    expect(r.find((x) => x.player_id === "d")).toMatchObject({ notes: "Damen", position: 1, points: 500 });
  });

  it("Hobbyspieler bekommen Tour-Punkte; No-Show und leere Datensätze zählen nicht", () => {
    const r = generateResultRecords({
      tournamentId: "t", tier: "Masters 250", players: P,
      scores: [sc("h", 500), sc("a", 400), { player_id: "b", score: 0, notes: '{"no_show":true}' }, { player_id: "c", score: 0, notes: "[]" }],
    });
    expect(r.map((x) => [x.player_id, x.position, x.points])).toEqual([["h", 1, 250], ["a", 2, 150]]);
  });

  it("nur Spieler im Startplan zählen", () => {
    const r = generateResultRecords({
      tournamentId: "t", tier: "Masters 250", players: P,
      scores: [sc("a", 400), sc("x", 500)],
      teams: [{ id: "T1", player_ids: ["a", null] }], schedules: [{ player_id: "x", is_placeholder: true }],
    });
    expect(r.map((x) => x.player_id)).toEqual(["a"]);
  });

  it("Finalturnier: nur Gruppenphase A/B", () => {
    const r = generateResultRecords({
      tournamentId: "t", tier: "Finalturnier", players: P, isFinal: true,
      scores: [{ ...sc("a", 400), grp: "A" }, { ...sc("b", 600), grp: "KO-FINAL-H" }],
    });
    expect(r.map((x) => [x.player_id, x.points])).toEqual([["a", 0]]);
  });

  it("9PinFuture: je Altersklasse+Geschlecht, W.O. nur Antrittspunkte", () => {
    const FP = players([["k1", "Herren", "U-15"], ["k2", "Herren", "U-15"], ["k3", "Herren", "U-15"], ["k4", "Damen", "U-15"]]);
    const r = generateResultRecords({
      tournamentId: "t", tier: "Masters 250", players: FP, seriesType: "future",
      scores: [sc("k1", 300), sc("k2", 250), { player_id: "k3", score: 0, notes: '{"wo":true}' }, sc("k4", 200)],
    });
    expect(r.map((x) => [x.player_id, x.notes, x.position, x.points])).toEqual([
      ["k1", "U-15", 1, 4], ["k2", "U-15", 2, 3], ["k3", "U-15", 3, 2], ["k4", "U-15", 1, 3],
    ]);
  });
});

describe("Ranglisten", () => {
  const T = [
    { id: "t1", date: "2026-05-01", status: "abgeschlossen", series_type: "standard" },
    { id: "t2", date: "2026-06-01", status: "abgeschlossen", series_type: "standard" },
    { id: "t3", date: "2025-06-01", status: "abgeschlossen", series_type: "standard" },  // andere Saison
    { id: "t4", date: "2026-07-01", status: "laufend", series_type: "standard" },
    { id: "t5", date: "2026-07-01", status: "abgeschlossen", series_type: "standard", deleted_at: "x" },
  ];
  const R = [
    { tournament_id: "t1", player_id: "a", position: 1, points: 250, notes: "Herren" },
    { tournament_id: "t1", player_id: "b", position: 2, points: 150, notes: "Herren" },
    { tournament_id: "t2", player_id: "b", position: 2, points: 100, notes: "Herren" },
    { tournament_id: "t2", player_id: "c", position: 1, points: 250, notes: "Herren" },
    { tournament_id: "t3", player_id: "c", position: 1, points: 999, notes: "Herren" },
    { tournament_id: "t4", player_id: "c", position: 1, points: 999, notes: "Herren" },
    { tournament_id: "t5", player_id: "c", position: 1, points: 999, notes: "Herren" },
  ];
  it("summiert Punkte der Saison, Gleichstand → mehr Turniere vorne, gleicher Rang", () => {
    const fin = finishedInSeason(T, R, { start_date: "2026-01-01", end_date: "2027-04-30" }, "standard");
    expect(fin.map((t) => t.id)).toEqual(["t1", "t2"]);
    const rows = standardRanking("Herren", fin, R, []);
    expect(rows.map((r) => [r.player_id, r.points, r.tournaments, r.rank])).toEqual([["b", 250, 2, 1], ["a", 250, 1, 1], ["c", 250, 1, 1]]);
  });

  it("9PinFuture: Schnitt-Bonus ab 3 Teilnahmen", () => {
    const FP = players([["k1", "Herren", "U-15"], ["k2", "Herren", "U-15"]]);
    const FT = ["f1", "f2", "f3"].map((id) => ({ id, date: "2026-10-01", status: "abgeschlossen", series_type: "future" }));
    const res = FT.flatMap((t) => [
      { tournament_id: t.id, player_id: "k1", position: 1, points: 4, notes: "U-15" },
      { tournament_id: t.id, player_id: "k2", position: 2, points: 3, notes: "U-15" },
    ]);
    const scores = FT.flatMap((t) => [
      { tournament_id: t.id, player_id: "k1", score: 300, notes: null },
      { tournament_id: t.id, player_id: "k2", score: 250, notes: null },
    ]);
    const rows = futureRanking("U-15", "Herren", FT, res, scores, FP, new Map());
    expect(rows.map((r) => [r.player_id, r.base_points, r.bonus_points, r.points, r.schnitt])).toEqual([["k1", 12, 4, 16, 300], ["k2", 9, 3, 12, 250]]);
  });
});

describe("Berechtigungen", () => {
  const t = { created_by: "b44-1", co_organizer_emails: '["Co@Example.at"]' };
  it("Admin, Ersteller, Mitveranstalter", () => {
    expect(isTournamentOrganizer({ id: "x", email: "a@b.at", role: "turnier_admin" }, t)).toBe(true);
    expect(isTournamentOrganizer({ id: "x", email: "a@b.at", role: "user", base44_id: "b44-1" }, t)).toBe(true);
    expect(isTournamentOrganizer({ id: "x", email: "co@example.at", role: "user" }, t)).toBe(true);
    expect(isTournamentOrganizer({ id: "x", email: "a@b.at", role: "user" }, t)).toBe(false);
  });
});
