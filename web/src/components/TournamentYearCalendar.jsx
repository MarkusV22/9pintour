import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, getDaysInMonth } from 'date-fns';
import { de } from 'date-fns/locale';

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const TIER_COLORS = {
  'Grand Slam':   'bg-yellow-400 border-yellow-500',
  'Masters 1000': 'bg-purple-500 border-purple-600',
  'Masters 500':  'bg-blue-500 border-blue-600',
  'Masters 250':  'bg-green-500 border-green-600',
  'Challenger':   'bg-slate-400 border-slate-500',
  'Finalturnier':  'bg-red-600 border-red-700',
  'Competition':  'bg-gray-500 border-gray-600',
};

const TIER_TEXT = {
  'Grand Slam':   'text-yellow-700 bg-yellow-100',
  'Masters 1000': 'text-purple-700 bg-purple-100',
  'Masters 500':  'text-blue-700 bg-blue-100',
  'Masters 250':  'text-green-700 bg-green-100',
  'Challenger':   'text-slate-700 bg-slate-100',
  'Finalturnier':  'text-red-700 bg-red-100',
  'Competition':  'text-gray-700 bg-gray-100',
};

function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function MonthStrip({ year, month, tournaments }) {
  const daysInMonth = getDaysInMonth(new Date(year, month));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Find tournaments overlapping this month
  const relevant = tournaments.filter(t => {
    const start = parseLocalDate(t.date);
    const end = parseLocalDate(t.end_date || t.date);
    if (!start || !end) return false;
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth);
    return start <= monthEnd && end >= monthStart;
  });

  // Sort by start date so non-overlapping tournaments share a lane (optimal packing)
  const sorted = [...relevant].sort((a, b) => {
    const sa = parseLocalDate(a.date);
    const sb = parseLocalDate(b.date);
    return sa - sb;
  });

  // Assign lanes: stack overlapping tournaments on different rows
  const lanes = []; // each lane holds the end-day of its last bar
  const positioned = sorted.map(t => {
    const start = parseLocalDate(t.date);
    const end = parseLocalDate(t.end_date || t.date);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth);
    const clampedStart = start < monthStart ? monthStart : start;
    const clampedEnd = end > monthEnd ? monthEnd : end;
    const startDay = clampedStart.getDate();
    const endDay = clampedEnd.getDate();

    // Find first lane where the tournament doesn't overlap the lane's last bar
    let laneIndex = lanes.findIndex(laneEnd => startDay > laneEnd);
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push(endDay);
    } else {
      lanes[laneIndex] = endDay;
    }

    const leftPct = ((startDay - 1) / daysInMonth) * 100;
    const widthPct = ((endDay - startDay + 1) / daysInMonth) * 100;
    const colorClass = TIER_COLORS[t.tier] || 'bg-primary border-primary/60';

    return { t, laneIndex, leftPct, widthPct, colorClass };
  });

  const laneCount = lanes.length;
  const stripHeight = Math.max(7, laneCount * 5 + 2);

  const monthName = format(new Date(year, month), 'MMMM', { locale: de });
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-bold w-14 flex-shrink-0 ${isCurrentMonth ? 'text-primary' : 'text-muted-foreground'}`}>
          {monthName.slice(0, 3).toUpperCase()}
        </span>
        <div className={`flex-1 flex relative rounded-lg overflow-hidden bg-muted/30`} style={{ height: `${stripHeight * 4}px` }}>
          {/* Day ticks */}
          <div className="absolute inset-0 flex">
            {days.map(day => {
              const isToday = isCurrentMonth && today.getDate() === day;
              return (
                <div
                  key={day}
                  className="flex-1 border-r border-border/20 last:border-r-0 relative"
                >
                  {isToday && (
                    <div className="absolute inset-0 bg-primary/20 z-10" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Tournament bars */}
          {positioned.map(({ t, laneIndex, leftPct, widthPct, colorClass }) => (
            <Link
              key={t.id}
              to={`/tournaments/${t.id}`}
              title={t.name}
              className="absolute rounded-md border opacity-90 hover:opacity-100 transition-opacity z-20 cursor-pointer"
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 2)}%`,
                top: `${laneIndex * 20 + 3}px`,
                height: '16px',
              }}
            >
              <div className={`w-full h-full rounded-md ${colorClass} flex items-center px-1 overflow-hidden`}>
                <span className="text-white text-[9px] font-semibold truncate leading-none drop-shadow-sm">{t.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TournamentYearCalendar({ tournaments }) {
  const year = useMemo(() => {
    // Use current year, but if tournaments span mostly next year, use that
    const now = new Date();
    return now.getFullYear();
  }, []);

  const tiers = [...new Set(tournaments.map(t => t.tier).filter(Boolean))];

  if (tournaments.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-3 md:p-5 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-bold text-foreground">Jahreskalender {year}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(TIER_TEXT)
            .filter(([tier]) => tiers.includes(tier))
            .map(([tier, cls]) => (
              <span key={tier} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{tier}</span>
            ))}
        </div>
      </div>

      {/* Day number header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="w-14 flex-shrink-0" />
        <div className="flex-1 relative h-4">
          {[1, 5, 10, 15, 20, 25, 30].map(d => (
            <span key={d} className="absolute text-[9px] text-muted-foreground/60 select-none" style={{ left: `${((d - 1) / 31) * 100}%` }}>{d}</span>
          ))}
        </div>
      </div>

      <div>
        {MONTHS.map(month => (
          <MonthStrip
            key={month}
            year={year}
            month={month}
            tournaments={tournaments}
          />
        ))}
      </div>

      {/* Today marker legend */}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        <div className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/40 flex-shrink-0" />
        <span>Heute</span>
      </div>
    </div>
  );
}