import { TrendingUp } from 'lucide-react';

const fmt1 = (v) => (v != null && !isNaN(v)) ? v.toFixed(1) : '–';

export default function PlayerOverallStats({ avgPosition, tournamentCount, avgVoll, avgAbraeumen, avgFehlwurf, avgScore }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm text-foreground">Gesamtstatistik</h2>
        <span className="text-xs text-muted-foreground">· Ø über {tournamentCount} {tournamentCount === 1 ? 'Turnier' : 'Turniere'}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-border">
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-amber-500">{fmt1(avgPosition)}</p>
          <p className="text-[10px] text-muted-foreground">Ø Platzierung</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-primary">{fmt1(avgVoll)}</p>
          <p className="text-[10px] text-muted-foreground">Ø Volle</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-primary">{fmt1(avgAbraeumen)}</p>
          <p className="text-[10px] text-muted-foreground">Ø Abräumen</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-bold text-amber-600">{fmt1(avgFehlwurf)}</p>
          <p className="text-[10px] text-muted-foreground">Ø Fehlwurf</p>
        </div>
        <div className="px-4 py-3 text-center col-span-2 sm:col-span-1">
          <p className="text-xl font-bold text-primary">{fmt1(avgScore)}</p>
          <p className="text-[10px] text-muted-foreground">Ø Gesamt</p>
        </div>
      </div>
    </div>
  );
}