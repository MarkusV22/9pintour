import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44, api } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIERS } from '@/lib/tournamentPoints';
import { Plus, Trash2, Upload, X, Search, Video, Lock } from 'lucide-react';
import InviteCoOrganizerDialog from './InviteCoOrganizerDialog';
import { useToast } from '@/components/ui/use-toast';
import { generateMixedCombinations, formatCombination } from '@/lib/mixedCombinations';
import { getCoOrganizerEmails } from '@/lib/coOrganizers';
import { getVenues, isMultiVenue, serializeVenues } from '@/lib/venues';
import VenuesEditor from '@/components/VenuesEditor';

function parseDayConfigs(str) {
  try { const p = JSON.parse(str || ''); if (Array.isArray(p)) return p; } catch {}
  return [];
}

export default function TournamentEditDialog({ open, onOpenChange, tournament, isAdmin = false }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [form, setForm] = useState({});
  const [days, setDays] = useState([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const [coEmails, setCoEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [invite, setInvite] = useState(null); // { player?, email? }
  // Multi-Spielort (9PinFuture)
  const [multiVenue, setMultiVenue] = useState(false);
  const [venues, setVenues] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const playerSearchRef = useRef(null);

  // Spieler mit verknüpftem Konto + geschützte Mitveranstalter (eigener Endpunkt, auch für Mitveranstalter ohne Admin-Rechte)
  const { data: coOptions, error: coOptionsError, isLoading: coOptionsLoading } = useQuery({
    queryKey: ['co-organizer-options', tournament?.id],
    queryFn: () => api(`/tournaments/${encodeURIComponent(tournament.id)}/co-organizer-options`),
    enabled: open && !!tournament?.id,
  });
  const allPlayers = coOptions?.players || [];
  const protectedEmails = isAdmin ? [] : (coOptions?.protected || []);
  const sameMail = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  const hasCoEmail = (email) => coEmails.some(e => sameMail(e, email));
  const isProtected = (email) => protectedEmails.includes(String(email || '').toLowerCase());

  // Spieler (mit oder ohne Konto), die noch nicht Mitveranstalter sind – mit Konto zuerst
  const searchTerm = playerSearch.trim().toLowerCase();
  const filteredPlayerSuggestions = searchTerm.length >= 2
    ? allPlayers.filter(p =>
        !(p.user_email && hasCoEmail(p.user_email)) &&
        ((p.name || `${p.first_name} ${p.last_name}`).toLowerCase().includes(searchTerm) ||
         (p.user_email || '').toLowerCase().includes(searchTerm))
      ).sort((a, b) => (b.user_email ? 1 : 0) - (a.user_email ? 1 : 0)).slice(0, 8)
    : [];
  const searchIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playerSearch.trim()) && !hasCoEmail(playerSearch.trim());

  useEffect(() => {
    if (tournament) {
      setForm({
        name: tournament.name || '',
        date: tournament.date || '',
        end_date: tournament.end_date || '',
        location: tournament.location || '',
        tier: tournament.tier || 'Masters 250',
        category: tournament.category || 'Herren',
        team_size: tournament.team_size || 4,
        lane_count: tournament.lane_count || 4,
        slot_duration: tournament.slot_duration || 60,
        logo_url: tournament.logo_url || '',
        livestream_url: tournament.livestream_url || '',
        description: tournament.description || '',
        payment_enabled: tournament.payment_enabled || false,
        payment_amount: tournament.payment_amount ? (tournament.payment_amount / 100).toString() : '',
        payment_amount_einzelstarter: tournament.payment_amount_einzelstarter ? (tournament.payment_amount_einzelstarter / 100).toString() : '',
        payment_currency: tournament.payment_currency || 'eur',
        series_type: tournament.series_type || 'standard',
        registration_type: tournament.registration_type || 'einladung',
        allowed_categories: (() => { try { const a = JSON.parse(tournament.allowed_categories || ''); return Array.isArray(a) && a.length > 0 ? a : ['Herren', 'Damen', 'Mixed']; } catch { return ['Herren', 'Damen', 'Mixed']; } })(),
        mixed_combinations: (() => { try { const m = JSON.parse(tournament.mixed_combinations || ''); return Array.isArray(m) ? m : []; } catch { return []; } })(),
      });
      const saved = parseDayConfigs(tournament.day_configs);
      setDays(saved.length > 0 ? saved : [{ name: 'Tag 1', date: null, startHour: 8, endHour: 18 }]);
      setCoEmails(getCoOrganizerEmails(tournament));
      const parsedVenues = getVenues(tournament);
      const wasMulti = isMultiVenue(tournament);
      setMultiVenue(tournament.series_type === 'future' && wasMulti);
      setVenues(wasMulti
        ? parsedVenues.map(v => ({ name: v.name, location: v.location, lane_count: v.lane_count }))
        : [
            { name: '', location: tournament.location || '', lane_count: tournament.lane_count || 4 },
            { name: '', location: '', lane_count: 4 },
          ]);
    }
  }, [tournament]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm({ ...form, logo_url: file_url });
    setUploading(false);
  };

  const addDay = () => {
    const name = `Tag ${days.length + 1}`;
    setDays([...days, { name, date: null, startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }]);
  };

  const removeDay = (i) => setDays(days.filter((_, idx) => idx !== i));

  const updateDay = (i, fields) => {
    setDays(days.map((d, idx) => idx === i ? { ...d, ...(typeof fields === 'object' ? fields : {}) } : d));
  };

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Tournament.update(tournament.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournament.id] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      // Teams im Hintergrund neu kategorisieren; danach Team-Liste neu laden
      base44.functions.invoke('recategorizeTeams', { tournament_id: tournament.id })
        .then(() => queryClient.invalidateQueries({ queryKey: ['teams', tournament.id] }))
        .catch(err => console.error('Auto-recategorize failed:', err));
      onOpenChange(false);
    },
    onError: (err) => toast({ title: 'Speichern fehlgeschlagen', description: err?.message || 'Unbekannter Fehler', variant: 'destructive' }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const sortedDays = [...days].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    const amountCents = form.payment_amount
      ? Math.round(parseFloat(form.payment_amount) * 100)
      : 0;
    const einzelstarterAmountCents = form.payment_amount_einzelstarter
      ? Math.round(parseFloat(form.payment_amount_einzelstarter) * 100)
      : 0;
    const useMultiVenue = multiVenue && form.series_type === 'future' && venues.filter(v => v.location || v.name).length >= 2;
    updateMutation.mutate({
      ...form,
      payment_amount: amountCents,
      payment_amount_einzelstarter: einzelstarterAmountCents,
      allowed_categories: JSON.stringify(form.allowed_categories || ['Herren', 'Damen', 'Mixed']),
      mixed_combinations: JSON.stringify(form.mixed_combinations || []),
      day_configs: JSON.stringify(sortedDays),
      co_organizer_emails: coEmails,
      venues: useMultiVenue ? serializeVenues(venues) : '',
      ...(useMultiVenue
        ? { location: venues[0].location || venues[0].name, lane_count: venues[0].lane_count || 4 }
        : {}),
    });
  };

  if (!tournament) return null;

  return (
    <>
    {invite && (
      <InviteCoOrganizerDialog
        open={!!invite}
        onOpenChange={(v) => { if (!v) setInvite(null); }}
        tournament={tournament}
        player={invite.player || null}
        email={invite.email || ''}
        onDone={(r, email) => {
          // serverseitig schon gespeichert – lokal ergänzen, ungespeicherte Änderungen im Dialog bleiben erhalten
          setCoEmails(prev => prev.some(e => sameMail(e, email)) ? prev : [...prev, email]);
          queryClient.invalidateQueries({ queryKey: ['co-organizer-options', tournament.id] });
          queryClient.invalidateQueries({ queryKey: ['tournament', tournament.id] });
        }}
      />
    )}
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Turnier bearbeiten</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="space-y-1.5">
            <Label>Turniername *</Label>
            <Input
              value={form.name || ''}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Startdatum *</Label>
              <Input
                type="date"
                value={form.date || ''}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Enddatum</Label>
              <Input
                type="date"
                value={form.end_date || ''}
                min={form.date || ''}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          {form.series_type === 'future' && (
            <div className="space-y-1.5">
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
                  Ergebnisse/Rangliste werden über alle Spielorte gemeinsam berechnet.
                </p>
              )}
            </div>
          )}

          {form.series_type === 'future' && multiVenue ? (
            <div className="space-y-1.5">
              <Label>Spielorte</Label>
              <VenuesEditor venues={venues} onChange={setVenues} minVenues={2} />
            </div>
          ) : (
          <div className="space-y-1.5">
            <Label>Ort</Label>
            <div className="flex gap-2">
              <Input
                value={form.location || ''}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="z.B. Sporthalle Berlin, Musterstraße 1"
                className="flex-1"
              />
              {form.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted/60 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                  title="In Google Maps öffnen"
                >
                  🗺 Karte
                </a>
              )}
            </div>
          </div>
          )}

          <div className="space-y-1.5">
            <Label>Serie</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setForm(f => ({
                ...f,
                series_type: 'standard',
                team_size: (f.team_size === 1 || f.team_size === 3 || f.team_size === 5 || f.team_size === 6) ? 4 : f.team_size,
              })); setMultiVenue(false); }}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.series_type === 'standard'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                }`}
              >
                9-Pin Tour
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({
                ...f,
                series_type: 'future',
                team_size: 1,
              }))}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.series_type === 'future'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-border bg-background text-muted-foreground hover:border-emerald-400'
                }`}
              >
                9PinFuture
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Anmeldeart</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, registration_type: 'offen' }))}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.registration_type !== 'einladung'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                }`}
              >
                Offen
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, registration_type: 'einladung' }))}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.registration_type === 'einladung'
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-border bg-background text-muted-foreground hover:border-amber-400'
                }`}
              >
                Anmeldung über Veranstalter
              </button>
            </div>
            {form.registration_type === 'einladung' ? (
              <p className="text-xs text-amber-700">Nur der Veranstalter vergibt Startplätze – Spieler können sich nicht selbst einbuchen.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Offene Anmeldung – Spieler können sich selbst in freie Startplätze einbuchen.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Spieler pro Mannschaft</Label>
            {form.series_type === 'future' ? (
              <div className="py-2.5 px-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-700 text-sm font-bold">
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
                    className={`flex-1 min-w-[50px] py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
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

          <div className="space-y-1.5">
            <Label>Dauer pro Durchgang</Label>
            <div className="flex gap-3">
              {[60, 70].map(dur => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setForm({ ...form, slot_duration: dur })}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
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

          {!(form.series_type === 'future' && multiVenue) && (
          <div className="space-y-1.5">
            <Label>Kegelbahnanlage</Label>
            <div className="flex gap-3">
              {[4, 6, 8].map(lanes => (
                <button
                  key={lanes}
                  type="button"
                  onClick={() => setForm({ ...form, lane_count: lanes })}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                    form.lane_count === lanes
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {lanes} Bahnen
                </button>
              ))}
            </div>
          </div>
          )}

          {form.series_type !== 'future' && (
          <div className="space-y-1.5">
            <Label>Turniergröße {!isAdmin && <span className="text-xs text-muted-foreground font-normal">(nur Admin)</span>}</Label>
            {tournament.mode === 'final' ? (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${TIERS.find(t => t.value === 'Finalturnier')?.color || 'bg-muted text-foreground'}`}>
                  🏆 Finalturnier (keine Ranglistenpunkte)
                </span>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {TIERS.filter(t => t.value !== 'Finalturnier').map(tier => (
                  <button
                    key={tier.value}
                    type="button"
                    onClick={() => isAdmin && setForm({ ...form, tier: tier.value })}
                    disabled={!isAdmin}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                      form.tier === tier.value
                        ? `${tier.color} border-transparent shadow-sm scale-105`
                        : 'bg-background text-muted-foreground border-border'
                    } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary cursor-pointer'}`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {form.series_type !== 'future' && (
          <div className="space-y-1.5">
            <Label>Erlaubte Mannschaftskategorien</Label>
            <div className="flex gap-2 flex-wrap">
              {['Herren', 'Damen', 'Mixed'].map(cat => {
                const allowed = form.allowed_categories || ['Herren', 'Damen', 'Mixed'];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm(prev => {
                      const current = prev.allowed_categories || ['Herren', 'Damen', 'Mixed'];
                      return {
                        ...prev,
                        allowed_categories: current.includes(cat)
                          ? (current.length <= 1 ? current : current.filter(c => c !== cat))
                          : [...current, cat]
                      };
                    })}
                    disabled={allowed.length <= 1 && allowed.includes(cat)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                      allowed.includes(cat)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    } ${allowed.length <= 1 && allowed.includes(cat) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            {!(form.allowed_categories || ['Herren', 'Damen', 'Mixed']).includes('Mixed') && (
              <p className="text-xs text-muted-foreground">Herren-Teams können aus Herren und Damen bestehen, Damen-Teams nur aus Damen.</p>
            )}
            {(form.allowed_categories || ['Herren', 'Damen', 'Mixed']).includes('Mixed') && (form.team_size || 4) >= 2 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-xs">Mixed-Kombinationen</Label>
                <p className="text-xs text-muted-foreground -mt-1">Welche D/H-Aufteilungen gelten als Mixed? Keine Auswahl = Standardlogik.</p>
                <div className="flex gap-2 flex-wrap">
                  {generateMixedCombinations(form.team_size || 4).map(combo => {
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

          <div className="space-y-1.5">
            <Label>Livestream-Link</Label>
            <Input
              type="url"
              value={form.livestream_url || ''}
              onChange={e => setForm({ ...form, livestream_url: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <p className="text-[10px] text-muted-foreground">Optional – wird als Kamera-Symbol neben dem Turniernamen angezeigt</p>
          </div>

          <div className="space-y-1.5">
            <Label>Turnierlogo</Label>
            <div className="flex items-center gap-2">
              {form.logo_url ? (
                <div className="relative w-16 h-16 rounded-lg border border-border bg-muted/30 overflow-hidden">
                  <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                  <button type="button" onClick={() => setForm({ ...form, logo_url: '' })} className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center text-xs text-white transition-opacity">Entfernen</button>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                  {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              {!form.logo_url && <span className="text-xs text-muted-foreground">Optional</span>}
            </div>
          </div>

          {/* Spieltage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Spieltage</Label>
              <Button type="button" variant="outline" size="sm" onClick={addDay} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Tag
              </Button>
            </div>
            <div className="space-y-2">
              {days.map((day, i) => {
                return (
                <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                  <Input
                    value={day.name}
                    onChange={e => updateDay(i, { name: e.target.value })}
                    className="h-7 text-xs w-24 flex-shrink-0"
                    placeholder="Name"
                  />
                  <Input
                    type="date"
                    value={day.date ? (typeof day.date === 'string' ? day.date.slice(0, 10) : new Date(day.date).toISOString().slice(0, 10)) : ''}
                    onChange={e => updateDay(i, { date: e.target.value || null })}
                    className="h-7 text-xs flex-1"
                  />
                  <span className="text-xs text-muted-foreground flex-shrink-0">Von</span>
                  <Input
                    type="time"
                    value={`${String(day.startHour ?? 8).padStart(2,'0')}:${String(day.startMinute ?? 0).padStart(2,'0')}`}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      updateDay(i, { startHour: h, startMinute: m });
                    }}
                    className="h-7 text-xs w-24 flex-shrink-0"
                  />
                  <span className="text-xs text-muted-foreground flex-shrink-0">Bis</span>
                  <Input
                    type="time"
                    value={`${String(day.endHour ?? 18).padStart(2,'0')}:${String(day.endMinute ?? 0).padStart(2,'0')}`}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      updateDay(i, { endHour: h, endMinute: m });
                    }}
                    className="h-7 text-xs w-24 flex-shrink-0"
                  />
                  {days.length > 1 && (
                    <button type="button" onClick={() => removeDay(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Mitveranstalter */}
          <div className="space-y-2">
            <Label>Mitveranstalter</Label>
            <p className="text-xs text-muted-foreground">Personen mit diesen E-Mail-Adressen können den Startplan und Ergebnisse verwalten.</p>

            {/* Spieler-Suche */}
            <div className="relative" ref={playerSearchRef}>
              <div className="flex items-center gap-1 bg-muted/30 border border-border rounded-md px-3 h-9">
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Spieler suchen..."
                  value={playerSearch}
                  onChange={e => { setPlayerSearch(e.target.value); setShowPlayerSearch(true); }}
                  onFocus={() => setShowPlayerSearch(true)}
                  onBlur={() => setTimeout(() => setShowPlayerSearch(false), 150)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {showPlayerSearch && (filteredPlayerSuggestions.length > 0 || searchIsEmail) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                  {filteredPlayerSuggestions.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => {
                        setInvite({ player: p });
                        setPlayerSearch('');
                        setShowPlayerSearch(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{p.name || `${p.first_name} ${p.last_name}`}</span>
                        {p.club && <span className="text-xs text-muted-foreground"> · {p.club}</span>}
                      </span>
                      {p.user_email
                        ? <span className="text-xs text-muted-foreground truncate">{p.user_email}</span>
                        : <span className="text-xs text-amber-700 flex-shrink-0">kein Konto – einladen</span>}
                    </button>
                  ))}
                  {searchIsEmail && (
                    <button
                      type="button"
                      onMouseDown={() => { setInvite({ email: playerSearch.trim() }); setPlayerSearch(''); setShowPlayerSearch(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 text-primary font-medium"
                    >
                      „{playerSearch.trim()}“ per E-Mail einladen
                    </button>
                  )}
                </div>
              )}
              {showPlayerSearch && searchTerm.length >= 2 && filteredPlayerSuggestions.length === 0 && !searchIsEmail && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs text-muted-foreground">
                  {coOptionsError ? `Spielerliste konnte nicht geladen werden: ${coOptionsError.message}`
                    : coOptionsLoading ? 'Spielerliste wird geladen…'
                    : 'Kein Spieler gefunden – du kannst die Person unten per E-Mail einladen.'}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setInvite({ email: '' })} className="text-xs text-primary hover:underline">
              Person ist nicht in der Spielerdatenbank? Per E-Mail einladen
            </button>

            {coEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {coEmails.map(email => {
                  const linkedPlayer = allPlayers.find(p => sameMail(p.user_email, email));
                  const displayName = linkedPlayer
                    ? (linkedPlayer.name || `${linkedPlayer.first_name} ${linkedPlayer.last_name}`)
                    : email;
                  return (
                    <span key={email} className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full" title={isProtected(email) ? `${email} – kann nur der Admin entfernen` : email}>
                      {displayName}
                      {isProtected(email) ? (
                        <Lock className="w-3 h-3 opacity-60" aria-label="Kann nur der Admin entfernen" />
                      ) : (
                        <button type="button" onClick={() => setCoEmails(coEmails.filter(e => e !== email))} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Startgebühr & Online-Zahlung */}
          <div className="space-y-3 bg-muted/30 rounded-xl p-4 border border-border">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Startgebühr Mannschaft gesamt (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.payment_amount || ''}
                    onChange={e => setForm({ ...form, payment_amount: e.target.value })}
                    placeholder="z.B. 40.00"
                  />
                  <p className="text-[10px] text-muted-foreground">Gesamtbetrag pro Mannschaft – wird auf {form.team_size || 4} Spieler aufgeteilt</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Startgebühr Einzelstarter (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.payment_amount_einzelstarter || ''}
                    onChange={e => setForm({ ...form, payment_amount_einzelstarter: e.target.value })}
                    placeholder="z.B. 50.00"
                  />
                  <p className="text-[10px] text-muted-foreground">Pro Einzelstarter ohne Mannschaft</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Währung</Label>
                <Select value={form.payment_currency || 'eur'} onValueChange={v => setForm({ ...form, payment_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eur">EUR (€)</SelectItem>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="chf">CHF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.payment_enabled || false}
                onChange={e => setForm({ ...form, payment_enabled: e.target.checked })}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm font-medium text-foreground">Online-Zahlung aktivieren</span>
            </label>
            {form.payment_enabled ? (
              <p className="text-xs text-muted-foreground">
                Spieler müssen die Startgebühr bei der Anmeldung online per Kreditkarte bezahlen.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Die Gebühr wird im Veranstalter-Dashboard zur Einnahmenprognose verwendet. Online-Zahlung ist deaktiviert.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Beschreibung</Label>
            <Textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Optionale Notizen..."
              rows={2}
            />
          </div>

        </div>
          <DialogFooter className="flex-shrink-0 pt-4 border-t border-border mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Speichern...' : 'Änderungen speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}