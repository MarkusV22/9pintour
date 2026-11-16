import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'turnier_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const teams = await base44.asServiceRole.entities.Team.list('-created_date', 9999);
    const players = await base44.asServiceRole.entities.Player.list('name', 9999);
    const playerMap: Record<string, any> = {};
    players.forEach(p => { playerMap[p.id] = p; });

    const tournaments = await base44.asServiceRole.entities.Tournament.list('-date', 9999);
    const tournamentMap: Record<string, any> = {};
    tournaments.forEach(t => { tournamentMap[t.id] = t; });

    const playerFields = ['player1_id', 'player2_id', 'player3_id', 'player4_id', 'player5_id', 'player6_id'];

    const computeCategory = (team: any, allowedCategories: string[], mixedCombinations: any[]) => {
      const ids = playerFields.map(f => team[f]).filter(Boolean);
      if (ids.length === 0) return null;
      const teamPlayers = ids.map((id: string) => playerMap[id]).filter(Boolean);
      if (teamPlayers.length === 0) return null;
      const d = teamPlayers.filter(p => p.category === 'Damen').length;
      const h = teamPlayers.filter(p => p.category === 'Herren').length;
      // Only apply logic when all players match a full team (match tournament team_size or 4)
      const teamSize = tournamentMap[team.tournament_id]?.team_size || 4;
      if (teamPlayers.length !== teamSize) return null;
      // Turnierspezifische Mixed-Kombinationen (überschreibt systemweite Logik)
      if (mixedCombinations && mixedCombinations.length > 0 && allowedCategories.includes('Mixed')) {
        if (mixedCombinations.some(c => c.damen === d && c.herren === h)) return 'Mixed';
        if (d === teamSize) return 'Damen';
        return 'Herren';
      }
      if (teamSize === 4 && allowedCategories.includes('Mixed')) {
        if (d === 4) return 'Damen';            // 4D = Damen
        if (h === 4) return 'Herren';          // 4H = Herren
        if (d === 3 && h === 1) return 'Mixed'; // 3D+1H = Mixed
        if (d === 2 && h === 2) return 'Mixed'; // 2D+2H = Mixed
        if (d === 1 && h === 3) return 'Herren'; // 1D+3H = Herren
      }
      if (teamSize === 4) {
        // Ohne Mixed-Wertung: 4D = Damen, alle anderen = Herren
        if (d === 4) return 'Damen';
        return 'Herren';
      }
      // Andere Team-Größen: alle Damen = Damen, sonst Herren
      if (d === teamSize) return 'Damen';
      return 'Herren';
    };

    const toUpdate: any[] = [];
    teams.forEach(team => {
      const tournament = tournamentMap[team.tournament_id];
      let allowedCategories = ['Herren', 'Damen', 'Mixed'];
      try {
        if (tournament?.allowed_categories) {
          allowedCategories = JSON.parse(tournament.allowed_categories);
        }
      } catch {}
      let mixedCombinations: any[] = [];
      try {
        if (tournament?.mixed_combinations) {
          const m = JSON.parse(tournament.mixed_combinations);
          if (Array.isArray(m)) mixedCombinations = m;
        }
      } catch {}
      const computed = computeCategory(team, allowedCategories, mixedCombinations);
      if (computed && computed !== team.category) {
        toUpdate.push({ id: team.id, old: team.category, new: computed, name: team.name });
      }
    });

    // Apply updates (service role)
    let updated = 0;
    for (const item of toUpdate) {
      await base44.asServiceRole.entities.Team.update(item.id, { category: item.new });
      updated++;
    }

    return Response.json({
      totalTeams: teams.length,
      checked: teams.length,
      corrected: updated,
      details: toUpdate,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}