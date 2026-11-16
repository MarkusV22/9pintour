import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import {
  collectPlayerEntries,
  buildTeamRanked,
  buildEinzelRanked,
  generateResultsPDF,
  escapeHtml,
} from '../../shared/resultsPdf.ts';

function formatTop3(ranking: any[], unitLabel = 'Kegel'): string {
  if (ranking.length === 0) return '';
  const medals = ['🥇', '🥈', '🥉'];
  const items = ranking.slice(0, 3).map((r, i) => {
    const name = r.team?.name || r.name || '–';
    const value = r.total ?? r.score ?? '–';
    return `<li style="padding:4px 0;list-style:none;display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">${medals[i] || ''}</span>
      <span style="font-weight:600;">${escapeHtml(name)}</span>
      <span style="color:#666;margin-left:auto;">${value} ${unitLabel}</span>
    </li>`;
  }).join('');
  return `<ul style="padding:0;margin:0 0 16px 0;">${items}</ul>`;
}

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

    let tournament = body.data;
    const tournamentId = body.tournament_id || body.data?.id || body.event?.entity_id;
    if (!tournament && tournamentId) {
      tournament = await base44.asServiceRole.entities.Tournament.get(tournamentId);
    }
    if (!tournament) {
      return Response.json({ error: 'Turnier nicht gefunden' }, { status: 404 });
    }

    const tid = tournament.id || tournamentId;

    // Daten laden
    const [allTeams, allScores, allSchedules, allPlayers] = await Promise.all([
      base44.asServiceRole.entities.Team.list('-created_date', 10000),
      base44.asServiceRole.entities.TournamentScore.list('-created_date', 10000),
      base44.asServiceRole.entities.TournamentSchedule.list('-created_date', 10000),
      base44.asServiceRole.entities.Player.list('name', 10000),
    ]);
    const teams = allTeams.filter(t => t.tournament_id === tid);
    const scores = allScores.filter(s => s.tournament_id === tid);
    const schedules = allSchedules.filter(s => s.tournament_id === tid);
    const playerMap: Record<string, any> = {};
    allPlayers.forEach(p => { playerMap[p.id] = p; });

    // Top-3 Rankings
    const herrenTeams = buildTeamRanked(teams, scores, 'Herren', playerMap);
    const damenTeams = buildTeamRanked(teams, scores, 'Damen', playerMap);
    const mixedTeams = buildTeamRanked(teams, scores, 'Mixed', playerMap);
    const playerEntries = collectPlayerEntries(teams, scores, schedules, playerMap);
    const herrenEinzel = buildEinzelRanked(playerEntries, playerMap, 'Herren');
    const damenEinzel = buildEinzelRanked(playerEntries, playerMap, 'Damen');

    // ── PDF generieren und hochladen ──
    const doc = await generateResultsPDF(base44, tournament, teams, scores, schedules, playerMap);
    const pdfBytes = doc.output('arraybuffer');
    const safeName = (tournament.name || 'Turnier').replace(/[^\wäöüÄÖÜß\s-]/g, '').replace(/\s+/g, '_');
    const fileName = `Ergebnisse_${safeName}.pdf`;
    const file = new File([pdfBytes], fileName, { type: 'application/pdf' });
    const { file_url: pdfUrl } = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    // ── E-Mail-Body ──
    const tName = escapeHtml(tournament.name || '');
    const greeting = 'Turnierabschluss – Vielen Dank für eure Teilnahme! 🎳';
    const bodyText = `Liebe 9-Pin Tour Community,

ein weiteres Turnier ist erfolgreich beendet und wir möchten uns herzlich bei allen Teilnehmerinnen und Teilnehmern euren Einsatz und die großartige Stimmung bedanken!

Das Turnier ${tName} ist damit abgeschlossen. Wir hoffen, ihr hattet viel Spaß und spannende Spiele und konntet das Turnier genauso genießen wie wir.`;

    const pdfText = 'Die vollständigen Ergebnislisten findet ihr hier als PDF:';

    const closingText = `Wir gratulieren allen Teilnehmerinnen und Teilnehmern zu ihren Leistungen und freuen uns bereits auf das nächste Turnier mit euch!

Vielen Dank für eure Unterstützung und dafür, dass ihr die 9-Pin Tour zu dem macht, was sie ist. ❤️

Sportliche Grüße
Euer 9-Pin Tour Team 🎳`;

    // Top-3 Sektionen
    let top3Html = '';
    const sectionTitle = (label: string, color: string) => `<h4 style="color:${color};margin:20px 0 6px 0;font-size:14px;">${escapeHtml(label)}</h4>`;
    if (herrenTeams.length > 0) {
      top3Html += sectionTitle('🏆 Mannschaft Herren – Top 3', '#1e40af') + formatTop3(herrenTeams, 'Kegel');
    }
    if (damenTeams.length > 0) {
      top3Html += sectionTitle('🏆 Mannschaft Damen – Top 3', '#9d174d') + formatTop3(damenTeams, 'Kegel');
    }
    if (mixedTeams.length > 0) {
      top3Html += sectionTitle('🏆 Mannschaft Mixed – Top 3', '#6d28d9') + formatTop3(mixedTeams, 'Kegel');
    }
    if (herrenEinzel.length > 0) {
      top3Html += sectionTitle('🏆 Einzel Herren – Top 3', '#1e40af') + formatTop3(herrenEinzel, 'Kegel');
    }
    if (damenEinzel.length > 0) {
      top3Html += sectionTitle('🏆 Einzel Damen – Top 3', '#9d174d') + formatTop3(damenEinzel, 'Kegel');
    }

    const pdfLinkHtml = `<div style="margin:20px 0;">
      <a href="${escapeHtml(pdfUrl)}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">📄 Ergebnisliste als PDF herunterladen</a>
    </div>`;

    const emailBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#1e40af;margin-bottom:16px;font-size:20px;">${escapeHtml(greeting)}</h2>
  <p style="white-space:pre-line;line-height:1.6;">${escapeHtml(bodyText)}</p>
  <p style="margin:16px 0;line-height:1.6;">${escapeHtml(pdfText)}</p>
  ${pdfLinkHtml}
  ${top3Html}
  <p style="white-space:pre-line;line-height:1.6;margin-top:20px;">${escapeHtml(closingText)}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#999;font-size:11px;">Du erhältst diese E-Mail als Abonnent des 9-Pin Tour Newsletters.</p>
</div>`;

    const subject = `Turnierabschluss: ${tournament.name}`;

    // Abonnenten laden (nur registrierte Nutzer können Mail empfangen)
    const allSubs = await base44.asServiceRole.entities.NewsletterSubscriber.list('-created_date', 10000);
    const subscribers = allSubs.filter(s => s.is_active);
    if (subscribers.length === 0) {
      return Response.json({ success: true, sent: 0, total: 0, message: 'Keine Abonnenten', pdfUrl });
    }

    let sent = 0;
    let errors = 0;
    const failedEmails: string[] = [];
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
        console.error(`Mail an ${sub.email} fehlgeschlagen:`, e?.message || e);
        failedEmails.push(sub.email);
        errors++;
      }
    }

    return Response.json({
      success: true,
      sent,
      errors,
      total: subscribers.length,
      pdfUrl,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
    });
  } catch (error) {
    console.error('onTournamentFinished Fehler:', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});