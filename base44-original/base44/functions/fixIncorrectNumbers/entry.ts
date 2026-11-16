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
    
    // Find Herren with 2xxxxx numbers (should start with 1)
    const problematicHerren = allPlayers.filter(p => 
      p.category === 'Herren' && p.number && String(p.number).startsWith('2')
    );

    if (problematicHerren.length === 0) {
      return Response.json({
        success: true,
        message: 'Keine fehlerhaften Herrennummern gefunden.',
        fixed: 0,
      });
    }

    // Get existing Herren numbers that start with 1
    const correctHerrenNumbers = allPlayers
      .filter(p => p.category === 'Herren' && p.number && String(p.number).startsWith('1'))
      .map(p => p.number);
    
    const maxHerrenNumber = correctHerrenNumbers.length > 0 
      ? Math.max(...correctHerrenNumbers) 
      : 10099;

    let fixed = 0;
    for (let i = 0; i < problematicHerren.length; i++) {
      const newNumber = maxHerrenNumber + 1 + i;
      await base44.asServiceRole.entities.Player.update(problematicHerren[i].id, { number: newNumber });
      fixed++;
      await sleep(250);
    }

    return Response.json({
      success: true,
      message: `${fixed} fehlerhafte Herrennummern (2xxxxx) wurden korrigiert.`,
      fixed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});