import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Trophy, MapPin, Users, Clock, Info, UserCheck } from 'lucide-react';
import { TIERS } from '@/lib/tournamentPoints';
import { useAuth } from '@/lib/AuthContext';

const STEPS = [
  { id: 1, label: 'Kontakt', icon: Users },
  { id: 2, label: 'Turnier', icon: Trophy },
  { id: 3, label: 'Details', icon: Info },
];

const empty = {
  organizer_name: '',
  organizer_email: '',
  organizer_phone: '',
  tournament_name: '',
  tournament_date: '',
  tournament_end_date: '',
  location: '',
  lane_count: 4,
  expected_teams: '',
  categories: [],
  team_size: 4,
  slot_duration: 60,
  description: '',
  newsletter_optin: false,
};

const CATEGORY_OPTIONS = ['Herren', 'Damen', 'Mixed'];

export default function TournamentRequestForm() {
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(empty);
  const [submitted, setSubmitted] = useState(false);

  // Fetch current user's linked player profile
  const { data: players = [] } = useQuery({
    queryKey: ['my-player-profile', user?.email],
    queryFn: () => base44.entities.Player.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });
  const myPlayer = players[0];

  // Pre-fill contact data from logged-in user
  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        organizer_email: f.organizer_email || user.email || '',
        organizer_name: f.organizer_name || (myPlayer ? (myPlayer.name || `${myPlayer.first_name} ${myPlayer.last_name}`) : user.full_name || ''),
        organizer_phone: f.organizer_phone || myPlayer?.phone || '',
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, myPlayer?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleCategory = (cat) => {
    const cats = form.categories.includes(cat)
      ? form.categories.filter(c => c !== cat)
      : [...form.categories, cat];
    set('categories', cats);
  };

  const submitMutation = useMutation({
    mutationFn: (data) => base44.entities.TournamentRequest.create(data),
    onSuccess: () => {
      if (form.newsletter_optin && form.organizer_email) {
        base44.functions.invoke('subscribeNewsletter', {
          email: form.organizer_email,
          source: 'turnier-anmeldung',
        }).catch(() => {});
      }
      setSubmitted(true);
    },
  });

  const handleSubmit = () => {
    submitMutation.mutate({
      ...form,
      lane_count: Number(form.lane_count) || null,
      expected_teams: Number(form.expected_teams) || null,
      day_count: Number(form.day_count) || null,
      categories: form.categories.join(', '),
      status: 'neu',
      co_organizer_email: user?.email || '',
    });
  };

  const step1Valid = form.organizer_name && form.organizer_email && form.organizer_phone;
  const step2Valid = form.tournament_name && form.tournament_date && form.location;
  const step3Valid = form.categories.length > 0;

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card rounded-2xl border border-border p-10 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Anfrage gesendet!</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Vielen Dank für Ihre Turnieranfrage. Wir prüfen Ihre Angaben und melden uns so bald wie möglich bei Ihnen.
          </p>
          <Button className="mt-6" onClick={() => { setForm(empty); setStep(1); setSubmitted(false); }}>
            Neue Anfrage stellen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-4">
            <Trophy className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Turnier anmelden</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Melden Sie Ihr Turnier an und wir nehmen es in die offizielle Tierwertung auf.
            Nach der Prüfung erhalten Sie alle Verwaltungsrechte für Ihr Turnier.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isActive ? 'bg-primary text-primary-foreground shadow-sm' :
                  isDone ? 'bg-green-100 text-green-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  <Icon className="w-4 h-4" />
                  {s.label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-8 mx-1 ${isDone ? 'bg-green-400' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">

          {/* Step 1: Kontakt */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground mb-1">Ihre Kontaktdaten</h2>
                <p className="text-sm text-muted-foreground">Wie können wir Sie für Rückfragen erreichen?</p>
              </div>

              {isAuthenticated && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-start gap-2.5">
                  <UserCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
                  <div>
                    <strong>Angemeldet als {user?.full_name || user?.email}</strong>
                    {myPlayer && <span className="font-normal"> · Spielerprofil: {myPlayer.name || `${myPlayer.first_name} ${myPlayer.last_name}`}</span>}
                    <br />
                    <span className="font-normal">Ihre Kontaktdaten wurden vorausgefüllt. Nach Genehmigung erhalten Sie automatisch die Verwaltungsrechte.</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Name / Verein *</Label>
                <Input value={form.organizer_name} onChange={e => set('organizer_name', e.target.value)} placeholder="z.B. SV Muster e.V." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>E-Mail-Adresse *</Label>
                  <Input type="email" value={form.organizer_email} onChange={e => set('organizer_email', e.target.value)} placeholder="kontakt@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefon *</Label>
                  <Input type="tel" value={form.organizer_phone} onChange={e => set('organizer_phone', e.target.value)} placeholder="+43 123 456 789" />
                </div>
              </div>
              {!isAuthenticated && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                  <strong>Tipp:</strong> Falls Sie bereits ein Nutzerkonto in der App haben, <button onClick={() => base44.auth.redirectToLogin(window.location.href)} className="underline font-semibold hover:opacity-80">melden Sie sich zuerst an</button> – so werden Ihre Daten automatisch ausgefüllt und die Verwaltungsrechte direkt zugewiesen.
                </div>
              )}

              {/* Newsletter opt-in */}
              <label className="flex items-start gap-2.5 cursor-pointer bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.newsletter_optin}
                  onChange={e => set('newsletter_optin', e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary flex-shrink-0"
                />
                <span className="text-sm text-muted-foreground">
                  Ja, ich möchte den <strong>Newsletter abonnieren</strong> und über neue Turniere sowie Ergebnisse informiert werden.
                </span>
              </label>
            </div>
          )}

          {/* Step 2: Turnierdaten */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground mb-1">Turnierdaten</h2>
                <p className="text-sm text-muted-foreground">Wann und wo findet das Turnier statt?</p>
              </div>
              <div className="space-y-1.5">
                <Label>Turniername *</Label>
                <Input value={form.tournament_name} onChange={e => set('tournament_name', e.target.value)} placeholder="z.B. Frühjahrsturnier 2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Startdatum *</Label>
                  <Input type="date" value={form.tournament_date} onChange={e => set('tournament_date', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Enddatum</Label>
                  <Input type="date" value={form.tournament_end_date} min={form.tournament_date} onChange={e => set('tournament_end_date', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Austragungsort mit Adresse *</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.location}
                    onChange={e => set('location', e.target.value)}
                    placeholder="z.B. Kegelbahnanlage Muster, Musterstraße 1, 1010 Wien"
                    className="flex-1"
                  />
                  {form.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted/60 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Karte
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground mb-1">Weitere Details</h2>
                <p className="text-sm text-muted-foreground">Diese Angaben helfen uns bei der Tiereinstufung.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Kategorien *</Label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORY_OPTIONS.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.categories.includes(cat)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Spieler pro Team</Label>
                  <div className="flex gap-2">
                    {[1, 2, 4].map(size => (
                      <button key={size} type="button" onClick={() => set('team_size', size)}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${form.team_size === size ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                        {size === 1 ? 'Einzel' : `${size}er`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Durchgang-Dauer</Label>
                  <div className="flex gap-2">
                    {[60, 70].map(dur => (
                      <button key={dur} type="button" onClick={() => set('slot_duration', dur)}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${form.slot_duration === dur ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                        {dur}min
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Anzahl Bahnen</Label>
                  <div className="flex gap-2">
                    {[4, 6, 8].map(n => (
                      <button key={n} type="button" onClick={() => set('lane_count', n)}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${form.lane_count === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Erwartete Mannschaften</Label>
                  <Input type="number" min={1} value={form.expected_teams} onChange={e => set('expected_teams', e.target.value)} placeholder="z.B. 20" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Geplante Spieltage</Label>
                <Input type="number" min={1} value={form.day_count || ''} onChange={e => set('day_count', e.target.value)} placeholder="z.B. 2" />
              </div>

              <div className="space-y-1.5">
                <Label>Weitere Anmerkungen</Label>
                <Textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Besonderheiten, Wünsche, Fragen..."
                  rows={3}
                />
              </div>

              {/* Tier info */}
              <div className="bg-muted/40 rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Tierkategorien zur Info</p>
                <div className="flex flex-wrap gap-2">
                  {TIERS.map(t => (
                    <span key={t.value} className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.color}`}>{t.label}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Die Tiereinstufung erfolgt durch unsere Administratoren nach Prüfung Ihrer Anfrage.</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-border">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep(s => s - 1)}>Zurück</Button>
            ) : <div />}

            {step < 3 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 ? !step1Valid : !step2Valid}
              >
                Weiter
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!step3Valid || submitMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {submitMutation.isPending ? 'Wird gesendet...' : 'Anfrage absenden'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}