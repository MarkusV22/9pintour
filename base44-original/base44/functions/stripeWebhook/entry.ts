import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      return Response.json({ error: 'Signature oder Secret fehlt' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    // ── Werbefrei: Abo beendet → Premium entziehen ──
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userEmail = sub.metadata?.premium_user_email;
      if (userEmail) {
        const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        if (users[0]) {
          await base44.asServiceRole.entities.User.update(users[0].id, {
            premium_type: null,
            premium_expires_at: null,
          });
          console.log(`Premium deactivated for ${userEmail} (subscription deleted)`);
        }
      }
      return Response.json({ received: true });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // ── Werbefrei-Upgrade aktivieren ──
      const premiumMode = session.metadata?.premium_mode;
      if (premiumMode) {
        const userEmail = session.metadata?.premium_user_email;
        if (userEmail) {
          const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
          if (users[0]) {
            let expiresAt = null;
            if (premiumMode === 'yearly') {
              const d = new Date();
              d.setFullYear(d.getFullYear() + 1);
              expiresAt = d.toISOString();
            }
            await base44.asServiceRole.entities.User.update(users[0].id, {
              premium_type: premiumMode,
              premium_expires_at: expiresAt,
            });
            console.log(`Premium ${premiumMode} activated for ${userEmail}`);
          }
        }
        return Response.json({ received: true });
      }

      const teamId = session.metadata?.team_id;
      const playerId = session.metadata?.player_id;
      const paymentMode = session.metadata?.payment_mode || 'player';
      const tournamentId = session.metadata?.tournament_id;

      if (paymentMode === 'einzelstarter' && tournamentId && playerId) {
        // Einzelstarter online payment – mark player as paid on the tournament
        const tournament = await base44.asServiceRole.entities.Tournament.get(tournamentId);
        const onlinePaidIds = JSON.parse(tournament?.einzelstarter_online_paid_ids || '[]');
        if (!onlinePaidIds.includes(playerId)) {
          onlinePaidIds.push(playerId);
        }
        await base44.asServiceRole.entities.Tournament.update(tournamentId, {
          einzelstarter_online_paid_ids: JSON.stringify(onlinePaidIds)
        });
        console.log(`Einzelstarter ${playerId} marked as online paid in tournament ${tournamentId}`);
      } else if (teamId) {
        const team = await base44.asServiceRole.entities.Team.get(teamId);

        if (paymentMode === 'team') {
          // Mannschaft zahlt Restbetrag – markiere nur die offenen Spieler als online bezahlt
          const allPlayerIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
          const existingOnlinePaidIds = JSON.parse(team?.online_paid_player_ids || '[]');
          const paidCashIds = JSON.parse(team?.paid_player_ids || '[]');
          const unpaidPlayerIds = JSON.parse(session.metadata?.unpaid_player_ids || '[]');
          const newOnlinePaidIds = [...new Set([...existingOnlinePaidIds, ...unpaidPlayerIds])];
          const allPaid = allPlayerIds.every(id => newOnlinePaidIds.includes(id) || paidCashIds.includes(id));
          await base44.asServiceRole.entities.Team.update(teamId, {
            payment_status: allPaid ? 'paid' : 'pending',
            online_paid_player_ids: JSON.stringify(newOnlinePaidIds)
          });
          console.log(`Team ${teamId} paid online for ${unpaidPlayerIds.length} players`);
        } else if (playerId) {
          // Einzelspieler zahlt
          const onlinePaidIds = JSON.parse(team?.online_paid_player_ids || '[]');
          if (!onlinePaidIds.includes(playerId)) {
            onlinePaidIds.push(playerId);
          }
          await base44.asServiceRole.entities.Team.update(teamId, {
            online_paid_player_ids: JSON.stringify(onlinePaidIds)
          });
          console.log(`Player ${playerId} in team ${teamId} marked as online paid`);
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return Response.json({ error: error.message }, { status: 400 });
  }
});