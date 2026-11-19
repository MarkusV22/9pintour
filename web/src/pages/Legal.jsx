// Impressum, Datenschutzerklärung, Nutzungsbedingungen (Stand 19.11.2026)
import { Link } from 'react-router-dom';

const OWNER = {
  name: 'Markus Vsetecka',
  street: 'Georg Donberger-Gasse 1/11',
  city: '2460 Bruck an der Leitha',
  country: 'Österreich',
  email: 'vsetecka.markus@gmail.com',
};
const STAND = '19. November 2026';

function Page({ title, children }) {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">{title}</h1>
      <div className="space-y-5 text-sm leading-relaxed text-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-primary [&_a:hover]:underline">
        {children}
      </div>
    </div>
  );
}

const Mail = () => <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>;
const Address = () => (<>{OWNER.name}<br />{OWNER.street}<br />{OWNER.city}<br />{OWNER.country}</>);

export function Impressum() {
  return (
    <Page title="Impressum">
      <p className="text-muted-foreground">Angaben gemäß § 5 E-Commerce-Gesetz und Offenlegung gemäß § 25 Mediengesetz</p>
      <h2>Medieninhaber und Betreiber</h2>
      <p><Address /></p>
      <h2>Kontakt</h2>
      <p>E-Mail: <Mail /></p>
      <h2>Grundlegende Richtung (Blattlinie)</h2>
      <p>9pintour.at ist eine private, nicht-kommerzielle Plattform zur Organisation von Kegelturnieren (9-Pin Tour und 9PinFuture-Nachwuchsserie):
        Turnierkalender, Startpläne, Ergebnisse und Ranglisten.</p>
      <h2>Haftung für Inhalte</h2>
      <p>Turnierdaten und Ergebnisse werden von den jeweiligen Veranstaltern eingetragen. Trotz sorgfältiger Prüfung kann keine Gewähr für
        Richtigkeit, Vollständigkeit und Aktualität übernommen werden. Für Inhalte externer Links (z. B. Livestreams) sind ausschließlich deren Betreiber verantwortlich.</p>
      <p>Siehe auch <Link to="/datenschutz">Datenschutzerklärung</Link> und <Link to="/nutzungsbedingungen">Nutzungsbedingungen</Link>.</p>
    </Page>
  );
}

export function Datenschutz() {
  return (
    <Page title="Datenschutzerklärung">
      <p className="text-muted-foreground">Stand: {STAND}</p>

      <h2>1. Verantwortlicher</h2>
      <p><Address /><br />E-Mail: <Mail /></p>

      <h2>2. Welche Daten wir verarbeiten und wofür</h2>
      <ul>
        <li><b>Benutzerkonto:</b> E-Mail-Adresse, Name, verschlüsseltes Passwort bzw. bei Anmeldung mit Google die Google-Kennung, Name und E-Mail-Adresse.
          Zweck: Anmeldung, Turnieranmeldung, Verwaltung durch Veranstalter. Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).</li>
        <li><b>Spielerprofil:</b> Name, Spielernummer, Verein, Kategorie (Herren/Damen), Altersklasse, Geburtsdatum (zur Bestimmung der Altersklasse),
          optional Telefonnummer, Foto, persönliche Bestleistung, Walk-on-Song.</li>
        <li><b>Turnierdaten:</b> Startplätze, Mannschaften, Ergebnisse (Kegel, Bahndaten), Platzierungen und Ranglistenpunkte.</li>
        <li><b>Protokolle:</b> Änderungen an Ergebnissen und Spielerdaten werden mit Zeitpunkt und ändernder Person gespeichert, um Fehler nachvollziehen zu können.</li>
        <li><b>Newsletter</b> (nur wenn angemeldet): E-Mail-Adresse und optional Name. Rechtsgrundlage: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit widerrufbar.</li>
        <li><b>Turnieranfragen:</b> Kontaktdaten der Veranstalter (Name, E-Mail, Telefon) zur Bearbeitung der Anfrage.</li>
      </ul>

      <h2>3. Veröffentlichung von Ergebnissen</h2>
      <p>Startpläne, Ergebnisse und Ranglisten sind öffentlich einsehbar (Name, Verein, Kategorie, Altersklasse, Ergebnis, Platzierung). Das ist der Zweck
        einer Turnierwertung und entspricht dem üblichen Vorgehen im Sport (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO).
        Geburtsdatum, Telefonnummer und E-Mail-Adresse werden <b>nicht</b> veröffentlicht; sie sehen nur der Spieler selbst und die Turnier-Administratoren.
        Wer nicht öffentlich genannt werden möchte, kann sich an <Mail /> wenden.</p>

      <h2>4. Kinder und Jugendliche (9PinFuture)</h2>
      <p>Für die Nachwuchsserie werden Daten von Minderjährigen verarbeitet. Die Anmeldung erfolgt über den Verein bzw. die Erziehungsberechtigten.
        Erziehungsberechtigte können jederzeit Auskunft, Berichtigung oder Löschung verlangen.</p>

      <h2>5. Cookies</h2>
      <p>Wir setzen nur ein technisch notwendiges Cookie für die Anmeldung (Sitzung). Es gibt kein Tracking, keine Analyse-Werkzeuge und derzeit keine Werbung.</p>

      <h2>6. Empfänger und Auftragsverarbeiter</h2>
      <ul>
        <li><b>Cloudflare, Inc.</b> (Hosting, Datenbank, Bildspeicher; Daten werden in Westeuropa gespeichert).</li>
        <li><b>Google Ireland Ltd.</b> – nur bei Anmeldung mit Google.</li>
        <li><b>Resend</b> – Versand von E-Mails (z. B. Passwort-Links).</li>
        <li><b>Stripe</b> – nur falls Online-Zahlung für ein Turnier aktiviert ist; Zahlungsdaten verarbeitet ausschließlich Stripe.</li>
      </ul>
      <p>Soweit Anbieter ihren Sitz in den USA haben, erfolgt die Übermittlung auf Grundlage des EU-US Data Privacy Framework bzw. von Standardvertragsklauseln.
        Veranstalter eines Turniers sehen die Daten der für ihr Turnier angemeldeten Spieler, soweit für die Durchführung nötig.</p>

      <h2>7. Speicherdauer</h2>
      <p>Konto- und Profildaten speichern wir, bis du die Löschung verlangst. Turnierergebnisse und Ranglisten bleiben als Archiv der Turnierserie erhalten;
        auf Wunsch werden sie anonymisiert. Gelöschte Turniere werden nach 30 Tagen endgültig entfernt.</p>

      <h2>8. Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf
        erteilter Einwilligungen. Wende dich dazu an <Mail />. Außerdem kannst du dich bei der österreichischen Datenschutzbehörde
        (<a href="https://www.dsb.gv.at" target="_blank" rel="noreferrer">www.dsb.gv.at</a>) beschweren.</p>
    </Page>
  );
}

export function Nutzungsbedingungen() {
  return (
    <Page title="Nutzungsbedingungen">
      <p className="text-muted-foreground">Stand: {STAND}</p>

      <h2>1. Anbieter und Leistung</h2>
      <p>9pintour.at wird privat von {OWNER.name} betrieben (siehe <Link to="/impressum">Impressum</Link>) und stellt kostenlos Turnierkalender,
        Startpläne, Ergebnisse und Ranglisten der 9-Pin Tour bereit. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.</p>

      <h2>2. Benutzerkonto</h2>
      <p>Für Turnieranmeldungen und das Spielerprofil ist ein Konto nötig. Du bist für die Richtigkeit deiner Angaben verantwortlich und hältst deine
        Zugangsdaten geheim. Ein Spielerprofil darf nur mit dem eigenen Konto verknüpft werden.</p>

      <h2>3. Veranstalter</h2>
      <p>Veranstalter tragen ihre Turniere, Startpläne und Ergebnisse selbst ein und sind für deren Richtigkeit verantwortlich. Die Vergabe der
        Ranglistenpunkte erfolgt nach dem veröffentlichten Punkteschlüssel der 9-Pin Tour.</p>

      <h2>4. Verhalten</h2>
      <p>Unzulässig sind falsche Angaben, das Eintragen fremder Personen ohne deren Einverständnis, Manipulation von Ergebnissen sowie jede Nutzung,
        die den Betrieb stört. Bei Verstößen kann ein Konto gesperrt werden.</p>

      <h2>5. Zahlungen</h2>
      <p>Startgebühren werden mit dem jeweiligen Veranstalter abgerechnet. Sofern für ein Turnier eine Online-Zahlung angeboten wird, erfolgt sie über Stripe;
        es gelten zusätzlich dessen Bedingungen.</p>

      <h2>6. Haftung</h2>
      <p>Der Betreiber haftet nur für Vorsatz und grobe Fahrlässigkeit, ausgenommen Personenschäden. Für von Veranstaltern eingetragene Inhalte sowie für
        die Durchführung der Turniere wird keine Haftung übernommen.</p>

      <h2>7. Änderungen und Recht</h2>
      <p>Diese Bedingungen können angepasst werden; die jeweils aktuelle Fassung ist hier abrufbar. Es gilt österreichisches Recht, zwingende
        Verbraucherschutzbestimmungen bleiben unberührt. Datenschutz: siehe <Link to="/datenschutz">Datenschutzerklärung</Link>.</p>
    </Page>
  );
}
