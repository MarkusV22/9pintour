import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch {}

    // Autorisierung: manueller Aufruf (via SDK) benötigt Admin/Turnier-Admin-Rolle.
    // Automatisierungs-Aufrufe haben keinen User-Kontext, liefern aber das
    // Event-Payload (body.event mit entity_name). Anonyme HTTP-Aufrufe ohne
    // Event-Payload werden abgewiesen.
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const isAutomationCall = !user && body.event?.entity_name === 'Tournament';
    if (!isAutomationCall) {
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin' && user.role !== 'turnier_admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Get tournament data — from automation payload or manual call
    let tournament = body.data;
    const tournamentId = body.tournament_id || body.data?.id || body.event?.entity_id;
    if (!tournament && tournamentId) {
      tournament = await base44.asServiceRole.entities.Tournament.get(tournamentId);
    }
    if (!tournament) {
      return Response.json({ error: 'Turnier nicht gefunden' }, { status: 404 });
    }

    // Get all active subscribers
    const allSubs = await base44.asServiceRole.entities.NewsletterSubscriber.list('-created_date', 10000);
    const subscribers = allSubs.filter(s => s.is_active);
    if (subscribers.length === 0) {
      return Response.json({ success: true, sent: 0, total: 0, message: 'Keine Abonnenten' });
    }

    const dateStr = tournament.date ? new Date(tournament.date).toLocaleDateString('de-AT') : '';
    const endStr = tournament.end_date ? new Date(tournament.end_date).toLocaleDateString('de-AT') : '';
    const dateRange = endStr ? `${dateStr} – ${endStr}` : dateStr;

    const subject = `Neues Turnier: ${tournament.name}`;
    const emailBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1e40af;margin-bottom:8px;">🏆 Neues Turnier veröffentlicht</h2>
  <h3 style="color:#333;margin-bottom:16px;">${tournament.name}</h3>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:6px 0;color:#666;">Datum:</td><td style="padding:6px 0;font-weight:bold;">${dateRange}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Ort:</td><td style="padding:6px 0;font-weight:bold;">${tournament.location || '–'}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Kategorie:</td><td style="padding:6px 0;font-weight:bold;">${tournament.category || '–'}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Tier:</td><td style="padding:6px 0;font-weight:bold;">${tournament.tier || '–'}</td></tr>
  </table>
  ${tournament.description ? `<p style="color:#555;margin-top:16px;">${tournament.description}</p>` : ''}
  <p style="margin-top:24px;color:#888;font-size:12px;">Sie erhalten diese E-Mail als Abonnent des 9-Pin Tour Newsletters.</p>
</div>`;

    let sent = 0;
    let errors = 0;
    for (const sub of subscribers) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: sub.email,
          subject,
          body: emailBody,
          from_name: '9-Pin Tour',
        });
        sent++;
      } catch (e) {
        errors++;
      }
    }

    return Response.json({ success: true, sent, errors, total: subscribers.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});