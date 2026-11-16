import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, LogIn, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TIERS } from '@/lib/tournamentPoints';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin, isAdmin } from '@/lib/roles';
import { useSeasons } from '@/lib/useSeason';
import { generateMixedCombinations, formatCombination } from '@/lib/mixedCombinations';
import { serializeVenues } from '@/lib/venues';
import VenuesEditor from '@/components/VenuesEditor';

export default function TournamentNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { activeSeason } = useSeasons();
  const [form, setForm] = useState({
    name: '',
    date: '',
    end_date: '',
    location: '',
    status: 'geplant',
    tier: 'Masters 250',
    team_size: 4,
    slot_duration: 60,
    allowed_categories: ['Herren', 'Damen', 'Mixed'],
    mixed_combinations: [],
    description: '',
    mode: 'normal',
    series_type: 'standard',
    registration_type: 'einladung',
  });
  // Multi-Spielort (nur 9PinFuture)
  const [multiVenue, setMultiVenue] = useState(false);
  const [venues, setVenues] = useState([
    { name: '', location: '', lane_count: 4 },
    { name: '', location: '', lane_count: 4 },
  ]);
  // Future = reine Einzelstarter (1 Spieler), Standard = 4er-Teams
  const handleSeriesChange = (seriesType) => {
    setForm(f => ({
      ...f,
      series_type: seriesType,
      team_size: seriesType === 'future' ? 1 : (f.series_type === 'future' && f.team_size === 1 ? 4 : f.team_size),
    }));
    if (seriesType !== 'future') setMultiVenue(false);
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Tournament.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      navigate(`/tournaments/${created.id}`);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const useMultiVenue = multiVenue && form.series_type === 'future' && venues.filter(v => v.location || v.name).length >= 2;
    // Automatically assign to active season
    const data = {
      ...form,
      allowed_categories: JSON.stringify(form.allowed_categories),
      mixed_combinations: JSON.stringify(form.mixed_combinations || []),
      ...(activeSeason ? { season_id: activeSeason.id } : {}),
      venues: useMultiVenue ? serializeVenues(venues) : '',
      ...(useMultiVenue
        ? { location: venues[0].location || venues[0].name, lane_count: venues[0].lane_count || 4 }
        : {}),
    };
    createMutation.mutate(data);
  };

  if (!isAuthenticated || !isTurnierAdmin(user)) {
    return (
      <div className="p-8 max-w-2xl">
        <Link to="/tournaments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </Link>
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <LogIn className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-semibold text-foreground">Anmeldung erforderlich</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Melde dich an, um ein Turnier zu erstellen.</p>
          <Button onClick={() => base44.auth.redirectToLogin(window.location.href)} className="gap-2">
            <LogIn className="w-4 h-4" />
            Jetzt anmelden
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/tournaments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Zurück
      </Link>

      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-8">Neues Turnier</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-card rounded-2xl border border-border p-8">
        <div className="space-y-2">
          <Label htmlFor="name">Turniername *</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="z.B. Frühjahrsturnier 2026"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Serie</Label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSeriesChange('standard')}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                form.series_type === 'standard'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              9-Pin Tour
            </button>
            <button
              type="button"
              onClick={() => handleSeriesChange('future')}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                form.series_type === 'future'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-border bg-background text-muted-foreground hover:border-emerald-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />
              9PinFuture
            </button>
          </div>
          {form.series_type === 'future' && (
            <p className="text-xs text-emerald-600">9PinFuture: Eigenständige Nachwuchsserie mit eigener Punktelogik (Top 3 erhalten 3 · 2 · 1 Punkte). Nicht in der Haupt-Rangliste.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Turniermodus</Label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, mode: 'normal', tier: form.tier === 'Finalturnier' ? 'Masters 250' : form.tier })}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                form.mode === 'normal'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => isAdmin(user) && setForm({ ...form, mode: 'final', tier: 'Finalturnier' })}
              disabled={!isAdmin(user)}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                form.mode === 'final'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-border bg-background text-muted-foreground hover:border-amber-400'
              } ${!isAdmin(user) ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              🏆 Finalturnier {!isAdmin(user) ? '(nur Admin)' : ''}
            </button>
          </div>
          {form.mode === 'final' && (
            <p className="text-xs text-amber-600">Finalturnier: Top 12 Damen & Herren in Gruppen + K.O.-Phase. Nach dem Erstellen im „Final-Admin" Gruppen generieren.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Startdatum *</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">Enddatum</Label>
            <Input
              id="end_date"
              type="date"
              value={form.end_date}
              min={form.date || ''}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
        </div>

        {form.series_type === 'future' && (
          <div className="space-y-2">
            <Label>Mehrere Spielorte</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMultiVenue(false)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  !multiVenue
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                }`}
              >
                Ein Spielort
              </button>
              <button
                type="button"
                onClick={() => setMultiVenue(true)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  multiVenue
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-border bg-background text-muted-foreground hover:border-emerald-400'
                }`}
              >
                Mehrere Spielorte
              </button>
            </div>
            {multiVenue && (
              <p className="text-xs text-emerald-600">
                Das Turnier wird an mehreren Spielorten gleichzeitig ausgetragen. Alle Spielorte teilen sich Datum und Ergebnisse/Rangliste werden gemeinsam berechnet.
              </p>
            )}
          </div>
        )}

        {form.series_type === 'future' && multiVenue ? (
          <div className="space-y-2">
            <Label>Spielorte</Label>
            <VenuesEditor venues={venues} onChange={setVenues} minVenues={2} />
          </div>
        ) : (
        <div className="space-y-2">
          <Label htmlFor="location">Ort</Label>
          <Input
            id="location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="z.B. Sporthalle Berlin"
          />
        </div>
        )}

        <div className="space-y-2">
          <Label>Spieler pro Mannschaft</Label>
          {form.series_type === 'future' ? (
            <div className="py-3 px-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-700 text-sm font-bold">
              1 Spieler (Einzelstarter – 9PinFuture ist eine reine Einzelserie)
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {[
                { size: 1, label: 'Einzelturnier' },
                { size: 2, label: '2er-Teams' },
                { size: 4, label: '4er-Teams' },
              ].map(({ size, label }) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setForm({ ...form, team_size: size })}
                  className={`flex-1 min-w-[60px] py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                    form.team_size === size
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Dauer pro Durchgang</Label>
          <div className="flex gap-3">
            {[60, 70].map(dur => (
              <button
                key={dur}
                type="button"
                onClick={() => setForm({ ...form, slot_duration: dur })}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.slot_duration === dur
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                }`}
              >
                {dur} min
              </button>
            ))}
          </div>
        </div>

        {form.mode !== 'final' && form.series_type !== 'future' && (
        <div className="space-y-2">
          <Label>Turniergröße</Label>
          <div className="flex gap-2 flex-wrap">
            {TIERS.filter(t => t.value !== 'Finalturnier').map(tier => (
              <button
                key={tier.value}
                type="button"
                onClick={() => setForm({ ...form, tier: tier.value })}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                  form.tier === tier.value
                    ? `${tier.color} border-transparent shadow-sm scale-105`
                    : 'bg-background text-muted-foreground border-border hover:border-primary'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
        )}

        {form.series_type !== 'future' && (
        <div className="space-y-2">
          <Label>Erlaubte Mannschaftskategorien</Label>
          <div className="flex gap-2 flex-wrap">
            {['Herren', 'Damen', 'Mixed'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm(prev => ({
                  ...prev,
                  allowed_categories: prev.allowed_categories.includes(cat)
                    ? (prev.allowed_categories.length <= 1 ? prev.allowed_categories : prev.allowed_categories.filter(c => c !== cat))
                    : [...prev.allowed_categories, cat]
                }))}
                disabled={form.allowed_categories.length <= 1 && form.allowed_categories.includes(cat)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                  form.allowed_categories.includes(cat)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                } ${form.allowed_categories.length <= 1 && form.allowed_categories.includes(cat) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
          {!form.allowed_categories.includes('Mixed') && (
            <p className="text-xs text-muted-foreground">Herren-Teams können aus Herren und Damen bestehen, Damen-Teams nur aus Damen.</p>
          )}
          {form.allowed_categories.includes('Mixed') && form.team_size >= 2 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Mixed-Kombinationen</Label>
              <p className="text-xs text-muted-foreground -mt-1">Welche D/H-Aufteilungen gelten als Mixed? Keine Auswahl = Standardlogik.</p>
              <div className="flex gap-2 flex-wrap">
                {generateMixedCombinations(form.team_size).map(combo => {
                  const checked = (form.mixed_combinations || []).some(c => c.damen === combo.damen && c.herren === combo.herren);
                  return (
                    <button
                      key={`${combo.damen}-${combo.herren}`}
                      type="button"
                      onClick={() => setForm(prev => {
                        const current = prev.mixed_combinations || [];
                        const exists = current.some(c => c.damen === combo.damen && c.herren === combo.herren);
                        return {
                          ...prev,
                          mixed_combinations: exists
                            ? current.filter(c => !(c.damen === combo.damen && c.herren === combo.herren))
                            : [...current, combo],
                        };
                      })}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                        checked
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {formatCombination(combo)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optionale Notizen..."
            rows={3}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={createMutation.isPending} className="flex-1">
            {createMutation.isPending ? 'Wird erstellt...' : 'Turnier erstellen'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tournaments')}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}