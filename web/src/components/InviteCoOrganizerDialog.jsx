// Mitveranstalter einladen: verknüpfter Spieler, Spieler ohne Konto (wird mit der E-Mail verknüpft) oder nur E-Mail.
// Alles läuft serverseitig über /tournaments/:id/co-organizers/invite (Liste speichern, ggf. verknüpfen, Einladungs-Mail).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api/base44Client';
import { CheckCircle2, Loader2, AlertCircle, UserPlus } from 'lucide-react';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const playerName = (p) => p?.name || `${p?.first_name || ''} ${p?.last_name || ''}`.trim();

export default function InviteCoOrganizerDialog({ open, onOpenChange, tournament, player = null, email: initialEmail = '', onDone }) {
  const linked = !!player?.user_email;
  const [email, setEmail] = useState(linked ? player.user_email : initialEmail);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setSending(true); setError('');
    try {
      const r = await api(`/tournaments/${encodeURIComponent(tournament.id)}/co-organizers/invite`, {
        method: 'POST',
        body: { email: email.trim(), player_id: player && !linked ? player.id : undefined },
      });
      setResult(r);
      onDone?.(r, email.trim());
    } catch (err) {
      setError(err?.message || 'Unbekannter Fehler');
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

        {result ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>{result.player?.name || email}</strong> ist jetzt Mitveranstalter.
                {result.mail === 'sent' && <> Eine Einladung wurde an {email} geschickt.</>}
                {!result.registered && <> Sobald sich die Person mit dieser E-Mail-Adresse registriert, hat sie Zugriff.</>}
              </div>
            </div>
            {result.mail !== 'sent' && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Die Einladungs-Mail konnte nicht verschickt werden – bitte gib der Person selbst Bescheid, dass sie sich auf 9pintour.at mit {email} anmelden/registrieren soll.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {player && (
              <div className="bg-muted/40 rounded-xl px-4 py-2.5 text-sm">
                <div className="font-medium">{playerName(player)}</div>
                {player.club && <div className="text-xs text-muted-foreground">{player.club}</div>}
              </div>
            )}

            {linked ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Hat bereits ein Konto ({player.user_email}).
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>E-Mail-Adresse *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@beispiel.at" autoFocus />
                <p className="text-xs text-muted-foreground">
                  {player
                    ? 'Noch kein Konto. Die Person bekommt eine Einladung; wenn sie sich mit dieser Adresse registriert, wird ihr Spielerprofil automatisch verbunden.'
                    : 'Die Person bekommt eine Einladung und hat Zugriff, sobald sie sich mit dieser Adresse registriert. Steht sie in der Spielerdatenbank, wähle sie besser oben in der Suche aus.'}
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Mitveranstalter können Startplan und Ergebnisse dieses Turniers verwalten und weitere Mitveranstalter einladen.
            </p>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => onOpenChange(false)}>Schließen</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleConfirm} disabled={sending || !isEmail(email)} className="gap-2">
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird gesendet...</> : <><UserPlus className="w-4 h-4" /> Einladen</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
