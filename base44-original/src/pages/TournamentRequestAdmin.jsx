import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TIERS } from '@/lib/tournamentPoints';
import { MapPin, Calendar, Users, Phone, Mail, Trophy, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const STATUS_STYLES = {
  neu: 'bg-blue-100 text-blue-700',
  in_bearbeitung: 'bg-amber-100 text-amber-700',
  genehmigt: 'bg-green-100 text-green-700',
  abgelehnt: 'bg-red-100 text-red-700',
};
const STATUS_LABELS = {
  neu: 'Neu',
  in_bearbeitung: 'In Bearbeitung',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
};

export default function TournamentRequestAdmin() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [assignedTier, setAssignedTier] = useState('');
  const [coEmail, setCoEmail] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');

  const isAdmin = isAuthenticated && isTurnierAdmin(user);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['tournament-requests'],
    queryFn: () => base44.entities.TournamentRequest.list('-created_date', 200),
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TournamentRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-requests'] });
      setSelected(null);
    },
  });

  const createTournamentMutation = useMutation({
    mutationFn: async (req) => {
      return base44.entities.Tournament.create({
        name: req.tournament_name,
        date: req.tournament_date,
        end_date: req.tournament_end_date || req.tournament_date,
        location: req.location,
        tier: assignedTier || 'Masters 250',
        team_size: req.team_size || 4,
        slot_duration: req.slot_duration || 60,
        lane_count: req.lane_count || 4,
        description: req.description || '',
        co_organizer_emails: req.co_organizer_email ? [req.co_organizer_email] : [],
      });
    },
    onSuccess: () => {
      updateMutation.mutate({ id: selected.id, data: { status: 'genehmigt', admin_notes: adminNotes, assigned_tier: assignedTier, co_organizer_email: coEmail } });
    },
  });

  const handleOpen = (req) => {
    setSelected(req);
    setAdminNotes(req.admin_notes || '');
    setAssignedTier(req.assigned_tier || 'Masters 250');
    setCoEmail(req.co_organizer_email || req.organizer_email || '');
  };

  const handleApprove = () => {
    createTournamentMutation.mutate(selected);
  };

  const handleReject = () => {
    updateMutation.mutate({ id: selected.id, data: { status: 'abgelehnt', admin_notes: adminNotes } });
  };

  const handleSaveNotes = () => {
    updateMutation.mutate({ id: selected.id, data: { status: 'in_bearbeitung', admin_notes: adminNotes, assigned_tier: assignedTier, co_organizer_email: coEmail } });
  };

  const filtered = statusFilter === 'alle' ? requests : requests.filter(r => r.status === statusFilter);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Kein Zugriff. Diese Seite ist nur für Administratoren.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl w-full">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Turnieranfragen</h1>
          <p className="text-sm text-muted-foreground">{requests.length} Anfrage{requests.length !== 1 ? 'n' : ''} gesamt</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['alle', 'neu', 'in_bearbeitung', 'genehmigt', 'abgelehnt'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'alle' ? 'Alle' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center">
          <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Keine Anfragen vorhanden.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div
              key={req.id}
              className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between gap-4 flex-wrap"
              onClick={() => handleOpen(req)}
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{req.tournament_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[req.status] || 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABELS[req.status] || req.status}
                    </span>
                    {req.assigned_tier && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TIERS.find(t => t.value === req.assigned_tier)?.color || 'bg-muted text-foreground'}`}>
                        {TIERS.find(t => t.value === req.assigned_tier)?.label || req.assigned_tier}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{req.organizer_name}</span>
                    {req.tournament_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(req.tournament_date), 'dd.MM.yyyy', { locale: de })}
                      </span>
                    )}
                    {req.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                {selected.tournament_name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {/* Status */}
              <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[selected.status]}`}>
                {STATUS_LABELS[selected.status]}
              </span>

              {/* Kontakt */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Veranstalter</p>
                <p className="text-sm font-medium">{selected.organizer_name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{selected.organizer_email}</p>
                {selected.organizer_phone && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{selected.organizer_phone}</p>}
              </div>

              {/* Turnier Info */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Turnier</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Datum</span>
                  <span>{selected.tournament_date ? format(new Date(selected.tournament_date), 'dd.MM.yyyy', { locale: de }) : '–'}</span>
                  {selected.tournament_end_date && selected.tournament_end_date !== selected.tournament_date && <>
                    <span className="text-muted-foreground">Bis</span>
                    <span>{format(new Date(selected.tournament_end_date), 'dd.MM.yyyy', { locale: de })}</span>
                  </>}
                  <span className="text-muted-foreground">Ort</span>
                  <span>{selected.location}</span>
                  <span className="text-muted-foreground">Kategorien</span>
                  <span>{selected.categories || '–'}</span>
                  <span className="text-muted-foreground">Teams</span>
                  <span>{selected.expected_teams || '–'}</span>
                  <span className="text-muted-foreground">Bahnen</span>
                  <span>{selected.lane_count || '–'}</span>
                  <span className="text-muted-foreground">Teamgröße</span>
                  <span>{selected.team_size === 1 ? 'Einzelturnier' : `${selected.team_size}er-Teams`}</span>
                  <span className="text-muted-foreground">Durchgang</span>
                  <span>{selected.slot_duration} min</span>
                </div>
                {selected.description && (
                  <div className="pt-2 border-t border-border mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Anmerkungen</p>
                    <p className="text-sm">{selected.description}</p>
                  </div>
                )}
              </div>

              {/* Admin Bereich */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin-Bereich</p>

                <div className="space-y-1.5">
                  <Label>Tierkategorie zuweisen</Label>
                  <div className="flex gap-2 flex-wrap">
                    {TIERS.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setAssignedTier(t.value)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                          assignedTier === t.value ? `${t.color} border-transparent scale-105` : 'bg-background text-muted-foreground border-border hover:border-primary'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Mitveranstalter E-Mail (für App-Zugriffsrechte)</Label>
                  <Input
                    value={coEmail}
                    onChange={e => setCoEmail(e.target.value)}
                    placeholder="E-Mail des App-Nutzers"
                  />
                  <p className="text-xs text-muted-foreground">Diese E-Mail erhält beim Genehmigen Verwaltungsrechte für das Turnier.</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Interne Notizen</Label>
                  <Textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    placeholder="Interne Kommentare..."
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={handleSaveNotes} disabled={updateMutation.isPending}>
                <Clock className="w-3.5 h-3.5 mr-1" /> Speichern
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={handleReject}
                disabled={updateMutation.isPending}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Ablehnen
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={createTournamentMutation.isPending || updateMutation.isPending || !assignedTier}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {createTournamentMutation.isPending ? 'Wird erstellt...' : 'Genehmigen & Turnier erstellen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}