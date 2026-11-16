import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all players
    const allPlayers = await base44.asServiceRole.entities.Player.list('created_date', 99999);

    // Separate by category and filter only players without numbers
    const herrenWithoutNumber = allPlayers
      .filter(p => p.category === 'Herren' && !p.number)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const damenWithoutNumber = allPlayers
      .filter(p => p.category === 'Damen' && !p.number)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    // Get the highest existing numbers to continue from
    const herrenWithNumber = allPlayers.filter(p => p.category === 'Herren' && p.number);
    const damenWithNumber = allPlayers.filter(p => p.category === 'Damen' && p.number);

    const herrenMax = herrenWithNumber.length > 0 
      ? Math.max(...herrenWithNumber.map(p => p.number)) 
      : 10099;
    const damenMax = damenWithNumber.length > 0 
      ? Math.max(...damenWithNumber.map(p => p.number)) 
      : 20099;

    // Assign numbers
    let herrenUpdated = 0;
    let damenUpdated = 0;

    // Herren: 5-stellig mit 1 beginnend (10100+), erste 100 frei (10000-10099)
    for (let i = 0; i < herrenWithoutNumber.length; i++) {
      const newNumber = Math.max(herrenMax + 1, 10100) + i;
      await base44.asServiceRole.entities.Player.update(herrenWithoutNumber[i].id, { number: newNumber });
      herrenUpdated++;
    }

    // Damen: 5-stellig mit 2 beginnend (20100+), erste 100 frei (20000-20099)
    for (let i = 0; i < damenWithoutNumber.length; i++) {
      const newNumber = Math.max(damenMax + 1, 20100) + i;
      await base44.asServiceRole.entities.Player.update(damenWithoutNumber[i].id, { number: newNumber });
      damenUpdated++;
    }

    return Response.json({
      success: true,
      message: `${herrenUpdated} Herrennummern (10099+) und ${damenUpdated} Damennummern (20099+) zugewiesen. (Erste 99 pro Kategorie reserviert)`,
      herrenUpdated,
      damenUpdated,
      totalPlayers: allPlayers.length,
      herrenRange: '10000-10098 (reserviert), 10099+ (zugewiesen)',
      damenRange: '20000-20098 (reserviert), 20099+ (zugewiesen)',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});