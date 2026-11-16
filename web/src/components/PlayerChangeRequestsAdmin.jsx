import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Clock, User } from 'lucide-react';

/**
 * Admin-Dialog: alle Anträge auf Namens-/Nummernänderung.
 * Offene Anträge können genehmigt (→ Spieler wird aktualisiert) oder
 * abgelehnt werden. Zuletzt bearbeitete Anträge werden chronologisch angezeigt.
 */
export default function PlayerChangeRequestsAdmin({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [noteById, setNoteById] = useState({});

  const { data: requests = [] } = useQuery({
    queryKey: ['playerChangeRequests'],
    queryFn: () => base44.entities.PlayerChangeRequest.list('-created_date', 200),
    enabled: open,
  });

  const pending = requests.filter(r => r.status === 'offen');
  const history = requests.filter(r => r.status !== 'offen').slice(0, 10);

  const approveMutation = useMutation({
    mutationFn: async (req) => {
      const updates = {
        first_name: req.requested_first_name,
        last_name: req.requested_last_name,
        name: `${req.requested_first_name} ${req.requested_last_name}`.trim(),
      };
      if (req.requested_number != null) updates.number = req.requested_number;
      await base44.entities.Player.update(req.player_id, updates);
      return base44.entities.PlayerChangeRequest.update(req.id, {
        status: 'genehmigt',
        reviewed_by_email: user?.email || '',
        admin_note: noteById[req.id] || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playerChangeRequests'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (req) => base44.entities.PlayerChangeRequest.update(req.id, {
      status: 'abgelehnt',
      reviewed_by_email: user?.email || '',
      admin_note: noteById[req.id] || '',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['playerChangeRequests'] }),
  });

  const fullName = (r) => `${r.requested_first_name} ${r.requested_last_name}`.trim();

  const RequestCard = ({ r }) => (
    <div className="border border-border rounded-xl p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            {r.player_name || '–'}
            <span className="text-muted-foreground">→</span>
            <span className="text-primary">{fullName(r)}</span>
          </div>
          {r.current_number != null && r.requested_number != null && r.requested_number !== r.current_number && (
            <div className="text-xs text-muted-foreground">
              Nummer: <span className="font-medium">{r.current_number}</span> → <span className="font-medium text-primary">{r.requested_number}</span>
            </div>
          )}
          {r.reason && <div className="text-xs text-muted-foreground mt-1">„{r.reason}"</div>}
          <div className="text-[11px] text-muted-foreground mt-0.5">
            von {r.requested_by_name || r.requested_by_email || 'unbekannt'}
          </div>
        </div>
      </div>
      {r.status === 'offen' && (
        <>
          <Textarea
            value={noteById[r.id] || ''}
            onChange={e => setNoteById(prev => ({ ...prev, [r.id]: e.target.value }))}
            rows={1}
            placeholder="Admin-Notiz (optional)"
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => approveMutation.mutate(r)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className="gap-1.5 flex-1"
            >
              <Check className="w-3.5 h-3.5" /> Genehmigen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rejectMutation.mutate(r)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className="gap-1.5 flex-1"
            >
              <X className="w-3.5 h-3.5" /> Ablehnen
            </Button>
          </div>
        </>
      )}
      {r.status === 'genehmigt' && (
        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Genehmigt von {r.reviewed_by_email || 'Admin'}
          {r.admin_note && <span className="text-muted-foreground font-normal">· {r.admin_note}</span>}
        </div>
      )}
      {r.status === 'abgelehnt' && (
        <div className="text-xs text-destructive font-medium flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Abgelehnt von {r.reviewed_by_email || 'Admin'}
          {r.admin_note && <span className="text-muted-foreground font-normal">· {r.admin_note}</span>}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Änderungsanträge Spieler</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <Clock className="w-3.5 h-3.5" /> Offen ({pending.length})
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl px-3 py-4 text-center">Keine offenen Anträge.</p>
            ) : (
              <div className="space-y-2">
                {pending.map(r => <RequestCard key={r.id} r={r} />)}
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Verlauf</div>
              <div className="space-y-2">
                {history.map(r => <RequestCard key={r.id} r={r} />)}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}