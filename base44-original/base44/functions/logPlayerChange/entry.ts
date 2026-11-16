import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Wird durch eine Entity-Automation auf der Player-Entität ausgelöst
// (create / update / delete) und protokolliert jede Änderung in der
// PlayerActionLog-Entität, damit jede Datenbankänderung nachvollziehbar ist.

const TRACKED_FIELDS = [
  'first_name', 'last_name', 'number', 'category', 'age_class', 'club',
  'phone', 'whatsapp', 'photo_url', 'birth_date', 'personal_best',
  'walk_on_song', 'user_email', 'privacy_accepted'
];

function playerName(p) {
  if (!p) return '';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || '';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch {}

    const event = body.event || {};
    const data = body.data;
    const oldData = body.old_data;
    const changedFields = Array.isArray(body.changed_fields) ? body.changed_fields : [];
    const eventType = event.type; // 'create' | 'update' | 'delete'
    const playerId = event.entity_id || data?.id || oldData?.id;

    if (!playerId || !eventType) {
      return Response.json({ skipped: true, reason: 'missing player_id or event type' });
    }

    // Best-effort Auflösung des Urhebers. Bei Automations-Ausführung steht
    // der auslösende Nutzer nicht zur Verfügung; wir nehmen den created_by_id
    // des Datensatzes als Hinweis auf den Ersteller des Profils.
    const refRecord = data || oldData;
    let actorId = refRecord?.created_by_id || '';
    let actorName = '';
    let actorEmail = '';
    if (actorId) {
      try {
        const u = await base44.asServiceRole.entities.User.get(actorId);
        actorName = u?.full_name || '';
        actorEmail = u?.email || '';
      } catch {}
    }

    let oldValues = {};
    let newValues = {};
    let changed = [];

    if (eventType === 'create' && data) {
      changed = TRACKED_FIELDS.filter(f => data[f] != null && data[f] !== '');
      newValues = Object.fromEntries(changed.map(f => [f, data[f]]));
    } else if (eventType === 'update' && data) {
      if (changedFields.length) {
        changed = changedFields.filter(f => TRACKED_FIELDS.includes(f));
      } else {
        changed = TRACKED_FIELDS.filter(f => JSON.stringify(oldData?.[f] ?? null) !== JSON.stringify(data[f] ?? null));
      }
      changed.forEach(f => {
        oldValues[f] = oldData?.[f] ?? null;
        newValues[f] = data?.[f] ?? null;
      });
    } else if (eventType === 'delete' && oldData) {
      changed = TRACKED_FIELDS.filter(f => oldData[f] != null && oldData[f] !== '');
      oldValues = Object.fromEntries(changed.map(f => [f, oldData[f]]));
    } else {
      return Response.json({ skipped: true, reason: 'unhandled event configuration' });
    }

    // Leere Änderungen (z.B. Update ohne tracked field) überspringen
    if (eventType !== 'delete' && changed.length === 0) {
      return Response.json({ skipped: true, reason: 'no tracked fields changed' });
    }

    await base44.asServiceRole.entities.PlayerActionLog.create({
      player_id: playerId,
      player_name: playerName(refRecord),
      action: eventType,
      changed_fields: JSON.stringify(changed),
      old_values: JSON.stringify(oldValues),
      new_values: JSON.stringify(newValues),
      actor_id: actorId,
      actor_email: actorEmail,
      actor_name: actorName,
    });

    return Response.json({ success: true, action: eventType, playerId, changed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}