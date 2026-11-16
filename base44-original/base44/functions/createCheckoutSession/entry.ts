import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { body = await req.json(); } catch {}

    const { team_id, tournament_id, success_url, cancel_url, mode, player_id, premium_type, price_id } = body;

    // Aufrufer authentifizieren (public app → auth.me() kann null/throw liefern)
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    // ── Werbefrei-Upgrade (jährlich / lebenslang) ──
    if (mode === 'premium') {
      // Login erforderlich, damit das Abo dem richtigen Konto zugeordnet wird
      if (!user || !user.email) {
        return Response.json({ error: 'Anmeldung erforderlich' }, { status: 401 });
      }
      if (!premium_type || !price_id) {
        return Response.json({ error: 'premium_type und price_id erforderlich' }, { status: 400 });
      }
      // price_id serverseitig gegen die in AppSetting hinterlegten offiziellen Preis-IDs validieren
      const settingKey = premium_type === 'yearly' ? 'ads_premium_yearly_price_id'
        : premium_type === 'lifetime' ? 'ads_premium_lifetime_price_id' : null;
      if (!settingKey) {
        return Response.json({ error: 'Ungültiger premium_type' }, { status: 400 });
      }
      const priceSettings = await base44.asServiceRole.entities.AppSetting.filter({ key: settingKey });
      const allowedPriceId = priceSettings[0]?.value;
      if (!allowedPriceId || allowedPriceId !== price_id) {
        return Response.json({ error: 'Ungültige Preis-ID' }, { status: 400 });
      }
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
      const isYearly = premium_type === 'yearly';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: price_id, quantity: 1 }],
        mode: isYearly ? 'subscription' : 'payment',
        customer_email: user.email,
        success_url: success_url || `https://app.base44.com/player-profile`,
        cancel_url: cancel_url || `https://app.base44.com/player-profile`,
        metadata: {
          premium_mode: premium_type,
          premium_user_email: user.email,
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
        },
        ...(isYearly ? {
          subscription_data: {
            metadata: {
              premium_mode: premium_type,
              premium_user_email: user.email,
              base44_app_id: Deno.env.get('BASE44_APP_ID'),
            },
          },
        } : {}),
      });
      return Response.json({ url: session.url });
    }

    if (!tournament_id) {
      return Response.json({ error: 'tournament_id erforderlich' }, { status: 400 });
    }

    if (!team_id && !player_id) {
      return Response.json({ error: 'team_id oder player_id erforderlich' }, { status: 400 });
    }

    const isEinzelstarter = !team_id && player_id;

    // Fetch tournament payment config
    const tournament = await base44.asServiceRole.entities.Tournament.get(tournament_id);
    if (!tournament) {
      return Response.json({ error: 'Turnier nicht gefunden' }, { status: 404 });
    }

    if (!tournament.payment_enabled) {
      return Response.json({ error: 'Zahlung für dieses Turnier nicht aktiviert' }, { status: 400 });
    }

    // Global online payment toggle (turnier_admin can enable/disable)
    const globalSetting = await base44.asServiceRole.entities.AppSetting.filter({ key: 'online_payment_enabled' });
    const globalPaymentEnabled = globalSetting.length === 0 || globalSetting[0].value !== 'false';
    if (!globalPaymentEnabled) {
      return Response.json({ error: 'Online-Zahlung ist global deaktiviert' }, { status: 403 });
    }

    // Fetch global tour-fee (fixed amount per player in cents)
    const tourFeeSetting = await base44.asServiceRole.entities.AppSetting.filter({ key: 'tour_fee_cents' });
    const tourFeeCents = tourFeeSetting.length > 0 ? (parseInt(tourFeeSetting[0].value, 10) || 0) : 0;

    const baseAmount = tournament.payment_amount || 0;
    const currency = tournament.payment_currency || 'eur';
    const teamSize = tournament.team_size || 4;
    const perPlayerAmount = Math.round(baseAmount / teamSize);

    if (baseAmount <= 0) {
      return Response.json({ error: 'Ungültiger Betrag' }, { status: 400 });
    }

    let amount = baseAmount;
    let productName;
    let productDescription;
    let teamUnpaidPlayerIds = null;
    let payingPlayerCount = 1;

    if (isEinzelstarter) {
      const player = await base44.asServiceRole.entities.Player.get(player_id);
      const playerName = player ? `${player.first_name} ${player.last_name}`.trim() : 'Einzelstarter';
      productName = `Startplatz Einzelstarter: ${playerName}`;
      productDescription = `Turnier: ${tournament.name}`;
      const ezBase = tournament.payment_amount_einzelstarter || tournament.payment_amount || 0;
      amount = ezBase + tourFeeCents;
      payingPlayerCount = 1;
    } else {
      // Fetch team for the product name
      const team = await base44.asServiceRole.entities.Team.get(team_id);
      if (!team) {
        return Response.json({ error: 'Mannschaft nicht gefunden' }, { status: 404 });
      }

      if (mode === 'team') {
        const allPlayerIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
        const paidCashIds = JSON.parse(team.paid_player_ids || '[]');
        const onlinePaidIds = JSON.parse(team.online_paid_player_ids || '[]');
        const unpaidPlayerIds = allPlayerIds.filter(id => !paidCashIds.includes(id) && !onlinePaidIds.includes(id));
        if (unpaidPlayerIds.length === 0) {
          return Response.json({ error: 'Alle Spieler bereits bezahlt' }, { status: 400 });
        }
        payingPlayerCount = unpaidPlayerIds.length;
        amount = (perPlayerAmount + tourFeeCents) * unpaidPlayerIds.length;
        productName = `Startgebühr Mannschaft (Restbetrag): ${team.name}`;
        productDescription = `Turnier: ${tournament.name} – ${unpaidPlayerIds.length} von ${allPlayerIds.length} Spielern offen`;
        teamUnpaidPlayerIds = unpaidPlayerIds;
      } else {
        amount = perPlayerAmount + tourFeeCents;
        payingPlayerCount = 1;
        productName = `Startplatz: ${team.name}`;
        productDescription = `Turnier: ${tournament.name} – individuell`;
      }
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: productName,
            description: productDescription,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: success_url || `https://app.base44.com/tournaments/${tournament_id}`,
      cancel_url: cancel_url || `https://app.base44.com/tournaments/${tournament_id}`,
      metadata: {
        team_id: team_id || '',
        tournament_id,
        payment_mode: isEinzelstarter ? 'einzelstarter' : (mode || 'player'),
        player_id: player_id || '',
        unpaid_player_ids: teamUnpaidPlayerIds ? JSON.stringify(teamUnpaidPlayerIds) : '',
        tour_fee_cents: String(tourFeeCents),
        paying_player_count: String(payingPlayerCount),
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
      },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});