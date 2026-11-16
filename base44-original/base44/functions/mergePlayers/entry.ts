import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'turnier_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { keepId, removeId } = await req.json();
    if (!keepId || !removeId || keepId === removeId) {
      return Response.json({ error: 'keepId and removeId required and must differ' }, { status: 400 });
    }

    const keepPlayer = await base44.asServiceRole.entities.Player.get(keepId);
    if (!keepPlayer) {
      return Response.json({ error: 'Keep player not found' }, { status: 404 });
    }

    // Try to get remove player — might already be deleted (repair case)
    let removePlayer = null;
    try {
      removePlayer = await base44.asServiceRole.entities.Player.get(removeId);
    } catch {
      // Player already deleted — this is a repair operation
    }

    const isRepair = !removePlayer;

    // Copy missing fields from remove to keep
    if (removePlayer) {
      const patch = {};
      if (!keepPlayer.photo_url && removePlayer.photo_url) patch.photo_url = removePlayer.photo_url;
      if (!keepPlayer.club && removePlayer.club) patch.club = removePlayer.club;
      if (!keepPlayer.age_class && removePlayer.age_class) patch.age_class = removePlayer.age_class;
      if (!keepPlayer.user_email && removePlayer.user_email) patch.user_email = removePlayer.user_email;
      if (!keepPlayer.phone && removePlayer.phone) patch.phone = removePlayer.phone;
      if (!keepPlayer.birth_date && removePlayer.birth_date) patch.birth_date = removePlayer.birth_date;
      if (!keepPlayer.whatsapp && removePlayer.whatsapp) patch.whatsapp = removePlayer.whatsapp;
      if (!keepPlayer.personal_best && removePlayer.personal_best) patch.personal_best = removePlayer.personal_best;
      if (Object.keys(patch).length > 0) {
        await base44.asServiceRole.entities.Player.update(keepId, patch);
      }
    }

    // Update all references from removeId to keepId
    // TournamentScore
    let hasMore = true;
    while (hasMore) {
      const res = await base44.asServiceRole.entities.TournamentScore.updateMany(
        { player_id: removeId },
        { $set: { player_id: keepId } }
      );
      hasMore = res.has_more;
    }

    // TournamentSchedule
    hasMore = true;
    while (hasMore) {
      const res = await base44.asServiceRole.entities.TournamentSchedule.updateMany(
        { player_id: removeId },
        { $set: { player_id: keepId } }
      );
      hasMore = res.has_more;
    }

    // TournamentResult
    hasMore = true;
    while (hasMore) {
      const res = await base44.asServiceRole.entities.TournamentResult.updateMany(
        { player_id: removeId },
        { $set: { player_id: keepId } }
      );
      hasMore = res.has_more;
    }

    // Team — 4 separate player slots
    for (const slot of ['player1_id', 'player2_id', 'player3_id', 'player4_id', 'player5_id', 'player6_id']) {
      hasMore = true;
      while (hasMore) {
        const res = await base44.asServiceRole.entities.Team.updateMany(
          { [slot]: removeId },
          { $set: { [slot]: keepId } }
        );
        hasMore = res.has_more;
      }
    }

    // Delete the removed player (if still exists)
    if (removePlayer) {
      await base44.asServiceRole.entities.Player.delete(removeId);
    }

    // Log the merge
    const keepName = keepPlayer.name || `${keepPlayer.first_name || ''} ${keepPlayer.last_name || ''}`.trim();
    const removeName = removePlayer
      ? (removePlayer.name || `${removePlayer.first_name || ''} ${removePlayer.last_name || ''}`.trim())
      : '(bereits gelöscht)';

    await base44.asServiceRole.entities.PlayerMerge.create({
      keep_player_id: keepId,
      remove_player_id: removeId,
      keep_player_name: keepName,
      remove_player_name: removeName,
      keep_player_number: keepPlayer.number || null,
      remove_player_number: removePlayer?.number || null,
      performed_by: user.email || user.id,
      is_repair: isRepair
    });

    return Response.json({
      success: true,
      keepId,
      removeId,
      wasRepair: isRepair,
      keepPlayerName: keepName,
      removePlayerName: removeName
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});