import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { generateResultsPDF } from '../../shared/resultsPdf.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    let tournamentId = url.searchParams.get('tournament_id');
    if (!tournamentId) {
      try { const body = await req.json(); tournamentId = body.tournament_id || body.data?.id; } catch {}
    }
    if (!tournamentId) return new Response('tournament_id fehlt', { status: 400 });

    const tournament = await base44.asServiceRole.entities.Tournament.get(tournamentId);
    if (!tournament) return new Response('Turnier nicht gefunden', { status: 404 });

    const [allTeams, allScores, allSchedules, allPlayers] = await Promise.all([
      base44.asServiceRole.entities.Team.list('-created_date', 10000),
      base44.asServiceRole.entities.TournamentScore.list('-created_date', 10000),
      base44.asServiceRole.entities.TournamentSchedule.list('-created_date', 10000),
      base44.asServiceRole.entities.Player.list('name', 10000),
    ]);
    const teams = allTeams.filter(t => t.tournament_id === tournamentId);
    const scores = allScores.filter(s => s.tournament_id === tournamentId);
    const schedules = allSchedules.filter(s => s.tournament_id === tournamentId);
    const playerMap: Record<string, any> = {};
    allPlayers.forEach(p => { playerMap[p.id] = p; });

    const doc = await generateResultsPDF(base44, tournament, teams, scores, schedules, playerMap);
    const pdfBytes = doc.output('arraybuffer');
    const safeName = (tournament.name || 'Turnier').replace(/[^\wäöüÄÖÜß\s-]/g, '').replace(/\s+/g, '_');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Ergebnisse_${safeName}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('downloadResultsPdf Fehler:', error?.message || error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});