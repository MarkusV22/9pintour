import { Users, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function EinzelstarterList({ einzelstarter = [], playerMap = [], tournament, canEdit, onDelete, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (einzelstarter.length === 0) return null;

  const ezPaidIds = (() => { try { return JSON.parse(tournament?.einzelstarter_paid_ids || '[]'); } catch { return []; } })();
  const ezOnlinePaidIds = (() => { try { return JSON.parse(tournament?.einzelstarter_online_paid_ids || '[]'); } catch { return []; } })();

  return (
    <div className="bg-card rounded-2xl border border-amber-200 mb-6 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-600" />
          <span className="font-semibold text-sm text-foreground">Einzelstarter</span>
          <span className="text-xs text-muted-foreground">({einzelstarter.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          <div className="divide-y divide-border/40">
            {einzelstarter.map(es => {
              const pData = playerMap[es.player_id];
              const name = pData?.name || `${pData?.first_name || ''} ${pData?.last_name || ''}`.trim() || es.player_id;
              const cat = pData?.category || '';
              const catBadge = cat === 'Herren' ? 'bg-blue-100 text-blue-700' : cat === 'Damen' ? 'bg-pink-100 text-pink-700' : 'bg-muted text-muted-foreground';
              const isPaidCash = ezPaidIds.includes(es.player_id);
              const isPaidOnline = ezOnlinePaidIds.includes(es.player_id);
              return (
                <div key={es.id} className="flex items-center justify-between px-2 py-2.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-muted">{es.start_time}</span>
                    {cat && <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${catBadge}`}>{cat}</span>}
                    <span className="text-sm font-medium text-foreground truncate">{name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">Bahn {es.lane}</span>
                    {tournament?.payment_enabled && (isPaidCash || isPaidOnline) && (
                      <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full flex-shrink-0">✓ Bezahlt</span>
                    )}
                  </div>
                  {canEdit && onDelete && (
                    <button
                      className="opacity-40 hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 hover:text-destructive text-muted-foreground flex-shrink-0"
                      onClick={() => onDelete(es.id)}
                      title="Spieler entfernen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}