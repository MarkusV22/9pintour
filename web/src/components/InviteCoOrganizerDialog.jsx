import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function InviteCoOrganizerDialog({ open, onOpenChange, email, tournament, onConfirm, existingPlayer: knownPlayer = null }) {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ first_name: '', last_name: '', category: 'Herren' });

  const cachedPlayers = queryClient.getQueryData(['players']) || [];
  const existingPlayer = knownPlayer || cachedPlayers.find(p => p.user_email === email) || null;

  const newPlayerValid = !existingPlayer && newPlayer.first_name.trim() && newPlayer.last_name.trim();

  const handleConfirm = async () => {
    setSending(true);
    try {
      // Create player profile if no existing one
      if (!existingPlayer && newPlayer.first_name.trim() && newPlayer.last_name.trim()) {
        const fullName = `${newPlayer.first_name.trim()} ${newPlayer.last_name.trim()}`;
        await base44.entities.Player.create({
          first_name: newPlayer.first_name.trim(),
          last_name: newPlayer.last_name.trim(),
          name: fullName,
          category: newPlayer.category,
          user_email: email,
        });
        queryClient.invalidateQueries({ queryKey: ['players'] });
      }

      // Invite as regular app user; tournament-specific admin rights are granted via co_organizer_emails
      try { await base44.users.inviteUser(email, 'user'); } catch { /* already registered */ }

      // Send invitation email
      const tournamentUrl = `${window.location.origin}/tournaments/${tournament.id}`;
      await base44.integrations.Core.SendEmail({
        to: email,
        subject: `Einladung als Mitveranstalter: ${tournament.name}`,
        body: `Hallo,

du wurdest als Mitveranstalter zum Turnier „${tournament.name}" eingeladen.

${tournament.date ? `Datum: ${new Date(tournament.date).toLocaleDateString('de-AT')}` : ''}
${tournament.location ? `Ort: ${tournament.location}` : ''}

Als Mitveranstalter kannst du den Startplan bearbeiten, Ergebnisse eintragen und Spieler anlegen.

Zum Turnier: ${tournamentUrl}

Bitte melde dich mit dieser E-Mail-Adresse an, um Zugriff zu erhalten.

Viel Erfolg!`,
      });

      setDone(true);
      setTimeout(() => {
        setDone(false);
        onConfirm(email);
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      alert(`Fehler beim Senden der Einladung: ${err?.message || 'Unbekannter Fehler'}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mitveranstalter einladen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/40 rounded-xl px-4 py-2.5 text-sm text-foreground font-medium">
            {email}
          </div>

          <p className="text-sm text-muted-foreground">
            Diese Person erhält Verwaltungsrechte für das Turnier und kann Startplan sowie Ergebnisse bearbeiten.
          </p>

          {existingPlayer ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Spielerprofil gefunden: <strong>{existingPlayer.name || `${existingPlayer.first_name} ${existingPlayer.last_name}`}</strong>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-3">
              <div className="flex items-start gap-2 text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium">Kein Spielerprofil gefunden – jetzt anlegen:</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Vorname *</Label>
                  <Input value={newPlayer.first_name} onChange={e => setNewPlayer(p => ({ ...p, first_name: e.target.value }))} placeholder="Max" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nachname *</Label>
                  <Input value={newPlayer.last_name} onChange={e => setNewPlayer(p => ({ ...p, last_name: e.target.value }))} placeholder="Mustermann" className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                {['Herren', 'Damen'].map(cat => (
                  <button key={cat} type="button" onClick={() => setNewPlayer(p => ({ ...p, category: cat }))}
                    className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${newPlayer.category === cat ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleConfirm} disabled={sending || done || (!existingPlayer && !newPlayerValid)} className="gap-2">
            {done ? (
              <><CheckCircle2 className="w-4 h-4" /> Einladung gesendet!</>
            ) : sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Wird gesendet...</>
            ) : (
              'Einladen & speichern'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}