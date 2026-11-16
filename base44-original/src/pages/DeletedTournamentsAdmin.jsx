import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { TrashIcon, RotateCcw, Calendar, MapPin, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function DeletedTournamentsAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 500),
  });

  const deletedTournaments = tournaments.filter(t => t.deleted_at);

  const restoreMutation = useMutation({
    mutationFn: (id) => base44.entities.Tournament.update(id, { deleted_at: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  });

  const permanentlyDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Tournament.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  });

  if (!isTurnierAdmin(user)) {
    return (
      <div className="p-8">
        <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </Link>
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <p className="text-sm text-muted-foreground">Zugriff verweigert</p>
        </div>
      </div>
    );
  }

  const getDaysLeft = (deletedAt) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const daysAgo = Math.floor((now - deleted) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(0, 30 - daysAgo);
    return { daysAgo, daysLeft };
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl w-full">
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Zurück zu Turniere
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Gelöschte Turniere</h1>
        <p className="text-muted-foreground mt-1">Gelöschte Turniere können innerhalb von 30 Tagen wiederhergestellt werden</p>
      </div>

      {deletedTournaments.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border">
          <TrashIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Keine gelöschten Turniere</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deletedTournaments.map((t) => {
            const { daysLeft } = getDaysLeft(t.deleted_at);
            const isExpired = daysLeft === 0;
            return (
              <div
                key={t.id}
                className={`flex items-center justify-between p-5 rounded-2xl border ${
                  isExpired
                    ? 'bg-red-50/50 border-red-200'
                    : 'bg-card border-border hover:border-primary/20 hover:shadow-sm transition-all'
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center flex-shrink-0">
                    <TrashIcon className={`w-5 h-5 ${isExpired ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold text-foreground truncate ${isExpired ? 'line-through opacity-60' : ''}`}>{t.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(t.date), 'dd. MMM yyyy', { locale: de })}
                      </span>
                      {t.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {t.location}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full ${isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isExpired ? 'Verfall heute' : `${daysLeft} Tag${daysLeft !== 1 ? 'e' : ''} verbleibend`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {!isExpired && (
                    <button
                      onClick={() => restoreMutation.mutate(t.id)}
                      disabled={restoreMutation.isPending}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-green-50 hover:text-green-700 hover:border-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Turnier wiederherstellen"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Wiederherstellen
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Turnier "${t.name}" wirklich permanent löschen? Dies kann nicht rückgängig gemacht werden.`)) {
                        permanentlyDeleteMutation.mutate(t.id);
                      }
                    }}
                    disabled={permanentlyDeleteMutation.isPending}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 hover:text-destructive hover:border-red-200 border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground"
                    title="Permanent löschen"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}