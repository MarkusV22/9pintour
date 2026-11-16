import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCheck, Clock, CheckCircle2, Users, AlertCircle, Plus, ChevronDown, ChevronUp, Lock, CreditCard } from 'lucide-react';

const categoryColor = (cat) =>
  cat === 'Herren' ? 'bg-blue-100 text-blue-700 border-blue-200' :
  cat === 'Damen'  ? 'bg-pink-100 text-pink-700 border-pink-200' :
                     'bg-purple-100 text-purple-700 border-purple-200';

const CATEGORIES = ['Herren', 'Damen', 'Mixed'];

/**
 * Erlaubt eingeloggten Spielern, eine neue Mannschaft für das Turnier anzumelden
 * und sich in einen freien Startplan-Slot einzuplanen.
 * Vergeben Slots sind gesperrt. Der Veranstalter wird per E-Mail informiert.
 */
export default function SpotBooking({ tournamentId, teams, schedules, user, tournament }) {
  const queryClient = useQueryClient();

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [selectedSlotKey, setSelectedSlotKey] = useState('');
  const [booked, setBooked] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: '',
    category: 'Herren',
    player1: '',
    player2: '',
    player3: '',
    player4: '',
  });

  // Current user's player profile
  const { data: myPlayer } = useQuery({
    queryKey: ['my-player', user?.email],
    queryFn: () => base44.entities.Player.filter({ user_email: user.email }),
    select: (data) => data[0] || null,
    enabled: !!user,
  });

  const myName = myPlayer
    ? (myPlayer.name || `${myPlayer.first_name} ${myPlayer.last_name}`.trim())
    : null;

  // Pre-fill player1 with own name
  useEffect(() => {
    if (myName && !teamForm.player1) {
      setTeamForm(f => ({ ...f, player1: myName }));
    }
  }, [myName]);

  // Teams in this tournament where the user is listed as a player
  const myTeams = useMemo(() => {
    if (!myName) return [];
    return teams.filter(t =>
      [t.player1, t.player2, t.player3, t.player4].some(p => p === myName)
    );
  }, [teams, myName]);

  // Slots already taken by real teams (not placeholders)
  const takenSlotKeys = useMemo(() =>
    new Set(
      schedules
        .filter(s => !s.is_placeholder)
        .map(s => `${s.start_time}::${s.lane}::${s.day || 'Tag 1'}`)
    ),
  [schedules]);

  // All placeholder slots — split into free and taken
  const allPlaceholderSlots = useMemo(() =>
    schedules.filter(s => s.is_placeholder),
  [schedules]);

  // Free = still is_placeholder=true
  const freeSlots = useMemo(() => allPlaceholderSlots, [allPlaceholderSlots]);

  const selectedSlot = useMemo(() =>
    freeSlots.find(s => `${s.id}` === selectedSlotKey),
  [freeSlots, selectedSlotKey]);

  const teamSize = tournament?.team_size || 4;
  const playerFields = Array.from({ length: teamSize }, (_, i) => `player${i + 1}`);

  const hasSlots = freeSlots.length > 0;

  const isFormValid =
    teamForm.name.trim() &&
    teamForm.player1.trim() &&
    (!hasSlots || selectedSlotKey);

  const paymentEnabled = !!tournament?.payment_enabled;
  const priceLabel = paymentEnabled && tournament.payment_amount
    ? `€ ${(tournament.payment_amount / 100).toFixed(2)}`
    : null;

  const bookMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the team
      const newTeam = await base44.entities.Team.create({
        tournament_id: tournamentId,
        name: teamForm.name.trim(),
        category: teamForm.category,
        player1: teamForm.player1.trim(),
        player2: teamForm.player2.trim(),
        player3: teamForm.player3.trim(),
        player4: teamForm.player4.trim(),
        payment_status: paymentEnabled ? 'pending' : 'free',
      });

      // 2. Assign the slot (only if a placeholder slot was selected)
      if (selectedSlot) {
        await base44.entities.TournamentSchedule.update(selectedSlot.id, {
          team_id: newTeam.id,
          player_name: teamForm.player1.trim(),
          is_placeholder: false,
          placeholder_label: '',
        });
      }

      // 3. Notify organizer by email
      const players = playerFields
        .map(f => teamForm[f].trim())
        .filter(Boolean)
        .join(', ');

      const organizerEmails = (() => {
        try { return JSON.parse(tournament.co_organizer_emails || '[]'); } catch { return []; }
      })();
      if (organizerEmails.length > 0) {
        await base44.integrations.Core.SendEmail({
          to: organizerEmails[0],
          subject: `Neue Mannschaft angemeldet: ${tournament.name}`,
          body: `Hallo,\n\neine neue Mannschaft hat sich für das Turnier "${tournament.name}" angemeldet.\n\nMannschaft: ${teamForm.name}\nKategorie: ${teamForm.category}\nSpieler: ${players}${selectedSlot ? `\nStartzeit: ${selectedSlot.start_time} Uhr · Bahn ${selectedSlot.lane}${selectedSlot.day && selectedSlot.day !== 'Tag 1' ? ' · ' + selectedSlot.day : ''}` : '\nStartplatz: noch nicht zugewiesen'}\n\nBitte prüfe die Anmeldung im Turnier-Dashboard.\n\nViele Grüße,\nDas System`,
        });
      }

      // 4. If payment enabled, create Stripe checkout session
      if (paymentEnabled) {
        const res = await base44.functions.invoke('createCheckoutSession', {
          team_id: newTeam.id,
          tournament_id: tournamentId,
          success_url: `${window.location.origin}/tournaments/${tournamentId}?payment=success`,
          cancel_url: `${window.location.origin}/tournaments/${tournamentId}?payment=cancelled`,
        });
        return { checkoutUrl: res.data?.url || null };
      }

      return { checkoutUrl: null };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['schedules', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['teams', tournamentId] });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setBooked(true);
        setShowForm(false);
        setSelectedSlotKey('');
        setTeamForm({ name: '', category: 'Herren', player1: myName || '', player2: '', player3: '', player4: '' });
      }
    },
  });

  const handleBook = () => {
    if (paymentEnabled && window.self !== window.top) {
      alert('Die Zahlung funktioniert nur in der veröffentlichten App. Bitte öffne die App in einem neuen Tab.');
      return;
    }
    bookMutation.mutate();
  };

  if (!user) return null;
  if (tournament?.status === 'abgeschlossen') return null;

  const alreadyRegistered = myTeams.length > 0;

  return (
    <div className="mb-6 space-y-3">
      {/* Success banner */}
      {booked && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Mannschaft erfolgreich angemeldet! Der Veranstalter wurde informiert.
        </div>
      )}

      {/* Already registered */}
      {alreadyRegistered && !booked && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Du bist bereits mit einer Mannschaft für dieses Turnier angemeldet.
          {paymentEnabled && myTeams[0]?.payment_status === 'pending' && (
            <span className="ml-1 text-amber-700 font-medium">· Zahlung ausstehend</span>
          )}
          {paymentEnabled && myTeams[0]?.payment_status === 'paid' && (
            <span className="ml-1 text-green-700 font-medium">· Bezahlt ✓</span>
          )}
        </div>
      )}

      {/* Registration panel — always show if not yet registered */}
      {!alreadyRegistered && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground text-sm">Mannschaft anmelden</span>
              {hasSlots && <span className="text-xs text-muted-foreground">· {freeSlots.length} freie Startplätze</span>}
            </div>
            <Button
              size="sm"
              variant={showForm ? 'secondary' : 'default'}
              className="gap-1.5"
              onClick={() => setShowForm(v => !v)}
            >
              {showForm
                ? <><ChevronUp className="w-3.5 h-3.5" /> Schließen</>
                : <><Plus className="w-3.5 h-3.5" /> Mannschaft anmelden</>}
            </Button>
          </div>

          {/* Free slots overview (read-only) */}
          {hasSlots && !showForm && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {freeSlots.map(slot => (
                <div key={slot.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 text-xs font-medium">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  {slot.day && slot.day !== 'Tag 1' ? `${slot.day} · ` : ''}{slot.start_time} · Bahn {slot.lane}
                </div>
              ))}
            </div>
          )}

          {!hasSlots && !showForm && (
            <p className="text-xs text-muted-foreground">
              Keine Startplätze vordefiniert – nach Anmeldung wird der Platz vom Veranstalter zugewiesen.
            </p>
          )}

          {/* Registration form */}
          {showForm && (
            <div className="border-t border-border pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mannschaftsname *</Label>
                  <Input
                    value={teamForm.name}
                    onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="z.B. TSV Musterstadt"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kategorie</Label>
                  <Select value={teamForm.category} onValueChange={v => setTeamForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {playerFields.map((field, i) => (
                  <div key={field} className="space-y-1.5">
                    <Label className="text-xs">Spieler {i + 1}{i === 0 ? ' *' : ''}</Label>
                    <Input
                      value={teamForm[field]}
                      onChange={e => setTeamForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={`Spieler ${i + 1}`}
                    />
                  </div>
                ))}
              </div>

              {/* Slot selector — only if placeholders exist */}
              {hasSlots && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Startplatz wählen *</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {freeSlots.map(slot => {
                      const key = `${slot.id}`;
                      const isSelected = selectedSlotKey === key;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlotKey(isSelected ? '' : key)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-green-200 bg-green-50 text-green-700 hover:border-green-400'
                          }`}
                        >
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {slot.day && slot.day !== 'Tag 1' ? `${slot.day} · ` : ''}{slot.start_time} · Bahn {slot.lane}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {paymentEnabled && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <CreditCard className="w-4 h-4 flex-shrink-0" />
                  Startgebühr: <span className="font-bold">{priceLabel}</span>
                </div>
              )}

              <Button
                onClick={handleBook}
                disabled={!isFormValid || bookMutation.isPending}
                className="w-full gap-2"
              >
                {bookMutation.isPending
                  ? 'Wird angemeldet…'
                  : paymentEnabled
                    ? <><CreditCard className="w-4 h-4" />Anmelden & Bezahlen ({priceLabel})</>
                    : 'Mannschaft anmelden'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}