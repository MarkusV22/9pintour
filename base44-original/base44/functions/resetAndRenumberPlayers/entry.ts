import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Fetch all players
    const allPlayers = await base44.asServiceRole.entities.Player.list('created_date', 99999);
    
    // Prepare updates: clear + assign in one pass per category to minimize API calls
    const herren = allPlayers
      .filter(p => p.category === 'Herren')
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    
    const damen = allPlayers
      .filter(p => p.category === 'Damen')
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    let cleared = 0;
    let herrenUpdated = 0;
    let damenUpdated = 0;

    // Process Herren: clear + renumber with delay between each
    for (let i = 0; i < herren.length; i++) {
      const newNumber = 10100 + i;
      await base44.asServiceRole.entities.Player.update(herren[i].id, { number: newNumber });
      herrenUpdated++;
      if (herren[i].number) cleared++;
      await sleep(200);
    }

    // Process Damen: clear + renumber with delay between each
    for (let i = 0; i < damen.length; i++) {
      const newNumber = 20100 + i;
      await base44.asServiceRole.entities.Player.update(damen[i].id, { number: newNumber });
      damenUpdated++;
      if (damen[i].number) cleared++;
      await sleep(200);
    }

    return Response.json({
      success: true,
      message: `${cleared} Nummern gelöscht. ${herrenUpdated} Herrennummern (10100+) und ${damenUpdated} Damennummern (20100+) neu vergeben.`,
      cleared,
      herrenUpdated,
      damenUpdated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});