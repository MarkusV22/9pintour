import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { data, old_data } = body;

    // Only act when status changes to 'genehmigt' or 'abgelehnt'
    const newStatus = data?.status;
    const oldStatus = old_data?.status;
    if (newStatus === oldStatus) {
      return Response.json({ skipped: true, reason: 'Status unchanged' });
    }
    if (newStatus !== 'genehmigt' && newStatus !== 'abgelehnt') {
      return Response.json({ skipped: true, reason: 'Status not relevant' });
    }

    const organizerEmail = data.organizer_email;
    if (!organizerEmail) {
      return Response.json({ skipped: true, reason: 'No organizer email' });
    }

    const organizerName = data.organizer_name || 'Veranstalter';
    const tournamentName = data.tournament_name || 'Ihr Turnier';
    const tournamentDate = data.tournament_date
      ? new Date(data.tournament_date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    const location = data.location || '';
    const tier = data.assigned_tier || '';

    if (newStatus === 'genehmigt') {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: organizerEmail,
        subject: `✅ Turnier genehmigt: ${tournamentName}`,
        body: `Hallo ${organizerName},

wir freuen uns, Ihnen mitteilen zu können, dass Ihr Turnier genehmigt wurde und ab sofort in der offiziellen Tourwertung gelistet ist!

────────────────────────────────
Turnier:       ${tournamentName}
${tournamentDate ? `Datum:         ${tournamentDate}\n` : ''}${location ? `Ort:           ${location}\n` : ''}${tier ? `Tierkategorie: ${tier}\n` : ''}
────────────────────────────────

Sie haben nun vollständige Verwaltungsrechte für Ihr Turnier und können:
• Den Startplan bearbeiten
• Mannschaften verwalten
• Ergebnisse eintragen

Bitte melden Sie sich mit dieser E-Mail-Adresse in der App an, um auf die Turnierverwaltung zuzugreifen.

Viel Erfolg beim Turnier!
Ihr Turnierteam`,
      });
    } else if (newStatus === 'abgelehnt') {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: organizerEmail,
        subject: `Turnieranfrage: ${tournamentName}`,
        body: `Hallo ${organizerName},

vielen Dank für Ihre Turnieranmeldung für „${tournamentName}".

Leider können wir Ihre Anfrage zum aktuellen Zeitpunkt nicht genehmigen.${data.admin_notes ? `\n\nBegründung: ${data.admin_notes}` : ''}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen,
Ihr Turnierteam`,
      });
    }

    return Response.json({ success: true, status: newStatus, to: organizerEmail });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});