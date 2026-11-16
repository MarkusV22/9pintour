import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let deleted = 0;
  let offset = 0;
  const BATCH = 200;
  const seen = new Map(); // key -> keep id
  const toDelete = [];

  // Collect all players in batches
  while (true) {
    const batch = await base44.asServiceRole.entities.Player.list('created_date', BATCH, offset);
    if (!batch || batch.length === 0) break;
    for (const p of batch) {
      const name = (p.name || `${p.first_name || ''} ${p.last_name || ''}`).trim().toLowerCase();
      const key = `${name}__${(p.category || '').toLowerCase()}`;
      if (seen.has(key)) {
        toDelete.push(p.id);
      } else {
        seen.set(key, p.id);
      }
    }
    if (batch.length < BATCH) break;
    offset += BATCH;
  }

  // Delete in small batches to avoid timeout
  const CHUNK = 200;
  for (let i = 0; i < Math.min(toDelete.length, CHUNK); i++) {
    await base44.asServiceRole.entities.Player.delete(toDelete[i]);
    deleted++;
  }

  return Response.json({
    total_duplicates: toDelete.length,
    deleted_this_run: deleted,
    remaining_duplicates: toDelete.length - deleted,
    done: toDelete.length <= CHUNK
  });
});