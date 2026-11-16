import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { data } = body;

    if (!data?.organizer_email) {
      return Response.json({ error: 'No organizer email found in payload' }, { status: 400 });
    }

    const organizerName = data.organizer_name || 'Veranstalter';
    const tournamentName = data.tournament_name || 'Ihr Turnier';
    const tournamentDate = data.tournament_date
      ? new Date(data.tournament_date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    const location = data.location || '';
    const categories = data.categories || '';

    // Send confirmation to organizer
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: data.organizer_email,
      subject: `Turnieranmeldung erhalten: ${tournamentName}`,
      body: `Hallo ${organizerName},

vielen Dank für Ihre Turnieranmeldung! Wir haben Ihre Anfrage erhalten und werden sie so bald wie möglich prüfen.

────────────────────────────────
Ihre Angaben im Überblick:
────────────────────────────────
Turnier:       ${tournamentName}
${tournamentDate ? `Datum:         ${tournamentDate}\n` : ''}${location ? `Ort:           ${location}\n` : ''}${categories ? `Kategorien:    ${categories}\n` : ''}
────────────────────────────────

Was passiert als nächstes?
Unser Team prüft Ihre Anfrage und meldet sich bei Ihnen per E-Mail, sobald das Turnier genehmigt und in die offizielle Tourwertung aufgenommen wurde. Nach der Genehmigung erhalten Sie automatisch alle Verwaltungsrechte für Ihr Turnier.

Bei Fragen können Sie uns jederzeit kontaktieren.

Viel Erfolg!
Ihr Turnierteam`,
    });

    // Notify all admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const adminEmails = admins.map(u => u.email).filter(Boolean);
    const appUrl = `${new URL(req.url).origin}`;

    await Promise.all(adminEmails.map(adminEmail =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: adminEmail,
        subject: `🆕 Neue Turnieranfrage: ${tournamentName}`,
        body: `Hallo,

es ist eine neue Turnieranmeldung eingegangen und wartet auf Ihre Prüfung.

────────────────────────────────
Turnier:       ${tournamentName}
${tournamentDate ? `Datum:         ${tournamentDate}\n` : ''}${location ? `Ort:           ${location}\n` : ''}${categories ? `Kategorien:    ${categories}\n` : ''}Veranstalter:  ${organizerName}
E-Mail:        ${data.organizer_email}
${data.organizer_phone ? `Telefon:       ${data.organizer_phone}\n` : ''}
────────────────────────────────

Bitte prüfen Sie die Anfrage im Admin-Bereich:
${appUrl}/turnier-anfragen

Mit freundlichen Grüßen,
Ihr System`,
      })
    ));

    return Response.json({ success: true, message: `Emails sent to organizer and ${adminEmails.length} admin(s)` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});