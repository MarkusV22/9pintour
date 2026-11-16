import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { Shield, History, Filter, ArrowRight, User } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const ACTION_META = {
  score_create: { label: 'Ergebnis erstellt', color: 'bg-green-100 text-green-700 border-green-200' },
  score_update: { label: 'Ergebnis geändert', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  score_delete: { label: 'Ergebnis gelöscht', color: 'bg-red-100 text-red-700 border-red-200' },
  tournament_finish: { label: 'Turnier abgeschlossen', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  tournament_reopen: { label: 'Turnier wiedereröffnet', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

export default function ActionLogAdmin() {
  const { user } = useAuth();
  const [tournamentFilter, setTournamentFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['action-logs'],
    queryFn: () => base44.entities.ActionLog.filter({}, '-created_date', 500),
  });

  const tournamentOptions = useMemo(() => {
    const map = new Map();
    logs.forEach((l) => {
      if (l.tournament_id) map.set(l.tournament_id, l.tournament_name || l.tournament_id);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [logs]);

  const filtered = useMemo(
    () => logs.filter(
      (l) =>
        (!tournamentFilter || l.tournament_id === tournamentFilter) &&
        (!actionFilter || l.action === actionFilter)
    ),
    [logs, tournamentFilter, actionFilter]
  );

  if (!isTurnierAdmin(user)) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Du hast keine Berechtigung für diesen Bereich.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <History className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Action-Log</h1>
          <p className="text-sm text-muted-foreground">Nachverfolgung aller Ergebnis-Änderungen</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row gap-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />Filter:
        </div>
        <select
          value={tournamentFilter}
          onChange={(e) => setTournamentFilter(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">Alle Turniere</option>
          {tournamentOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">Alle Aktionen</option>
          {Object.entries(ACTION_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      {/* Log list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border text-muted-foreground">
          Keine Einträge vorhanden.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const meta = ACTION_META[log.action] || { label: log.action, color: 'bg-muted text-muted-foreground border-border' };
            return (
              <div key={log.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate">{log.tournament_name || log.tournament_id}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {log.player_name && <span>Spieler: <span className="text-foreground font-medium">{log.player_name}</span></span>}
                    {log.team_name && <span className="ml-2">· Mannschaft: <span className="text-foreground font-medium">{log.team_name}</span></span>}
                  </div>
                  {(log.old_value || log.new_value) && (
                    <div className="flex items-center gap-2 text-sm font-mono">
                      {log.old_value && <span className="text-muted-foreground line-through">{log.old_value}</span>}
                      {log.old_value && log.new_value && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      {log.new_value && <span className="text-foreground font-semibold">{log.new_value}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">{log.actor_name || log.actor_email || 'Unbekannt'}</span>
                  </div>
                  {log.actor_email && log.actor_email !== log.actor_name && (
                    <span className="opacity-70">{log.actor_email}</span>
                  )}
                  <span className="opacity-70">
                    {log.created_date ? format(new Date(log.created_date), 'dd.MM.yy HH:mm', { locale: de }) : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}