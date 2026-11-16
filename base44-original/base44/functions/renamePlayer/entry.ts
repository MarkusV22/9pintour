import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { playerId, newName } = body;
    if (!playerId || !newName) {
      return Response.json({ error: 'Missing params' }, { status: 400 });
    }

    // Only allow the owner of the player profile or admin
    const players = await base44.asServiceRole.entities.Player.filter({ id: playerId });
    const player = players[0];
    if (!player) return Response.json({ error: 'Player not found' }, { status: 404 });
    if (player.user_email !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // oldName wird serverseitig aus der geladenen Entity ermittelt (nicht vom
    // Client vertrauenswürdig übernommen), damit keine fremden Spieler über
    // einen gespooften oldName-Parameter umbenannt werden können (IDOR).
    const oldName = (player.name || `${player.first_name || ''} ${player.last_name || ''}`.trim()).trim();
    if (!oldName || oldName === newName) {
      return Response.json({ error: 'Nothing to rename' }, { status: 400 });
    }

    const updated = { scores: 0, results: 0, schedules: 0, teams: 0 };

    // 1. TournamentScore
    const scores = await base44.asServiceRole.entities.TournamentScore.filter({ player_name: oldName });
    for (const s of scores) {
      await base44.asServiceRole.entities.TournamentScore.update(s.id, { player_name: newName });
      updated.scores++;
    }

    // 2. TournamentResult
    const results = await base44.asServiceRole.entities.TournamentResult.filter({ player_name: oldName });
    for (const r of results) {
      await base44.asServiceRole.entities.TournamentResult.update(r.id, { player_name: newName });
      updated.results++;
    }

    // 3. TournamentSchedule
    const schedules = await base44.asServiceRole.entities.TournamentSchedule.filter({ player_name: oldName });
    for (const s of schedules) {
      await base44.asServiceRole.entities.TournamentSchedule.update(s.id, { player_name: newName });
      updated.schedules++;
    }

    // 4. Teams – check all 4 player slots
    const allTeams = await base44.asServiceRole.entities.Team.list();
    for (const team of allTeams) {
      const patch = {};
      if (team.player1 === oldName) patch.player1 = newName;
      if (team.player2 === oldName) patch.player2 = newName;
      if (team.player3 === oldName) patch.player3 = newName;
      if (team.player4 === oldName) patch.player4 = newName;
      if (Object.keys(patch).length > 0) {
        await base44.asServiceRole.entities.Team.update(team.id, patch);
        updated.teams++;
      }
    }

    return Response.json({ success: true, updated });
  } catch (error) {
    console.error('renamePlayer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});