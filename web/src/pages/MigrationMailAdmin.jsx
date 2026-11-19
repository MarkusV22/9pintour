// Admin: Umzugs-Mail an alle Nutzer, die sich in der neuen App noch nicht angemeldet haben
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin } from '@/lib/roles';
import { api } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function MigrationMailAdmin() {
  const { user } = useAuth();
  const { data, refetch, isLoading } = useQuery({ queryKey: ['migration-mail'], queryFn: () => api('/admin/migration-mail'), enabled: isAdmin(user) });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  if (!isAdmin(user)) return <div className="p-6 md:p-8 max-w-4xl mx-auto"><div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Nur für Admins.</div></div>;

  const run = async (test) => {
    if (!test && !window.confirm(`Umzugs-Mail jetzt an ${Math.min(95, data?.pending ?? 0)} Nutzer schicken?`)) return;
    setBusy(test ? 'test' : 'send'); setMsg('');
    try {
      const r = await api('/admin/migration-mail', { method: 'POST', body: test ? { test: true } : {} });
      setMsg(test ? `Testmail an ${r.to} geschickt (${r.mail}).` : `${r.sent} Mails verschickt, noch ${r.pending} offen.`);
      refetch();
    } catch (e) { setMsg(e.message); }
    setBusy(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Mail className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Umzugs-Mail</h1>
          <p className="text-sm text-muted-foreground">Passwort-Link an alle, die sich in der neuen App noch nicht angemeldet haben (Link 3 Wochen gültig).</p>
        </div>
      </div>

      {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[['Noch nicht angeschrieben', data.pending], ['Angeschrieben', data.sent], ['Schon angemeldet', data.moved]].map(([l, n]) => (
              <div key={l} className="bg-card border border-border rounded-xl p-4"><div className="text-2xl font-bold">{n}</div><div className="text-xs text-muted-foreground">{l}</div></div>
            ))}
          </div>
          {!data.mail_ready && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">Mailversand ist noch nicht eingerichtet (RESEND_API_KEY fehlt).</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run(true)} disabled={!!busy} className="gap-2">{busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />}Testmail an mich</Button>
            <Button onClick={() => run(false)} disabled={!!busy || !data.pending || !data.mail_ready} className="gap-2">{busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}An alle offenen schicken</Button>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
          {data.recipients?.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground bg-muted/40"><th className="text-left px-4 py-2">Empfänger</th><th className="text-left px-4 py-2">Verschickt</th><th className="text-left px-4 py-2">Angemeldet</th></tr></thead>
                <tbody>{data.recipients.map((r) => (
                  <tr key={r.email} className="border-t border-border">
                    <td className="px-4 py-1.5">{r.full_name || r.email}<span className="text-muted-foreground text-xs ml-2">{r.email}</span></td>
                    <td className="px-4 py-1.5 text-xs">{new Date(r.sent_at).toLocaleString('de-AT')}</td>
                    <td className="px-4 py-1.5">{r.moved ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : '–'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
