-- 9pintour.at – Grundschema (Neubau nach Base44). IDs aus Base44 werden übernommen.
-- JSON-Felder sind TEXT (z. B. day_configs, venues, co_organizer_emails, notes).

-- ---------------------------------------------------------------- Konten
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','turnier_admin','admin')),
  full_name           TEXT,
  password_hash       TEXT,                              -- NULL = noch kein Passwort gesetzt
  google_sub          TEXT UNIQUE,
  email_verified      INTEGER NOT NULL DEFAULT 0,
  premium_type        TEXT CHECK (premium_type IN ('yearly','lifetime')),  -- Werbefrei-Abo
  premium_expires_at  TEXT,
  base44_id           TEXT UNIQUE,                       -- alte Base44-Benutzer-ID (falls bekannt)
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                          -- SHA-256 des Session-Tokens
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (                               -- Passwort setzen/zurücksetzen
  id          TEXT PRIMARY KEY,                          -- SHA-256 des Tokens
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('set_password','reset_password')),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL,                             -- 'email:<adresse>' oder 'ip:<adresse>'
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_key ON login_attempts(key, created_at);

CREATE TABLE oauth_states (
  id          TEXT PRIMARY KEY,
  redirect_to TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE audit_log (                                 -- Admin-/Konto-Aktionen
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------- Einstellungen & Saisonen
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE seasons (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------- Spieler
CREATE TABLE players (
  id                   TEXT PRIMARY KEY,
  first_name           TEXT,
  last_name            TEXT,
  name                 TEXT NOT NULL,
  number               INTEGER,
  photo_url            TEXT,
  category             TEXT NOT NULL DEFAULT 'Herren' CHECK (category IN ('Herren','Damen')),
  age_class            TEXT,                             -- U-10 … Ü-60, 'Allgemeine Klasse'
  birth_date           TEXT,
  club                 TEXT,
  phone                TEXT,
  whatsapp             INTEGER NOT NULL DEFAULT 0,
  personal_best        INTEGER,
  walk_on_song         TEXT,
  is_hobby             INTEGER NOT NULL DEFAULT 0,       -- Lochkegel: Tour-Punkte + eigene Hobby-Wertung im Turnier
  user_email           TEXT COLLATE NOCASE,              -- verknüpftes Konto
  privacy_accepted     INTEGER NOT NULL DEFAULT 0,
  privacy_accepted_at  TEXT,
  created_by           TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX idx_players_name ON players(name);
CREATE INDEX idx_players_user ON players(user_email);
CREATE INDEX idx_players_number ON players(number);

CREATE TABLE player_change_requests (
  id                    TEXT PRIMARY KEY,
  player_id             TEXT,
  player_name           TEXT,
  current_number        TEXT,
  requested_first_name  TEXT,
  requested_last_name   TEXT,
  requested_number      TEXT,
  reason                TEXT,
  requested_by_email    TEXT,
  requested_by_name     TEXT,
  status                TEXT NOT NULL DEFAULT 'offen',
  admin_note            TEXT,
  reviewed_by_email     TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE player_merges (
  id                    TEXT PRIMARY KEY,
  keep_player_id        TEXT,
  keep_player_name      TEXT,
  keep_player_number    TEXT,
  remove_player_id      TEXT,
  remove_player_name    TEXT,
  remove_player_number  TEXT,
  is_repair             INTEGER NOT NULL DEFAULT 0,
  performed_by          TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE player_action_log (
  id              TEXT PRIMARY KEY,
  player_id       TEXT,
  player_name     TEXT,
  action          TEXT NOT NULL,
  changed_fields  TEXT,                                  -- JSON-Array
  old_values      TEXT,                                  -- JSON
  new_values      TEXT,                                  -- JSON
  actor_id        TEXT,
  actor_email     TEXT,
  actor_name      TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_player_action_log_player ON player_action_log(player_id);

-- ---------------------------------------------------------------- Turniere
CREATE TABLE tournaments (
  id                             TEXT PRIMARY KEY,
  name                           TEXT NOT NULL,
  date                           TEXT,
  end_date                       TEXT,
  location                       TEXT,
  status                         TEXT NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant','laufend','abgeschlossen')),
  tier                           TEXT,
  series_type                    TEXT NOT NULL DEFAULT 'standard' CHECK (series_type IN ('standard','future')),
  category                       TEXT,
  allowed_categories             TEXT,                   -- JSON
  mixed_combinations             TEXT,                   -- JSON
  team_size                      INTEGER,
  lane_count                     INTEGER,
  slot_duration                  INTEGER,
  logo_url                       TEXT,
  livestream_url                 TEXT,
  day_configs                    TEXT,                   -- JSON
  description                    TEXT,
  co_organizer_emails            TEXT NOT NULL DEFAULT '[]', -- JSON-Array
  season_id                      TEXT,
  mode                           TEXT NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','final')),
  final_groups                   TEXT,                   -- JSON
  registration_type              TEXT NOT NULL DEFAULT 'einladung' CHECK (registration_type IN ('offen','einladung')),
  venues                         TEXT,                   -- JSON
  payment_enabled                INTEGER NOT NULL DEFAULT 0,
  payment_amount                 INTEGER,                -- Cent je Mannschaft
  payment_amount_einzelstarter   INTEGER,                -- Cent je Einzelstarter
  payment_currency               TEXT NOT NULL DEFAULT 'eur',
  einzelstarter_paid_ids         TEXT NOT NULL DEFAULT '[]',
  einzelstarter_online_paid_ids  TEXT NOT NULL DEFAULT '[]',
  tour_fee_remitted_cents        INTEGER NOT NULL DEFAULT 0,
  deleted_at                     TEXT,                   -- Soft-Delete
  created_by                     TEXT,                   -- Base44-Benutzer-ID des Erstellers
  created_at                     TEXT NOT NULL,
  updated_at                     TEXT NOT NULL
);
CREATE INDEX idx_tournaments_date ON tournaments(date);

CREATE TABLE teams (
  id                      TEXT PRIMARY KEY,
  tournament_id           TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  category                TEXT,
  player1_id              TEXT,
  player2_id              TEXT,
  player3_id              TEXT,
  player4_id              TEXT,
  player5_id              TEXT,
  player6_id              TEXT,
  delete_requested        INTEGER NOT NULL DEFAULT 0,
  payment_status          TEXT CHECK (payment_status IN ('free','pending','paid','cash')),
  paid_player_ids         TEXT NOT NULL DEFAULT '[]',
  online_paid_player_ids  TEXT NOT NULL DEFAULT '[]',
  created_by              TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX idx_teams_tournament ON teams(tournament_id);

CREATE TABLE schedules (                                 -- Startplan
  id                 TEXT PRIMARY KEY,
  tournament_id      TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id            TEXT,
  player_id          TEXT,
  is_placeholder     INTEGER NOT NULL DEFAULT 0,
  placeholder_label  TEXT,
  start_time         TEXT,                               -- HH:MM
  lane               INTEGER,
  day                TEXT,                               -- Tag-Name aus day_configs (z. B. "Tag 1") bzw. Datum
  venue              TEXT,                               -- Spielort-Index bei Multi-Spielort-Turnieren
  created_by         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_schedules_tournament ON schedules(tournament_id);

CREATE TABLE scores (
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id        TEXT,
  schedule_id    TEXT,
  player_id      TEXT,
  score          INTEGER,
  notes          TEXT,                                   -- JSON: Bahndaten / {wo:true} / {no_show:true}
  category       TEXT,
  grp            TEXT,                                   -- Finalturnier: "A", "B", "KO-…"
  created_by     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_scores_tournament ON scores(tournament_id);
CREATE INDEX idx_scores_player ON scores(player_id);

CREATE TABLE results (                                   -- vergebene Platzierungen + Tour-Punkte
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id      TEXT,
  player_name    TEXT,                                   -- Altbestand ohne Spieler-ID
  position       INTEGER NOT NULL,
  points         INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,                                   -- Wertungsgruppe: Herren/Damen bzw. Altersklasse (Future)
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_results_tournament ON results(tournament_id);
CREATE INDEX idx_results_player ON results(player_id);

CREATE TABLE tournament_requests (                       -- Turnieranfragen von Veranstaltern
  id                  TEXT PRIMARY KEY,
  tournament_name     TEXT NOT NULL,
  tournament_date     TEXT,
  tournament_end_date TEXT,
  day_count           INTEGER,
  location            TEXT,
  organizer_name      TEXT,
  organizer_email     TEXT,
  organizer_phone     TEXT,
  co_organizer_email  TEXT,
  team_size           INTEGER,
  lane_count          INTEGER,
  slot_duration       INTEGER,
  expected_teams      INTEGER,
  categories          TEXT,
  description         TEXT,
  assigned_tier       TEXT,
  status              TEXT NOT NULL DEFAULT 'offen',
  admin_notes         TEXT,
  created_by          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE action_log (                                -- Ergebnis-Änderungen, Turnier abgeschlossen/wiedereröffnet
  id               TEXT PRIMARY KEY,
  tournament_id    TEXT,
  tournament_name  TEXT,
  player_id        TEXT,
  player_name      TEXT,
  team_id          TEXT,
  team_name        TEXT,
  action           TEXT NOT NULL,
  field            TEXT,
  old_value        TEXT,
  new_value        TEXT,
  actor_id         TEXT,
  actor_email      TEXT,
  actor_name       TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_action_log_tournament ON action_log(tournament_id, created_at);

CREATE TABLE newsletter_subscribers (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT,
  source      TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
