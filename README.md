# 9pintour.at

9-Pin Tour – Verwaltung der Turniere außerhalb der Saison. Neubau nach dem Umzug von Base44
(gleicher Aufbau wie 9pinfantasy: Cloudflare Worker + D1, React-Frontend).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/rules/` | Regeln als reine Funktionen: Tour-Punkte, Turnierwertung, Ranglisten (Tour + 9PinFuture), Berechtigungen. Keine Cloudflare-Abhängigkeit. |
| `src/worker/` | API (Hono) auf Cloudflare Workers, Datenbank D1 (SQLite). Login wie 9pinfantasy (Google + E-Mail/Passwort). |
| `migrations/` | Datenbankschema. |
| `scripts/import-base44.ts` | Base44-CSV-Export → SQL, mit Abgleich-Bericht (Turnierwertung + Ranglisten). |
| `test/` | Tests (Regeln, API, Abgleich mit echten Daten – nur lokal). |
| `base44-original/` | Originalcode aus Base44 (Stand 16.11.2026) als Vorlage, wird nicht ausgeliefert. |
| `docs/UEBERGABE.md` | Regeln, Entscheidungen, offene Punkte. |
| `web/` | Frontend: die bisherigen Base44-Seiten (React + Tailwind), `src/api/base44Client.js` ersetzt das Base44-SDK durch die eigene API. |

## Lokal starten

```bash
npm run setup                 # Abhängigkeiten (API + Frontend)
npm test                      # Tests (Abgleich mit echten Daten nur, wenn data-base44/csv/ vorhanden)
cp .dev.vars.example .dev.vars
npm run db:reset              # lokale DB neu: Schema + Import aus data-base44/csv/
npm run build                 # Frontend bauen (web/dist)
npm run dev                   # App + API: http://localhost:8787
npm run dev:web               # alternativ: Frontend mit Hot-Reload auf :5173
```

## Datenimport

CSV-Exporte aus dem Base44-Dashboard (Data → je Tabelle Export) in `data-base44/csv/` legen,
Dateiname = Entity-Name (z. B. `Player.csv`, `User.csv`). Dann:

```bash
npx tsx scripts/import-base44.ts data-base44/csv import.sql   # zeigt Mengen, Hinweise und Abgleich
```

Übernommen werden die gespeicherten Platzierungen/Punkte (`results`) – die Ranglisten sind damit identisch
mit Base44. Der Abgleich zeigt zusätzlich, wo eine Neuberechnung heute anders ausfallen würde.

## API

Das Frontend nutzt eine Base44-kompatible Schnittstelle, damit die bisherigen Seiten unverändert laufen:
`GET/POST /api/entities/<Tabelle>`, `PATCH/DELETE /api/entities/<Tabelle>/<id>`, `…/bulk`, `…/delete-many`,
`POST /api/functions/<name>`, `POST /api/upload`, `POST /api/send-email`.
Berechtigungen werden je Tabelle im Server geprüft (`src/worker/routes/entityWrites.ts`), private Spielerdaten
(Telefon, Geburtsdatum, Konto-E-Mail) sehen nur Turnier-Admins und der Spieler selbst.

Zusätzlich:

| Pfad | Zugriff |
|---|---|
| `GET /api/tournaments`, `/api/tournaments/:id` | öffentlich (ohne private Spielerdaten) |
| `GET /api/ranking`, `/api/ranking/future` | öffentlich |
| `GET /api/players`, `/api/players/:id`, `/api/seasons`, `/api/settings` | öffentlich |
| `POST /api/tournaments/:id/finish`, `/reopen` | Veranstalter, Turnier-Admin, Admin |
| `/api/auth/*`, `/api/me` | Login, Registrierung, Passwort, Google |
| `GET /api/admin/data-check`, `POST /api/admin/tournaments/:id/rewertung` | Datenprüfung (Turnier-Admin) / Neuwertung (Admin) |

## Veröffentlichen

GitHub Actions testet jede Änderung. Veröffentlicht wird erst, wenn die Repository-Variable
`DEPLOY_ENABLED=true` gesetzt ist (Secrets siehe `.github/workflows/deploy.yml`).
