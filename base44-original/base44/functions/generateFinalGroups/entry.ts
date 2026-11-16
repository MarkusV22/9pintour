import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { body = await req.json(); } catch {}
    const { season_id, top_n } = body;
    const topN = top_n || 30;

    // Fetch all tournaments
    const tournaments = await base44.asServiceRole.entities.Tournament.list('-date', 500);

    // Fetch active season for date-based filtering (matches Ranking page logic)
    let season = null;
    if (season_id) {
      const seasons = await base44.asServiceRole.entities.Season.list('-created_date', 100);
      season = seasons.find(s => s.id === season_id);
    }

    // Filter by season date range (same logic as Ranking page)
    const seasonTournaments = season
      ? tournaments.filter(t => {
          if (!t.date) return false;
          const d = t.date.slice(0, 10);
          return d >= season.start_date && d <= season.end_date;
        })
      : tournaments;

    // Only finished, non-final tournaments count towards ranking
    const finishedTournaments = seasonTournaments.filter(t =>
      t.status === 'abgeschlossen' && t.mode !== 'final'
    );

    // Fetch all scores
    const allScores = await base44.asServiceRole.entities.TournamentScore.list('-created_date', 5000);

    // Fetch all players
    const players = await base44.asServiceRole.entities.Player.list('name', 9999);
    const playerMap = {};
    players.forEach(p => { playerMap[p.id] = p; });

    // Points table (must match tournamentPoints.js exactly)
    const PLACEMENT_GROUPS = [
      { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 },
      { from: 4, to: 5 }, { from: 6, to: 7 }, { from: 8, to: 10 },
      { from: 11, to: 15 }, { from: 16, to: 20 }, { from: 21, to: 25 },
      { from: 26, to: 30 }, { from: 31, to: 35 }, { from: 36, to: 40 },
      { from: 41, to: 50 }, { from: 51, to: 60 }, { from: 61, to: 70 },
    ];
    const POINTS_TABLE = {
      'Grand Slam':   [2000,1200,720,480,300,200,120,80,50,30,20,15,10,5,1],
      'Masters 1000': [1000,600,360,240,150,100,60,40,25,15,10,8,5,2,1],
      'Masters 500':  [500,300,180,120,75,50,30,20,12,8,5,4,2,1,0],
      'Masters 250':  [250,150,90,60,38,25,15,10,6,4,3,2,1,0,0],
      'Challenger':   [125,75,45,30,19,13,8,5,3,2,1,0,0,0,0],
    };

    function getPoints(tier, placement) {
      const table = POINTS_TABLE[tier] || POINTS_TABLE['Masters 250'];
      const groupIndex = PLACEMENT_GROUPS.findIndex(g => placement >= g.from && placement <= g.to);
      if (groupIndex === -1) return 0;
      return table[groupIndex] ?? 0;
    }

    function buildRanking(category) {
      const playerPoints = {};
      const playerTournaments = {};
      const playerBestScore = {};

      finishedTournaments.forEach(tournament => {
        const tier = tournament.tier || 'Masters 250';
        const catScores = allScores.filter(s => {
          if (!s.player_id || s.score == null) return false;
          if (s.tournament_id !== tournament.id) return false;
          // Only group phase scores (exclude KO scores from final tournaments)
          if (s.group && s.group.startsWith('KO-')) return false;
          const playerCategory = playerMap[s.player_id]?.category;
          if (playerCategory) return playerCategory === category;
          return s.category === category;
        });

        // Best score per player in this tournament
        const playerBest = {};
        catScores.forEach(s => {
          if (playerBest[s.player_id] === undefined || s.score > playerBest[s.player_id]) {
            playerBest[s.player_id] = s.score;
          }
        });

        const ranked = Object.entries(playerBest).sort((a, b) => b[1] - a[1]);
        ranked.forEach(([playerId], i) => {
          const pts = getPoints(tier, i + 1);
          playerPoints[playerId] = (playerPoints[playerId] || 0) + pts;
          playerTournaments[playerId] = (playerTournaments[playerId] || 0) + 1;
          if (playerBestScore[playerId] === undefined || playerBest[playerId] > playerBestScore[playerId]) {
            playerBestScore[playerId] = playerBest[playerId];
          }
        });
      });

      return Object.entries(playerPoints)
        .map(([playerId, points]) => ({
          player_id: playerId,
          name: playerMap[playerId]
            ? `${playerMap[playerId].first_name} ${playerMap[playerId].last_name}`.trim()
            : 'Unbekannt',
          points,
          tournaments: playerTournaments[playerId] || 0,
          best_score: playerBestScore[playerId] || 0,
        }))
        .sort((a, b) => b.points - a.points || b.tournaments - a.tournaments);
    }

    const herren = buildRanking('Herren').slice(0, topN);
    const damen = buildRanking('Damen').slice(0, topN);

    return Response.json({ herren, damen });
  } catch (error) {
    console.error('generateFinalGroups error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});