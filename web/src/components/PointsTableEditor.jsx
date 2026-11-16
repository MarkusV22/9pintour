import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, CheckCircle2, RotateCcw } from 'lucide-react';
import { TIERS, POINTS_TABLE, PLACEMENT_GROUPS } from '@/lib/tournamentPoints';

const defaultTable = () => JSON.parse(JSON.stringify(POINTS_TABLE));

export default function PointsTableEditor({ onSave }) {
  const [table, setTable] = useState(defaultTable());
  const [saved, setSaved] = useState(false);

  const setValue = (tier, groupIndex, val) => {
    setTable(prev => {
      const next = { ...prev, [tier]: [...prev[tier]] };
      next[tier][groupIndex] = parseInt(val) || 0;
      return next;
    });
  };

  const handleSave = () => {
    Object.keys(table).forEach(tier => {
      POINTS_TABLE[tier] = [...table[tier]];
    });
    setSaved(true);
    if (onSave) onSave(table);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => setTable(defaultTable());

  const onChange = (tier, groupIndex, val) => {
    setValue(tier, groupIndex, val);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Punkte pro Platzierungsgruppe und Turnierkategorie anpassen.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5" />
            Zurücksetzen
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave}>
            {saved
              ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Gespeichert</>
              : <><Save className="w-3.5 h-3.5" /> Speichern</>}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left py-3 px-5 text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/40">
                Kategorie
              </th>
              {PLACEMENT_GROUPS.map(g => (
                <th key={g.label} className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground whitespace-nowrap min-w-[60px]">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIERS.map(tier => (
              <tr key={tier.value} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="py-3 px-5 sticky left-0 bg-card">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tier.color}`}>
                    {tier.label}
                  </span>
                </td>
                {PLACEMENT_GROUPS.map((g, i) => (
                  <td key={g.label} className="py-2 px-1">
                    <Input
                      type="number"
                      min="0"
                      value={table[tier.value][i]}
                      onChange={e => setValue(tier.value, i, e.target.value)}
                      className="h-8 text-center font-bold w-14 mx-auto px-1"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}