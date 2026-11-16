import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { History, Filter, ArrowRight, User, UserPlus, UserCog, UserMinus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const ACTION_META = {
  create: { label: 'Neu angelegt', color: 'bg-green-100 text-green-700 border-green-200', Icon: UserPlus },
  update: { label: 'Geändert', color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: UserCog },
  delete: { label: 'Gelöscht', color: 'bg-red-100 text-red-700 border-red-200', Icon: UserMinus },
};

const FIELD_LABELS = {
  first_name: 'Vorname',
  last_name: 'Nachname',
  number: 'Nummer',
  category: 'Kategorie',
  age_class: 'Altersklasse',
  club: 'Verein',
  phone: 'Telefon',
  whatsapp: 'WhatsApp',
  photo_url: 'Foto',
  birth_date: 'Geburtsdatum',
  personal_best: 'Bestleistung',
  walk_on_song: 'Walk-on Song',
  user_email: 'App-Nutzer',
  privacy_accepted: 'Datenschutz',
};

function tryParse(str) {
  try { return JSON.parse(str || ''); } catch { return {}; }
}

function formatVal(field, val) {
  if (val == null) return '–';
  if (field === 'privacy_accepted') return val ? 'Ja' : 'Nein';
  if (field === 'whatsapp') return val ? 'Ja' : 'Nein';
  if (field === 'birth_date') {
    try { return format(new Date(val), 'dd.MM.yyyy'); } catch { return String(val); }
  }
  if (typeof val === 'boolean') return val ? 'Ja' : 'Nein';
  return String(val);
}

export default function PlayerActionLogAdmin() {
  const { user } = useAuth();
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['player-action-logs'],
    queryFn: () => base44.entities.PlayerActionLog.filter({}, '-created_date', 500),
  });

  const filtered = useMemo(
    () => logs.filter(l => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (l.player_name || '').toLowerCase().includes(q) ||
          (l.actor_name || '').toLowerCase().includes(q) ||
          (l.actor_email || '').toLowerCase().includes(q) ||
          (l.player_id || '').toLowerCase().includes(q);
      }
      return true;
    }),
    [logs, actionFilter, search]
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
          <h1 className="text-xl md:text-2xl font-bold">Spieler-Action-Log</h1>
          <p className="text-sm text-muted-foreground">Nachverfolgung aller Änderungen in der Spieler-Datenbank</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />Filter:
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Spieler oder Nutzer suchen…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
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
            const meta = ACTION_META[log.action] || { label: log.action, color: 'bg-muted text-muted-foreground border-border', Icon: User };
            const Icon = meta.Icon;
            const changed = tryParse(log.changed_fields);
            const oldV = tryParse(log.old_values);
            const newV = tryParse(log.new_values);
            return (
              <div key={log.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                        <Icon className="w-3 h-3" />{meta.label}
                      </span>
                      <span className="text-sm font-semibold text-foreground truncate">{log.player_name || 'Unbekannt'}</span>
                    </div>
                    {changed.length > 0 && (
                      <div className="space-y-1">
                        {changed.map(f => (
                          <div key={f} className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground min-w-[90px]">{FIELD_LABELS[f] || f}:</span>
                            {log.action !== 'create' && oldV[f] != null && (
                              <span className="text-muted-foreground line-through">{formatVal(f, oldV[f])}</span>
                            )}
                            {log.action !== 'create' && oldV[f] != null && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                            {log.action !== 'delete' && (
                              <span className="text-foreground font-semibold">{formatVal(f, newV[f])}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span className="font-medium text-foreground">{log.actor_name || log.actor_email || 'System'}</span>
                    </div>
                    {log.actor_email && log.actor_email !== log.actor_name && (
                      <span className="opacity-70">{log.actor_email}</span>
                    )}
                    <span className="opacity-70">
                      {log.created_date ? format(new Date(log.created_date), 'dd.MM.yy HH:mm', { locale: de }) : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}