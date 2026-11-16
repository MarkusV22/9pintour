// Liest den Base44-CSV-Export (ein Ordner, Dateiname = Entity-Name, z. B. Player.csv) und wandelt ihn
// in Zeilen für das neue Schema um. Wird von import-base44.ts, reconcile.ts und den Tests genutzt.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

export type Row = Record<string, string | number | null>;
export type Tables = Record<string, Row[]>;

const ENTITIES = [
  "User", "AppSetting", "Season", "Player", "PlayerChangeRequest", "PlayerMerge", "PlayerActionLog",
  "Tournament", "Team", "TournamentSchedule", "TournamentScore", "TournamentResult",
  "TournamentRequest", "ActionLog", "NewsletterSubscriber",
] as const;

export function readCsv(dir: string, entity: string): Record<string, string>[] {
  const f = join(dir, `${entity}.csv`);
  if (!existsSync(f)) return [];
  return parse(readFileSync(f, "utf8"), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true });
}

const str = (v: string | undefined) => (v === undefined || v === "" ? null : v);
const bool = (v: string | undefined) => (v === "true" ? 1 : 0);
const int = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
/** Base44: "2026-10-18T07:01:18.259000" (UTC ohne Zone) → ISO mit Z */
export const ts = (v: string | undefined) => {
  if (!v) return null;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(v)) return new Date(v).toISOString();
  return new Date(v.slice(0, 23) + "Z").toISOString();
};
/** JSON-Text normalisieren ('' → Standardwert) */
const json = (v: string | undefined, fallback: string | null = null) => {
  if (v === undefined || v === "") return fallback;
  try { return JSON.stringify(JSON.parse(v)); } catch { return v; }
};
/** Stabile Benutzer-ID aus der E-Mail (Re-Import erzeugt dieselben IDs) */
export const userIdFor = (email: string) => "u" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 23);

/** Korrekturen am Altbestand (siehe docs/UEBERGABE.md) */
const SEASON_NAME_FIX: Record<string, string> = { "2024/025": "2024/2025" };

export interface Mapped { tables: Tables; warnings: string[] }

export function loadBase44(dir: string): Mapped {
  const raw = Object.fromEntries(ENTITIES.map((e) => [e, readCsv(dir, e)])) as Record<(typeof ENTITIES)[number], Record<string, string>[]>;
  const warnings: string[] = [];
  const t: Tables = {};

  // Base44-Benutzer-ID ↔ E-Mail aus den Protokollen ableiten (User-Export enthält keine IDs)
  const base44IdByEmail = new Map<string, string>();
  for (const r of [...raw.ActionLog, ...raw.PlayerActionLog]) {
    if (r.actor_id && r.actor_email && !r.actor_id.startsWith("service_")) base44IdByEmail.set(r.actor_email.toLowerCase(), r.actor_id);
  }

  t.users = raw.User.map((r) => {
    const email = r.email.trim().toLowerCase();
    const premium = r.premium_type === "yearly" || r.premium_type === "lifetime" ? r.premium_type : null;
    return {
      id: userIdFor(email), email, role: ["admin", "turnier_admin"].includes(r.role) ? r.role : "user",
      full_name: str(r.full_name), password_hash: null, google_sub: null, email_verified: 0,
      premium_type: premium, premium_expires_at: str(r.premium_expires_at), base44_id: base44IdByEmail.get(email) ?? null,
      created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
    };
  });

  // Einstellungen: doppelte Schlüssel → jüngster Eintrag gewinnt
  const settings = new Map<string, Record<string, string>>();
  for (const r of raw.AppSetting) {
    const prev = settings.get(r.key);
    if (!prev || (r.updated_date ?? "") > (prev.updated_date ?? "")) settings.set(r.key, r);
  }
  t.app_settings = [...settings.values()].map((r) => ({ key: r.key, value: r.value ?? "", updated_at: ts(r.updated_date) ?? ts(r.created_date) }));

  t.seasons = raw.Season.map((r) => ({
    id: r.id, name: SEASON_NAME_FIX[r.name] ?? r.name, start_date: r.start_date, end_date: r.end_date,
    is_active: bool(r.is_active), created_at: ts(r.created_date),
  }));

  t.players = raw.Player.map((r) => ({
    id: r.id, first_name: str(r.first_name), last_name: str(r.last_name), name: r.name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    number: int(r.number), photo_url: str(r.photo_url), category: r.category === "Damen" ? "Damen" : "Herren",
    age_class: str(r.age_class), birth_date: str(r.birth_date), club: str(r.club), phone: str(r.phone),
    whatsapp: bool(r.whatsapp), personal_best: int(r.personal_best), walk_on_song: str(r.walk_on_song),
    is_hobby: bool(r.is_hobby), user_email: str(r.user_email?.trim().toLowerCase()), privacy_accepted: bool(r.privacy_accepted),
    privacy_accepted_at: str(r.privacy_accepted_at), created_by: str(r.created_by_id),
    created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));

  t.player_change_requests = raw.PlayerChangeRequest.map((r) => ({
    id: r.id, player_id: str(r.player_id), player_name: str(r.player_name), current_number: str(r.current_number),
    requested_first_name: str(r.requested_first_name), requested_last_name: str(r.requested_last_name), requested_number: str(r.requested_number),
    reason: str(r.reason), requested_by_email: str(r.requested_by_email), requested_by_name: str(r.requested_by_name),
    status: r.status || "offen", admin_note: str(r.admin_note), reviewed_by_email: str(r.reviewed_by_email),
    created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));

  t.player_merges = raw.PlayerMerge.map((r) => ({
    id: r.id, keep_player_id: str(r.keep_player_id), keep_player_name: str(r.keep_player_name), keep_player_number: str(r.keep_player_number),
    remove_player_id: str(r.remove_player_id), remove_player_name: str(r.remove_player_name), remove_player_number: str(r.remove_player_number),
    is_repair: bool(r.is_repair), performed_by: str(r.performed_by), created_at: ts(r.created_date),
  }));

  t.player_action_log = raw.PlayerActionLog.map((r) => ({
    id: r.id, player_id: str(r.player_id), player_name: str(r.player_name), action: r.action || "update",
    changed_fields: json(r.changed_fields), old_values: json(r.old_values), new_values: json(r.new_values),
    actor_id: str(r.actor_id), actor_email: str(r.actor_email), actor_name: str(r.actor_name), created_at: ts(r.created_date),
  }));

  t.tournaments = raw.Tournament.map((r) => ({
    id: r.id, name: r.name.trim(), date: str(r.date), end_date: str(r.end_date), location: str(r.location?.trim()),
    status: ["geplant", "laufend", "abgeschlossen"].includes(r.status) ? r.status : "geplant",
    tier: str(r.tier), series_type: r.series_type === "future" ? "future" : "standard", category: str(r.category),
    allowed_categories: json(r.allowed_categories), mixed_combinations: json(r.mixed_combinations),
    team_size: int(r.team_size), lane_count: int(r.lane_count), slot_duration: int(r.slot_duration),
    logo_url: str(r.logo_url), livestream_url: str(r.livestream_url), day_configs: json(r.day_configs), description: str(r.description),
    co_organizer_emails: json(r.co_organizer_emails, "[]"), season_id: str(r.season_id),
    mode: r.mode === "final" ? "final" : "normal", final_groups: json(r.final_groups),
    registration_type: r.registration_type === "offen" ? "offen" : "einladung", venues: json(r.venues),
    payment_enabled: bool(r.payment_enabled), payment_amount: int(r.payment_amount), payment_amount_einzelstarter: int(r.payment_amount_einzelstarter),
    payment_currency: r.payment_currency || "eur", einzelstarter_paid_ids: json(r.einzelstarter_paid_ids, "[]"),
    einzelstarter_online_paid_ids: json(r.einzelstarter_online_paid_ids, "[]"), tour_fee_remitted_cents: int(r.tour_fee_remitted_cents) ?? 0,
    deleted_at: str(r.deleted_at), created_by: str(r.created_by_id),
    created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));
  const tournamentIds = new Set(t.tournaments.map((x) => x.id as string));
  const known = (entity: string, r: Record<string, string>) => {
    if (tournamentIds.has(r.tournament_id)) return true;
    warnings.push(`${entity} ${r.id}: Turnier ${r.tournament_id || "(leer)"} existiert nicht – übersprungen`);
    return false;
  };

  t.teams = raw.Team.filter((r) => known("Team", r)).map((r) => ({
    id: r.id, tournament_id: r.tournament_id, name: r.name, category: str(r.category),
    player1_id: str(r.player1_id), player2_id: str(r.player2_id), player3_id: str(r.player3_id),
    player4_id: str(r.player4_id), player5_id: str(r.player5_id), player6_id: str(r.player6_id),
    delete_requested: bool(r.delete_requested),
    payment_status: ["free", "pending", "paid", "cash"].includes(r.payment_status) ? r.payment_status : null,
    paid_player_ids: json(r.paid_player_ids, "[]"), online_paid_player_ids: json(r.online_paid_player_ids, "[]"),
    created_by: str(r.created_by_id), created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));

  t.schedules = raw.TournamentSchedule.filter((r) => known("TournamentSchedule", r)).map((r) => ({
    id: r.id, tournament_id: r.tournament_id, team_id: str(r.team_id), player_id: str(r.player_id),
    is_placeholder: bool(r.is_placeholder), placeholder_label: str(r.placeholder_label), start_time: str(r.start_time),
    lane: int(r.lane), day: str(r.day), venue: str(r.venue),
    created_by: str(r.created_by_id), created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));

  t.scores = raw.TournamentScore.filter((r) => known("TournamentScore", r)).map((r) => ({
    id: r.id, tournament_id: r.tournament_id, team_id: str(r.team_id), schedule_id: str(r.schedule_id), player_id: str(r.player_id),
    score: int(r.score), notes: str(r.notes), category: str(r.category), grp: str(r.group),
    created_by: str(r.created_by_id), created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));

  t.results = raw.TournamentResult.filter((r) => known("TournamentResult", r)).map((r) => ({
    id: r.id, tournament_id: r.tournament_id, player_id: str(r.player_id), player_name: str(r.player_name),
    position: int(r.position) ?? 0, points: int(r.points) ?? 0, notes: str(r.notes), created_at: ts(r.created_date),
  }));

  t.tournament_requests = raw.TournamentRequest.map((r) => ({
    id: r.id, tournament_name: r.tournament_name.trim(), tournament_date: str(r.tournament_date), tournament_end_date: str(r.tournament_end_date),
    day_count: int(r.day_count), location: str(r.location?.trim()), organizer_name: str(r.organizer_name?.trim()),
    organizer_email: str(r.organizer_email), organizer_phone: str(r.organizer_phone?.replace(/^'/, "")), co_organizer_email: str(r.co_organizer_email),
    team_size: int(r.team_size), lane_count: int(r.lane_count), slot_duration: int(r.slot_duration), expected_teams: int(r.expected_teams),
    categories: str(r.categories), description: str(r.description), assigned_tier: str(r.assigned_tier), status: r.status || "offen",
    admin_notes: str(r.admin_notes), created_by: str(r.created_by_id), created_at: ts(r.created_date), updated_at: ts(r.updated_date) ?? ts(r.created_date),
  }));

  t.action_log = raw.ActionLog.map((r) => ({
    id: r.id, tournament_id: str(r.tournament_id), tournament_name: str(r.tournament_name?.trim()), player_id: str(r.player_id),
    player_name: str(r.player_name), team_id: str(r.team_id), team_name: str(r.team_name), action: r.action, field: str(r.field),
    old_value: str(r.old_value), new_value: str(r.new_value), actor_id: str(r.actor_id), actor_email: str(r.actor_email),
    actor_name: str(r.actor_name), created_at: ts(r.created_date),
  }));

  const seenMail = new Set<string>();
  t.newsletter_subscribers = raw.NewsletterSubscriber.filter((r) => {
    const e = r.email.trim().toLowerCase();
    if (seenMail.has(e)) { warnings.push(`Newsletter: doppelte Adresse übersprungen`); return false; }
    seenMail.add(e); return true;
  }).map((r) => ({
    id: r.id, email: r.email.trim().toLowerCase(), name: str(r.name), source: str(r.source), is_active: r.is_active === "false" ? 0 : 1, created_at: ts(r.created_date),
  }));

  for (const e of ENTITIES) if (!raw[e].length) warnings.push(`${e}.csv fehlt oder ist leer`);
  return { tables: t, warnings };
}

/** Reihenfolge fürs Einfügen (Fremdschlüssel) */
export const TABLE_ORDER = [
  "users", "app_settings", "seasons", "players", "player_change_requests", "player_merges", "player_action_log",
  "tournaments", "teams", "schedules", "scores", "results", "tournament_requests", "action_log", "newsletter_subscribers",
];
