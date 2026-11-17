# 9pintour.at – Übergabe für den Neubau (Stand 16.11.2026)

> Entwurf aus dem Base44-Code (`base44-original/`) und dem Datenexport. **Bitte prüfen** – vor allem die Regeln
> und die offenen Fragen am Ende. Was hier steht, wird 1:1 nachgebaut.

## Ziel
Umzug der 9-Pin Tour (Turniere außerhalb der Saison) von Base44 auf eigene, günstige Infrastruktur – gleicher
Aufbau wie 9pinfantasy: Cloudflare Worker (Hono) + D1 (SQLite) + R2, React-Frontend, Deploy über GitHub Actions.
Eigene Daten, keine Verbindung zu 9pinfantasy. Kein Zeitdruck.

## Bestand (Export 16.11.2026)
| Tabelle | Einträge | Inhalt |
|---|---|---|
| Player | 1.903 | Spielerdatenbank (Name, Verein, Kategorie, Altersklasse, Geburtsdatum, Foto, Lochkegel, verknüpftes Konto) |
| Tournament | 18 | davon 1 gelöscht (Soft-Delete), 6 geplant, 11 abgeschlossen |
| Team | 325 | Mannschaften je Turnier (bis 6 Spieler) |
| TournamentSchedule | 1.651 | Startplan: Tag, Uhrzeit, Bahn, Spielort, Spieler/Mannschaft oder Platzhalter |
| TournamentScore | 1.516 | Ergebnisse inkl. Bahndaten (Volle/Abräumen/Fehlwurf) als JSON |
| TournamentResult | 1.163 | vergebene Platzierungen + Tour-Punkte |
| Season | 2 | 2024/025, 2026/2027 (aktiv) |
| AppSetting | 22 | Einstellungen (Werbung, Newsletter, PDF-Logos, Tour-Fee, Discord, Future sichtbar …) |
| User | 41 | 1 Admin (Markus), 40 Nutzer, keine Turnier-Admins, keine Werbefrei-Abos |
| PlayerActionLog | 108 | Änderungsprotokoll Spieler |
| TournamentRequest | 8 | Turnieranfragen (7 genehmigt, 1 abgelehnt) |
| PlayerMerge | 7 | zusammengeführte Spieler-Duplikate |
| PlayerChangeRequest | 2 | Änderungsanträge (genehmigt) |
| NewsletterSubscriber | 10 | Newsletter-Abonnenten |
| ActionLog | 3.560 | Protokoll Ergebnis-Änderungen / Turnier abgeschlossen |

Hinweis: Der Export über die Editor-Schnittstelle lieferte die geschützten Tabellen leer; maßgeblich sind die
CSV-Exporte aus dem Base44-Dashboard (`data-base44/csv/`). Kerntabellen (Turniere, Teams, Startpläne, Ergebnisse,
Punkte, Saisonen) sind in beiden Exporten identisch.

36 Spieler sind mit einem Benutzerkonto verknüpft (`Player.user_email`).
Bilder (Turnierlogos, PDF-Logos, Banner) liegen auf `base44.app` → müssen vor der Kündigung nach R2 kopiert werden.

## Befunde aus dem Abgleich (16.11.2026)
Übernommen werden die in Base44 gespeicherten Platzierungen/Punkte → Ranglisten identisch mit der laufenden App
(Tour Herren: Temistokle 2750, Vsetecka P. 2450, Huber 2010; Damen: Walch 2175, Flatscher 2000, Nikolic 1780).
Bei 8 von 11 abgeschlossenen Turnieren ergibt eine Neuberechnung exakt dasselbe. Abweichungen nur durch spätere Datenänderungen:
- **Marchfeldturnier 2026**: Alois Anzenberger, Günter Eck, Roman Kothmeier existieren doppelt – je einmal als **Damen**
  (Nr. 24522–24525, haben Damen-Punkte 10/15/30 bekommen) und korrekt als Herren. Die Damen-Duplikate sind in keinem Kader mehr.
  → Offen: Duplikate entfernen und Marchfeld neu werten? (Echte Damen rücken dann vor.)
- **Pongauer Stier 2026**: Hobbyspieler Peter Scholz wurde beim Abschluss (alte Regel) nicht gewertet; neu wäre er 27. (30 P).
  → Offen: neu werten?
- **2. Blaufränkisch Open**: **Tamara Eder** steht doppelt in der Wertung (Platz 11 *und* 16, 15 + 10 P) – Folge der
  Spieler-Zusammenführung vom 18.08.; in der Rangliste zählt sie dadurch doppelt (auch in Base44). Neu gewertet: nur Platz 11,
  Damen ab Platz 16 rücken um eins vor (Melanie Hahn 6 → 10 P). Manfred Zach hat nur noch einen leeren Score (0 P, ohne Wirkung).
  → Offen: neu werten?
- 173 Altdatensätze (Teams/Startplätze/Scores/Ergebnisse) gehören zu endgültig gelöschten Turnieren → nicht übernommen.

**Entscheidung 16.11.2026:** Vorerst nichts korrigieren. In der neuen App eine Admin-Seite **„Datenprüfung“** bauen, die genau
diese Stellen zeigt (Turnier, Wertung, Platz, Spieler – mit Links), damit Markus sie dort ansehen und dann entscheiden kann:
Spieler doppelt in einer Turnierwertung · Duplikate mit falscher Kategorie (gleicher Name, Herren/Damen) ·
gespeicherte Wertung weicht von Neuberechnung ab (Vergleich nebeneinander, Neuwertung per Knopf).

## Rollen
- **admin** – alles.
- **turnier_admin** – Turniere, Startpläne, Ergebnisse, Spielerdatenbank verwalten.
- **Veranstalter eines Turniers** – Ersteller oder Mitveranstalter (`co_organizer_emails`) darf dieses Turnier bearbeiten.
- **user** (angemeldet) – eigenes Profil, sich selbst/andere in Startpläne eintragen (bei offener Anmeldung).
- Öffentlich (ohne Login): Dashboard, Turniere, Ranglisten, Archiv, Spielerprofile (zu prüfen, siehe Fragen).

## Turniere
- Felder: Name, Datum (+ Enddatum, mehrere Spieltage über `day_configs`), Ort, Status `geplant → laufend → abgeschlossen`,
  Kategorie (Tier), Serie (`standard` = 9-Pin Tour, `future` = 9PinFuture Nachwuchs), Kategorie Herren/Damen/Mixed,
  erlaubte Mannschaftskategorien, Mixed-Kombinationen (z. B. 2 Damen + 2 Herren), Teamgröße 1–6, Bahnen 4/6/8,
  Durchgang 60/70 min, Logo, Livestream, Beschreibung, mehrere Spielorte (Future), Anmeldeart offen/Einladung.
- Modus `normal` oder `final` (Finalturnier mit Gruppenphase A/B und K.-o.-Duellen, Gruppen per `generateFinalGroups`).
- Soft-Delete: `deleted_at`, endgültig nach 30 Tagen (Admin-Seite „Gelöschte Turniere“).
- Startplan: Slots je Tag × Uhrzeit × Bahn × Spielort; Platzhalter möglich; vergangene Slots (Startzeit + Puffer) nicht mehr buchbar.

## Wertung eines Turniers (`generateResults.js`)
- Gewertet werden nur Spieler, die **aktuell im Startplan** stehen (Mannschaft oder Einzelstarter-Slot);
  beim Finalturnier nur die Gruppenphase (A/B), nicht die K.-o.-Duelle.
- Pro Spieler zählt das **beste Ergebnis** über alle seine Starts im Turnier.
- Leere Datensätze zählen nicht. **No-Show** (`{no_show:true}`): keine Platzierung, keine Punkte, zählt nicht zur Teilnehmerzahl.
  **W.O.** (`{wo:true}`): siehe Future.
- **Lochkegel-/Hobbyspieler** (`is_hobby`, derzeit 1 Spieler) – **bestätigt 16.11.2026, so läuft es bereits**:
  bekommen normal Tour-Punkte und stehen in der normalen Rangliste (keine eigene Rangliste). Im Turnier werden sie
  **wie eine Altersklasse** zusätzlich gewertet: Hobby-Einzelwertung (Herren/Damen getrennt) und Hobby-Mannschaftswertung
  (Teams, deren kompletter Kader aus Hobbyspielern besteht) im Zwischenstand/Ergebnis. Einstellung `lochkegel_in_tour` wird nicht genutzt → entfällt.
- Reihung: 1. mehr Kegel, 2. mehr Abräumen, 3. weniger Fehlwürfe.
- Gruppen: Standard nach Spieler-Kategorie (Herren/Damen); Future nach Altersklasse **und** Geschlecht.

### Tour-Punkte (Standard)
Platzierungsgruppen: 1 | 2 | 3 | 4–5 | 6–7 | 8–10 | 11–15 | 16–20 | 21–25 | 26–30 | 31–35 | 36–40 | 41–50 | 51–60 | 61–70

| Kategorie | Punkte |
|---|---|
| Grand Slam | 2000 1200 720 480 300 200 120 80 50 30 20 15 10 5 1 |
| NPT 1000 (Masters 1000) | 1000 600 360 240 150 100 60 40 25 15 10 8 5 2 1 |
| NPT 500 | 500 300 180 120 75 50 30 20 12 8 5 4 2 1 0 |
| NPT 250 | 250 150 90 60 38 25 15 10 6 4 3 2 1 0 0 |
| Challenger | 125 75 45 30 19 13 8 5 3 2 1 0 0 0 0 |
| Finalturnier, Competition | 0 |

Ab Platz 71: 0 Punkte. (Der `PointsTableEditor` im Admin ändert die Tabelle nur im Browser, nichts wird gespeichert → die Werte oben gelten.)

### Rangliste (Standard)
- Nur Turniere der **aktiven Saison** (Datum zwischen Saisonbeginn und -ende), Serie `standard`, Status abgeschlossen,
  nicht gelöscht, mit vergebenen Ergebnissen.
- Punkte werden **summiert** (alle Turniere, kein Streichresultat). Getrennt Herren / Damen.
- Reihung: Punkte, dann Anzahl Turniere; Gleichstand → gleicher Rang (1, 2, 2, 4 …).

### 9PinFuture (Nachwuchs)
- Altersklassen-Ranglisten U-10, U-15, U-19, jeweils Herren/Damen getrennt.
- Pro Turnier: 2 Antrittspunkte + Platzierungspunkte = Teilnehmer in der Gruppe − Platz + 1
  (1. bei n Teilnehmern: 2 + n, Letzter: 2 + 1). W.O. = nur 2 Antrittspunkte, zählt nicht zur Teilnehmerzahl.
- **Schnitt-Bonus**: Schnitt der besten 5 Turnierergebnisse; ab 3 Teilnahmen gibt es Bonuspunkte nach demselben Schema,
  gereiht nach Schnitt.
- Nicht angetreten oder aus dem Startplan entfernt → Ergebnis wird nicht gewertet.

## Weitere Funktionen
- **Spielerdatenbank**: Nummerierung (je Kategorie), Zusammenführen von Duplikaten, Umbenennen, Änderungsanträge von Spielern,
  Änderungsprotokoll, CSV-Import, Datenschutz-Zustimmung, Verknüpfung Konto ↔ Spieler, Statistiken je Spieler.
- **Turnieranfragen** (`TournamentRequest`): Veranstalter melden ein Turnier an, Admin bestätigt → Bestätigungs-Mails.
- **PDF**: Startplan, Ergebnisse, Ausschreibung, Finale – mit Logo je Kategorie (PDF-Branding-Admin).
- **E-Mails/Newsletter**: neues Turnier veröffentlicht, Turnier beendet (Top 3), Anfragen. Ein-/Ausschaltbar.
  In Base44 derzeit **an** (`newsletter_enabled`, `ads_enabled` = true) – im Neubau beim Start **aus** (Entscheidung).
- **Zahlungen (Stripe)**: Startgebühr pro Mannschaft/Einzelstarter online, Bar-Zahlungen markierbar, Tour-Fee-Abrechnung;
  Werbefrei-Abo (jährlich/lifetime). Bisher genutzt: 1 Turnier mit Online-Zahlung (Marchfeldturnier 2026), 1 offene Zahlung, 0 Abos.
- **Werbung**: Banner (`ads_html`), Dashboard-Banner, Discord-Karte.
- **Action-Log**: Änderungen an Ergebnissen und Turnierstatus.

## Stand
- 17.11.2026: Testadresse **https://9pintour.vsetecka-markus.workers.dev** online (Cloudflare Worker + D1 `9pintour` + R2 `9pintour-media`).
  Import über /einrichtung: 41 Konten, 1.903 Spieler, 18 Turniere, 324 Mannschaften, 1.425 Ergebnisse, 1.107 Wertungen.
- Offen: Bilder von base44.app nach R2, Google-Login (OAuth-Client), Domain 9pintour.at (IONOS → Cloudflare-Nameserver),
  Umzugs-Mail an die Nutzer, Base44 kündigen.

## Vorschlag Vorgehen
1. Gerüst von 9pinfantasy übernehmen (Login Google + E-Mail/Passwort, Sessions, Deploy, Import-Skript).
2. Schema + Import aus `data-base44/` mit Abgleich (Ergebnisse/Ranglisten müssen 1:1 gleich sein).
3. Regeln als reine Funktionen + Tests (wie `src/rules/` bei 9pinfantasy).
4. Seiten nachbauen, Design wie bisher.
5. Bilder von base44.app nach R2, Domain umstellen, Base44 kündigen.
6. Zahlungen, Werbung, Newsletter zuletzt (oder weglassen, siehe Fragen).

## Offene Fragen an Markus
1. ~~Domain~~ → 9pintour.at bei **IONOS** (Registrar + Nameserver ui-dns). Plan wie bei 9pinfantasy: Zone in Cloudflare anlegen, Nameserver bei IONOS auf Cloudflare umstellen (Registrar bleibt IONOS). Keine E-Mail-Postfächer auf der Domain (bestätigt). Base44-Einträge bis zur Umstellung „nur DNS“ (graue Wolke).
2. ~~Login~~ → **beides** (Google + E-Mail/Passwort), wie 9pinfantasy; E-Mail-Nutzer bekommen Passwort-Setzen-Mail.
3. ~~Leere Tabellen~~ → geklärt, alle 15 Tabellen als CSV vorhanden (`data-base44/csv/`, nicht im Git).
4. ~~Stripe/Werbefrei-Abo/Werbung~~ → **einbauen, aber deaktiviert** (per Einstellung einschaltbar).
5. ~~Mails~~ → **wie bei 9pinfantasy**: vorerst aus, erst einschalten, wenn alles läuft.
6. ~~Öffentlich~~ → **ja**, Ranglisten, Turniere, Spielerprofile ohne Login sichtbar (wie bisher).
7. ~~Saison~~ → Tippfehler, beim Import auf **2024/2025** korrigieren.
8. ~~Lochkegel~~ → entschieden (siehe Wertung).
