import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Trash2, Send, Plus, Search, Users, CheckCircle, XCircle, Power } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { useNewsletterEnabled } from '@/lib/useNewsletterEnabled';
import { Switch } from '@/components/ui/switch';

export default function NewsletterAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isEnabled, toggle: setNewsletterEnabled, isToggling } = useNewsletterEnabled();
  const [search, setSearch] = useState('');
  const [selectedTournament, setSelectedTournament] = useState('');
  const [sendType, setSendType] = useState('published');
  const [sendStatus, setSendStatus] = useState(null);
  const [newEmail, setNewEmail] = useState('');

  const { data: subscribers = [], isLoading } = useQuery({
    queryKey: ['newsletter-subscribers'],
    queryFn: () => base44.entities.NewsletterSubscriber.list('-created_date', 10000),
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments-for-newsletter'],
    queryFn: () => base44.entities.Tournament.list('-date', 200),
  });

  const filtered = subscribers.filter(s =>
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.name?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = subscribers.filter(s => s.is_active).length;

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.NewsletterSubscriber.update(id, { is_active: !is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['newsletter-subscribers'] }),
  });

  const deleteSub = useMutation({
    mutationFn: (id) => base44.entities.NewsletterSubscriber.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['newsletter-subscribers'] }),
  });

  const addSub = useMutation({
    mutationFn: (email) => base44.functions.invoke('subscribeNewsletter', { email, source: 'admin' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-subscribers'] });
      setNewEmail('');
    },
  });

  const sendNewsletter = useMutation({
    mutationFn: ({ type, tournament_id }) => {
      const fnName = type === 'published' ? 'onTournamentPublished' : 'onTournamentFinished';
      return base44.functions.invoke(fnName, { tournament_id });
    },
    onSuccess: (res) => {
      setSendStatus({ type: 'success', message: `${res.data?.sent || 0} E-Mails versendet (von ${res.data?.total || 0} Abonnenten)` });
    },
    onError: (err) => {
      setSendStatus({ type: 'error', message: err?.response?.data?.error || 'Versand fehlgeschlagen' });
    },
  });

  if (!isTurnierAdmin(user)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Kein Zugriff – nur für Administratoren.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Newsletter</h1>
        <p className="text-muted-foreground mt-1 text-sm">Abonnenten verwalten und Newsletter manuell versenden.</p>
      </div>

      {/* Aktivieren / Deaktivieren */}
      <div className="flex items-center justify-between gap-4 border border-border rounded-2xl p-4 bg-card">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
            <Power className={`w-4 h-4 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Newsletter aktiv</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isEnabled
                ? 'Neue Anmeldungen werden auf dem Dashboard angeboten und im Backend akzeptiert.'
                : 'Newsletter ist deaktiviert – das Anmelde-Widget ist ausgeblendet, neue Anmeldungen werden blockiert.'}
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          disabled={isToggling}
          onCheckedChange={(v) => setNewsletterEnabled(v)}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Abonnenten gesamt</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{subscribers.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm text-muted-foreground">Aktiv</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{activeCount}</p>
        </div>
      </div>

      {/* Manual send */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" />
          Newsletter manuell versenden
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Typ</label>
            <select
              value={sendType}
              onChange={e => setSendType(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="published">Neues Turnier</option>
              <option value="finished">Ergebnisse</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Turnier</label>
            <select
              value={selectedTournament}
              onChange={e => setSelectedTournament(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Turnier auswählen...</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.date?.slice(0, 10)})</option>
              ))}
            </select>
          </div>
        </div>
        <Button
          onClick={() => sendNewsletter.mutate({ type: sendType, tournament_id: selectedTournament })}
          disabled={!selectedTournament || sendNewsletter.isPending}
          className="gap-2"
        >
          {sendNewsletter.isPending ? (
            <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />Wird versendet...</>
          ) : (
            <><Send className="w-4 h-4" />Newsletter versenden</>
          )}
        </Button>
        {sendStatus && (
          <div className={`text-sm rounded-lg px-4 py-2.5 ${sendStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-destructive/5 text-destructive border border-destructive/20'}`}>
            {sendStatus.message}
          </div>
        )}
      </section>

      {/* Add subscriber */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          Abonnent hinzufügen
        </h2>
        <div className="flex gap-2">
          <Input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="E-Mail-Adresse"
            className="flex-1"
          />
          <Button onClick={() => addSub.mutate(newEmail)} disabled={!newEmail.trim() || addSub.isPending}>
            Hinzufügen
          </Button>
        </div>
      </section>

      {/* Subscriber list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-foreground">Abonnenten</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="pl-9 w-48"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border">
            <Mail className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Keine Abonnenten gefunden.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">E-Mail</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Name</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Quelle</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(sub => (
                  <tr key={sub.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-sm text-foreground">{sub.email}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{sub.name || '–'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{sub.source || '–'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive.mutate({ id: sub.id, is_active: sub.is_active })}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${sub.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
                      >
                        {sub.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {sub.is_active ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => { if (confirm('Abonnent löschen?')) deleteSub.mutate(sub.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}