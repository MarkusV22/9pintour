import { Plus, Trash2, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LANE_OPTIONS = [4, 6, 8];

/**
 * Editor für die Spielort-Liste eines Multi-Spielort-Turniers.
 * props:
 *  - venues: Array<{ name, location, lane_count }>
 *  - onChange: (venues) => void
 */
export default function VenuesEditor({ venues = [], onChange, minVenues = 2 }) {
  const list = venues.length > 0 ? venues : [{ name: '', location: '', lane_count: 4 }];

  const update = (i, fields) => {
    const next = list.map((v, idx) => (idx === i ? { ...v, ...fields } : v));
    onChange(next);
  };
  const remove = (i) => {
    if (list.length <= 1) return;
    onChange(list.filter((_, idx) => idx !== i));
  };
  const add = () => {
    onChange([...list, { name: '', location: '', lane_count: 4 }]);
  };

  return (
    <div className="space-y-3">
      {list.map((venue, i) => (
        <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Spielort {i + 1}
            </span>
            {list.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Spielort entfernen"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Bezeichnung</Label>
              <Input
                value={venue.name || ''}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder={`z.B. ${i === 0 ? 'Spielort A' : 'Spielort B'}`}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ort / Adresse</Label>
              <Input
                value={venue.location || ''}
                onChange={(e) => update(i, { location: e.target.value })}
                placeholder="z.B. Sporthalle Wien, Musterstraße 1"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bahnenzahl</Label>
            <div className="flex gap-2">
              {LANE_OPTIONS.map((lanes) => (
                <button
                  key={lanes}
                  type="button"
                  onClick={() => update(i, { lane_count: lanes })}
                  className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${
                    (venue.lane_count || 4) === lanes
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-700'
                      : 'border-border bg-background text-muted-foreground hover:border-emerald-400'
                  }`}
                >
                  {lanes} Bahnen
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700 border border-dashed border-emerald-400 rounded-xl py-2.5 hover:bg-emerald-50 transition-colors"
      >
        <Plus className="w-4 h-4" /> Spielort hinzufügen
      </button>
      {list.length < minVenues && (
        <p className="text-xs text-amber-600">
          Mindestens {minVenues} Spielorte erforderlich für ein Multi-Spielort-Turnier.
        </p>
      )}
    </div>
  );
}