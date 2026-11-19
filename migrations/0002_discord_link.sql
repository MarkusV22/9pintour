-- Neuer Discord-Einladungslink (19.11.2026)
INSERT INTO app_settings (key, value, updated_at) VALUES ('discord_url', 'https://discord.gg/uAYrz6pcqu', '2026-11-19T17:30:00.000Z')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
