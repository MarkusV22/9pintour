import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, MapPin, Plus, Trash2, ArrowRight, ClipboardList, Trash as TrashIcon, Video, Users, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin, isTournamentOrganizer } from '@/lib/roles';
import { useSeasons } from '@/lib/useSeason';
import TournamentYearCalendar from '@/components/TournamentYearCalendar';
import { useBrandingLogos } from '@/lib/useBrandingLogos';
import { computeSlotStats } from '@/lib/slotCalculator';

const statusColors = {
  geplant: 'bg-blue-100 text-blue-700 border-blue-200',
  laufend: 'bg-amber-100 text-amber-700 border-amber-200',
  abgeschlossen: 'bg-green-100 text-green-700 border-green-200'
};

function getEffectiveStatus(t) {
  if (t.status === 'abgeschlossen') return 'abgeschlossen';
  const today = new Date().toISOString().slice(0, 10);
  const start = t.date?.slice(0, 10);
  const end = (t.end_date || t.date)?.slice(0, 10);
  if (start && today >= start && today <= end) return 'laufend';
  return t.status;
}

export default function TournamentList() {
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showFuture, setShowFuture] = useState(false);
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { activeSeason } = useSeasons();
  const { tierLogoUrls } = useBrandingLogos();

  const { data: allTournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 500)
  });

  const { data: allSchedules = [] } = useQuery({
    queryKey: ['all-schedules'],
    queryFn: () => base44.entities.TournamentSchedule.list('-created_date', 5000)
  });

  // Filter to active season if one is set, and exclude soft-deleted tournaments
  const tournaments = (activeSeason ?
  allTournaments.filter((t) => {
    if (!t.date) return false;
    const d = t.date.slice(0, 10);
    return d >= activeSeason.start_date && d <= activeSeason.end_date;
  }) :
  allTournaments).filter(t => !t.deleted_at);

  const filteredTournaments = tournaments.filter(t => {
    if (t.series_type === 'future') return showFuture;
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Tournament.update(id, { deleted_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setDeleteDialog(null);
      setDeletePassword('');
    }
  });

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Turniere</h1>
          <p className="text-muted-foreground mt-1">
            {activeSeason ? <span>Saison <span className="font-semibold text-primary">{activeSeason.name}</span></span> : 'Alle Turniere der Serie'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/turnier-anmelden">
            <Button variant="outline" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Turnier anmelden
            </Button>
          </Link>
          {isTurnierAdmin(user) &&
          <>
            <Link to="/deleted-tournaments">
              <Button variant="outline" className="gap-2">
                <TrashIcon className="w-4 h-4" />
                Gelöschte Turniere
              </Button>
            </Link>
            <Link to="/tournaments/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Neues Turnier
              </Button>
            </Link>
          </>
          }
        </div>
      </div>

      {/* Hinweisbanner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 md:px-5 md:py-3.5 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground">Möchten Sie ein Turnier veranstalten? Melden Sie sich an und wir nehmen Ihr Turnier in die offizielle Tourwertung auf.


          </p>
        </div>
        <Link to="/turnier-anmelden">
          <Button size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 whitespace-nowrap">
            Jetzt anmelden <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      <TournamentYearCalendar tournaments={filteredTournaments} />

      {/* Filter: 9PinFuture ein- und ausblenden */}
      <div className="flex items-center gap-2 mt-6 mb-6 flex-wrap">
        <button
          onClick={() => setShowFuture(v => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${showFuture ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'}`}
        >
          <Sparkles className="w-4 h-4" />
          {showFuture ? '9PinFuture Turniere ausblenden' : '9PinFuture Turniere einblenden'}
        </button>
      </div>

      {isLoading ?
      <div className="space-y-3">
          {[1, 2, 3].map((i) =>
        <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />
        )}
        </div> :
      filteredTournaments.length === 0 ?
      <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-semibold text-foreground">Noch keine Turniere</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Lege dein erstes Turnier an</p>
          {isTurnierAdmin(user) &&
        <Link to="/tournaments/new">
              <Button size="sm">Turnier anlegen</Button>
            </Link>
        }
        </div> :

      <div className="space-y-3">
          {filteredTournaments.map((t) =>
        <div
          key={t.id}
          className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 md:p-5 bg-card rounded-2xl border border-border hover:border-primary/20 hover:shadow-sm transition-all group">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              {t.logo_url && (
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                  <img src={t.logo_url} alt={t.name} className="w-full h-full object-contain p-1" />
                </div>
              )}
              <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                {tierLogoUrls[t.tier] ? (
                  <img src={tierLogoUrls[t.tier]} alt={t.tier} title={t.tier} className="w-full h-full object-contain p-1" />
                ) : (
                  <Trophy className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                )}
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-base md:text-lg leading-tight flex items-center gap-1.5 flex-wrap">
                {t.name}
                {t.series_type === 'future' && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <Sparkles className="w-3 h-3" />
                    9PinFuture
                  </span>
                )}
                {t.livestream_url && (
                  <a
                    href={t.livestream_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex-shrink-0"
                    title="Livestream öffnen"
                  >
                    <Video className="w-3.5 h-3.5" />
                  </a>
                )}
              </p>
              <div className="flex items-center gap-2 md:gap-3 mt-1 text-xs md:text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(t.date), 'dd. MMMM yyyy', { locale: de })}
                </span>
                {t.location &&
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {t.location}
                  </span>
                }
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
                {getEffectiveStatus(t) !== 'abgeschlossen' && (() => {
                  const stats = computeSlotStats(t, allSchedules);
                  if (!stats || stats.total === 0) return null;
                  const pct = stats.occupied / stats.total;
                  if (pct >= 1) {
                    return (
                      <span className="text-xs font-medium px-3 py-1 rounded-full border bg-red-100 text-red-700 border-red-300 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Kein Startplatz mehr verfügbar
                      </span>
                    );
                  }
                  const color = pct >= 0.9
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : pct >= 0.75
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  return (
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${color} flex items-center gap-1`}>
                      <Users className="w-3 h-3" />
                      {stats.free} / {stats.total} frei
                    </span>
                  );
                })()}
                <span className={`text-xs font-medium px-3 py-1 rounded-full border ${statusColors[getEffectiveStatus(t)] || ''}`}>
                  {getEffectiveStatus(t)}
                </span>
                <Link to={`/tournaments/${t.id}`}>
                  <Button variant="ghost" size="icon" className="rounded-xl">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                {isTournamentOrganizer(user, t) &&
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteDialog(t)}>
              
                    <Trash2 className="w-4 h-4" />
                  </Button>
            }
              </div>
            </div>
        )}
        </div>
      }

      {/* Delete Tournament Dialog */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg max-w-sm w-full p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Turnier löschen?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Das Löschen von <strong>{deleteDialog.name}</strong> kann nicht rückgängig gemacht werden. Alle Mannschaften, Ergebnisse und Zeitpläne werden gelöscht.
              </p>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Sicherheitspasswort eingeben:</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Passwort"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setDeleteDialog(null);
                  setDeletePassword('');
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (deletePassword === 'delete') {
                    deleteMutation.mutate(deleteDialog.id);
                  } else {
                    alert('Falsches Passwort');
                    setDeletePassword('');
                  }
                }}
                disabled={deleteMutation.isPending || deletePassword !== 'delete'}
                className="flex-1 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteMutation.isPending ? 'Wird gelöscht...' : 'Löschen'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Passwort: <span className="font-mono">delete</span> · Daten bleiben 30 Tage wiederrufbar
            </p>
          </div>
        </div>
      )}
    </div>);

}