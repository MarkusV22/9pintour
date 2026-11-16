import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Lock } from 'lucide-react';

/**
 * Dialog für Nicht-Admins, um eine Namens- und/oder Nummernänderung
 * eines Spielers zu beantragen. Der Antrag wird vom Admin freigegeben.
 */
export default function PlayerChangeRequestDialog({ open, onOpenChange, player }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const [req, setReq] = useState({ first_name: '', last_name: '', number: '', reason: '' });

  useEffect(() => {
    if (open && player) {
      setReq({
        first_name: player.first_name || '',
        last_name: player.last_name || '',
        number: player.number != null ? String(player.number) : '',
        reason: '',
      });
    }
  }, [open, player]);

  const createRequestMutation = useMutation({
    mutationFn: (data) => base44.entities.PlayerChangeRequest.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playerChangeRequests'] });
      toast({ title: 'Antrag gesendet', description: 'Die Änderung muss vom Admin freigegeben werden.' });
      onOpenChange(false);
    },
    onError: () => toast({ title: 'Fehler', description: 'Antrag konnte nicht gesendet werden.', variant: 'destructive' }),
  });

  const handleSubmit = () => {
    if (!req.first_name.trim() || !req.last_name.trim()) return;
    createRequestMutation.mutate({
      player_id: player.id,
      player_name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
      current_number: player.number != null ? Number(player.number) : null,
      requested_first_name: req.first_name.trim(),
      requested_last_name: req.last_name.trim(),
      requested_number: req.number ? Number(req.number) : null,
      reason: req.reason || '',
      status: 'offen',
      requested_by_email: user?.email || '',
      requested_by_name: user?.full_name || '',
    });
  };

  const changed =
    req.first_name.trim() !== (player?.first_name || '').trim() ||
    req.last_name.trim() !== (player?.last_name || '').trim() ||
    (req.number && Number(req.number) !== (player?.number ?? null));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Name-/Nummernänderung beantragen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg border border-amber-200">
            <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Name und Spielernummer können nur vom Admin direkt geändert werden. Dein Antrag wird geprüft und freigegeben.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Neuer Vorname</Label><Input value={req.first_name} onChange={e => setReq({ ...req, first_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Neuer Nachname</Label><Input value={req.last_name} onChange={e => setReq({ ...req, last_name: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Neue Spielernummer (optional)</Label>
            <Input type="number" min={1} value={req.number} onChange={e => setReq({ ...req, number: e.target.value })} placeholder="z.B. 101" />
          </div>
          <div className="space-y-1.5">
            <Label>Begründung (optional)</Label>
            <Textarea value={req.reason} onChange={e => setReq({ ...req, reason: e.target.value })} rows={2} placeholder="Warum soll geändert werden?" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button type="button" onClick={handleSubmit} disabled={!changed || createRequestMutation.isPending}>
            {createRequestMutation.isPending ? 'Senden...' : 'Antrag senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}