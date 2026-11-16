import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle2, Calendar, Trash2, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default function SeasonAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' });

  const { data: seasons = [], isLoading } = useQuery({
    queryKey: ['seasons'],
    queryFn: () => base44.entities.Season.list('-start_date', 50),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Season.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
      setShowForm(false);
      setForm({ name: '', start_date: '', end_date: '' });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (seasonId) => {
      // Deactivate all
      await Promise.all(seasons.map(s => base44.entities.Season.update(s.id, { is_active: false })));
      // Activate selected
      await base44.entities.Season.update(seasonId, { is_active: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seasons'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Season.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seasons'] }),
  });

  if (!isTurnierAdmin(user)) {
    return <div className="p-8 text-muted-foreground">Kein Zugriff.</div>;
  }

  const activeSeason = seasons.find(s => s.is_active);

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saison-Verwaltung</h1>
          <p className="text-sm text-muted-foreground">Definiere Saisonen und lege die aktive Saison fest.</p>
        </div>
      </div>

      {activeSeason && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
          <div>
            <p className="font-semibold text-foreground text-sm">Aktive Saison: {activeSeason.name}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(activeSeason.start_date), 'dd.MM.yyyy', { locale: de })} – {format(new Date(activeSeason.end_date), 'dd.MM.yyyy', { locale: de })}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {isLoading ? (
          <div className="h-16 bg-muted animate-pulse rounded-xl" />
        ) : seasons.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
            Noch keine Saisonen angelegt.
          </div>
        ) : (
          seasons.map(s => (
            <div key={s.id} className={`flex items-center justify-between p-4 rounded-xl border ${s.is_active ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
              <div className="flex items-center gap-3">
                <Calendar className={`w-4 h-4 ${s.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className={`font-semibold text-sm ${s.is_active ? 'text-primary' : 'text-foreground'}`}>
                    {s.name}
                    {s.is_active && <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Aktiv</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(s.start_date), 'dd.MM.yyyy', { locale: de })} – {format(new Date(s.end_date), 'dd.MM.yyyy', { locale: de })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!s.is_active && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activateMutation.mutate(s.id)}
                    disabled={activateMutation.isPending}
                  >
                    Aktivieren
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => { if (confirm('Saison löschen?')) deleteMutation.mutate(s.id); }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm ? (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Neue Saison anlegen</h2>
          <div className="space-y-1.5">
            <Label>Name (z.B. 2025/26)</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="2025/26" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Startdatum</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Enddatum</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || !form.start_date || !form.end_date || createMutation.isPending}
            >
              {createMutation.isPending ? 'Speichern...' : 'Saison erstellen'}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Neue Saison anlegen
        </Button>
      )}
    </div>
  );
}