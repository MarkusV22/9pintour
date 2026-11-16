import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht angemeldet' }, { status: 401 });

    const email = (user.email || '').trim().toLowerCase();
    if (!email) return Response.json({ subscribed: false, is_active: false });

    const all = await base44.asServiceRole.entities.NewsletterSubscriber.list('-created_date', 10000);
    const existing = all.find(s => (s.email || '').toLowerCase() === email);

    return Response.json({
      subscribed: !!existing,
      is_active: existing?.is_active || false,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});