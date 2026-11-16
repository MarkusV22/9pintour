import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht angemeldet' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const email = (body.email || user.email || '').trim().toLowerCase();

    if (!email) return Response.json({ error: 'Keine E-Mail-Adresse' }, { status: 400 });

    const all = await base44.asServiceRole.entities.NewsletterSubscriber.list('-created_date', 10000);
    const existing = all.find(s => (s.email || '').toLowerCase() === email);

    if (!existing) {
      return Response.json({ success: true, message: 'Nicht abonniert' });
    }

    await base44.asServiceRole.entities.NewsletterSubscriber.update(existing.id, { is_active: false });
    return Response.json({ success: true, message: 'Erfolgreich abgemeldet' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});