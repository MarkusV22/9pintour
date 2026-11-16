import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Assigns numbers only to players that don't have one yet.
// Herren: starts at 1001 (or max+1 if higher numbers exist)
// Damen:  starts at 2001 (or max+1 if higher numbers exist)

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch ALL players in pages
    const FETCH_BATCH = 500;
    let allPlayers = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Player.filter({}, 'created_date', FETCH_BATCH, skip);
      if (!batch || batch.length === 0) break;
      allPlayers = allPlayers.concat(batch);
      if (batch.length < FETCH_BATCH) break;
      skip += FETCH_BATCH;
    }

    // Determine highest existing number per category
    const herrenNumbers = allPlayers.filter(p => p.category === 'Herren' && p.number).map(p => p.number);
    const damenNumbers  = allPlayers.filter(p => p.category === 'Damen'  && p.number).map(p => p.number);

    let nextHerren = Math.max(1001, herrenNumbers.length > 0 ? Math.max(...herrenNumbers) + 1 : 1001);
    let nextDamen  = Math.max(2001, damenNumbers.length  > 0 ? Math.max(...damenNumbers)  + 1 : 2001);

    // Only players without a number, sorted by created_date
    const toNumber = allPlayers
      .filter(p => !p.number)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    let herrenUpdated = 0;
    let damenUpdated = 0;

    for (let i = 0; i < toNumber.length; i++) {
      const p = toNumber[i];
      const newNumber = p.category === 'Damen' ? nextDamen++ : nextHerren++;
      try {
        await base44.asServiceRole.entities.Player.update(p.id, { number: newNumber });
        if (p.category === 'Damen') damenUpdated++; else herrenUpdated++;
      } catch (e) {
        console.error(`Fehler bei Spieler ${p.id}:`, e.message);
      }
      // Rate limit protection: pause every 10 updates
      if (i > 0 && i % 10 === 0) await new Promise(r => setTimeout(r, 300));
    }

    return Response.json({
      success: true,
      message: `${herrenUpdated} Herren und ${damenUpdated} Damen neu nummeriert.`,
      herrenUpdated,
      damenUpdated,
      totalWithoutNumber: toNumber.length,
      totalPlayers: allPlayers.length,
      done: true,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});