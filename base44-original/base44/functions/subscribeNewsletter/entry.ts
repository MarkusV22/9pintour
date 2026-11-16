import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch {}

    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const source = body.source || 'dashboard';

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Gültige E-Mail-Adresse erforderlich' }, { status: 400 });
    }

    // Newsletter vorübergehend deaktiviert?
    const enabledSetting = await base44.asServiceRole.entities.AppSetting.filter({ key: 'newsletter_enabled' });
    if (enabledSetting[0]?.value === 'false') {
      return Response.json({ error: 'Der Newsletter ist aktuell deaktiviert.' }, { status: 403 });
    }

    // Check for existing subscriber (case-insensitive)
    const all = await base44.asServiceRole.entities.NewsletterSubscriber.list('-created_date', 10000);
    const existing = all.find(s => (s.email || '').toLowerCase() === email);

    if (existing) {
      if (!existing.is_active) {
        await base44.asServiceRole.entities.NewsletterSubscriber.update(existing.id, {
          is_active: true,
          name: name || existing.name,
        });
      }
      return Response.json({ success: true, message: 'Sie sind bereits angemeldet!' });
    }

    await base44.asServiceRole.entities.NewsletterSubscriber.create({
      email,
      name: name || undefined,
      source,
      is_active: true,
    });
    return Response.json({ success: true, message: 'Erfolgreich angemeldet!' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});