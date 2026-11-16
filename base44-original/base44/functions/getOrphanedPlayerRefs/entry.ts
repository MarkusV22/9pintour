import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'turnier_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load all players
    const allPlayers = [];
    let offset = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Player.list('created_date', 500, offset);
      if (!batch || batch.length === 0) break;
      allPlayers.push(...batch);
      if (batch.length < 500) break;
      offset += 500;
    }
    const playerIds = new Set(allPlayers.map(p => p.id));

    const orphans = {};

    const addToOrphans = (playerId, source) => {
      if (!playerId || playerIds.has(playerId)) return;
      if (!orphans[playerId]) orphans[playerId] = { scores: 0, schedules: 0, results: 0, teams: 0 };
      orphans[playerId][source]++;
    };

    // TournamentScore
    offset = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.TournamentScore.list('created_date', 500, offset);
      if (!batch || batch.length === 0) break;
      batch.forEach(s => addToOrphans(s.player_id, 'scores'));
      if (batch.length < 500) break;
      offset += 500;
    }

    // TournamentSchedule
    offset = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.TournamentSchedule.list('created_date', 500, offset);
      if (!batch || batch.length === 0) break;
      batch.forEach(s => addToOrphans(s.player_id, 'schedules'));
      if (batch.length < 500) break;
      offset += 500;
    }

    // TournamentResult
    offset = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.TournamentResult.list('created_date', 500, offset);
      if (!batch || batch.length === 0) break;
      batch.forEach(r => addToOrphans(r.player_id, 'results'));
      if (batch.length < 500) break;
      offset += 500;
    }

    // Team — 4 slots
    offset = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Team.list('created_date', 500, offset);
      if (!batch || batch.length === 0) break;
      batch.forEach(t => {
        addToOrphans(t.player1_id, 'teams');
        addToOrphans(t.player2_id, 'teams');
        addToOrphans(t.player3_id, 'teams');
        addToOrphans(t.player4_id, 'teams');
        addToOrphans(t.player5_id, 'teams');
        addToOrphans(t.player6_id, 'teams');
      });
      if (batch.length < 500) break;
      offset += 500;
    }

    const orphanList = Object.entries(orphans).map(([id, counts]) => ({
      player_id: id,
      ...counts,
      total: counts.scores + counts.schedules + counts.results + counts.teams
    }));
    orphanList.sort((a, b) => b.total - a.total);

    return Response.json({
      totalOrphans: orphanList.length,
      orphans: orphanList
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});