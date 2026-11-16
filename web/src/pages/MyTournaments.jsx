import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Trophy, LogIn, User, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useSeasons } from '@/lib/useSeason';
import { getTierLabel } from '@/lib/tournamentPoints';

function parseDayConfigs(str) {
  try {
    const parsed = JSON.parse(str || '');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

function dayLabel(schedule, tournament) {
  if (!schedule.day) return '';
  const days = parseDayConfigs(tournament?.day_configs);
  if (!days) return schedule.day;
  const idx = days.findIndex(d => d.date === schedule.day || d.name === schedule.day);
  if (idx >= 0 && days[idx].name) return days[idx].name;
  try {
    return format(new Date(schedule.day), 'dd.MM.yyyy');
  } catch {
    return schedule.day;
  }
}

// Tatsächliches Datum des Slots — auftgelöst aus den Spieltag-Konfigurationen.
// Fällt auf das Turnier-Datum zurück, wenn keine Tagesinfo vorhanden ist.
function slotDate(schedule, tournament) {
  if (schedule.day) {
    const days = parseDayConfigs(tournament?.day_configs);
    if (days) {
      const match = days.find(d => d.date === schedule.day || d.name === schedule.day);
      if (match?.date) return match.date;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(schedule.day)) return schedule.day;
  }
  return tournament?.date;
}

export default function MyTournaments() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { activeSeason } = useSeasons();

  const { data: myProfile } = useQuery({
    queryKey: ['my-profile', user?.email],
    queryFn: () => base44.entities.Player.filter({ user_email: user.email }),
    select: (data) => data[0] || null,
    enabled: !!user,
  });

  const playerId = myProfile?.id;

  const { data: allTournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-date', 500),
  });

  const { data: allSchedules = [], isLoading: loadingSchedules } = useQuery({
    queryKey: ['all-schedules'],
    queryFn: () => base44.entities.TournamentSchedule.list('-created_date', 5000),
    enabled: !!playerId,
  });

  const { data: allScores = [], isLoading: loadingScores } = useQuery({
    queryKey: ['all-scores'],
    queryFn: () => base44.entities.TournamentScore.list('-created_date', 5000),
    enabled: !!playerId,
  });

  const { data: allTeams = [] } = useQuery({
    queryKey: ['all-teams'],
    queryFn: () => base44.entities.Team.list('-created_date', 5000),
    enabled: !!playerId,
  });

  const teamMap = useMemo(() => {
    const m = {};
    allTeams.forEach(t => { m[t.id] = t; });
    return m;
  }, [allTeams]);

  const tournamentMap = useMemo(() => {
    const m = {};
    allTournaments.forEach(t => { m[t.id] = t; });
    return m;
  }, [allTournaments]);

  const mySchedules = useMemo(() => {
    if (!playerId) return [];
    return allSchedules
      .filter(s => s.player_id === playerId)
      .sort((a, b) => {
        const ta = `${a.day || ''} ${a.start_time || ''}`;
        const tb = `${b.day || ''} ${b.start_time || ''}`;
        return ta.localeCompare(tb);
      });
  }, [allSchedules, playerId]);

  const myScores = useMemo(() => {
    if (!playerId) return [];
    return allScores
      .filter(s => s.player_id === playerId)
      .sort((a, b) => {
        const ta = tournamentMap[a.tournament_id]?.date || '';
        const tb = tournamentMap[b.tournament_id]?.date || '';
        return tb.localeCompare(ta);
      });
  }, [allScores, playerId, tournamentMap]);

  const upcomingSchedules = useMemo(() => {
    const seen = new Set();
    return mySchedules.filter(s => {
      if (seen.has(s.tournament_id)) return false;
      const t = tournamentMap[s.tournament_id];
      if (!t || t.status === 'abgeschlossen') return false;
      seen.add(s.tournament_id);
      return true;
    });
  }, [mySchedules, tournamentMap]);
  const pastSchedules = useMemo(() => {
    const seen = new Set();
    return mySchedules
      .filter(s => {
        if (seen.has(s.tournament_id)) return false;
        const t = tournamentMap[s.tournament_id];
        if (!t || t.status !== 'abgeschlossen') return false;
        if (activeSeason) {
          const d = t.date?.slice(0, 10) || '';
          if (d < activeSeason.start_date || d > activeSeason.end_date) return false;
        }
        seen.add(s.tournament_id);
        return true;
      })
      .sort((a, b) => {
        const ta = tournamentMap[b.tournament_id]?.date || '';
        const tb = tournamentMap[a.tournament_id]?.date || '';
        return ta.localeCompare(tb);
      });
  }, [mySchedules, tournamentMap, activeSeason]);

  // Group scores by tournament for the dropdown
  const scoresByTournament = useMemo(() => {
    const m = {};
    myScores.forEach(s => {
      if (!m[s.tournament_id]) m[s.tournament_id] = [];
      m[s.tournament_id].push(s);
    });
    return m;
  }, [myScores]);

  // Score pro Slot (schedule_id) — damit laufende Turniere schon
  // eingetragene Ergebnisse direkt in "Meine Startzeiten" zeigen.
  const scoreBySchedule = useMemo(() => {
    const m = {};
    myScores.forEach(s => {
      if (s.schedule_id) m[s.schedule_id] = s;
    });
    return m;
  }, [myScores]);

  // Fallback für Team-Turniere: dort wird der Score klassisch über team_id +
  // player_id gespeichert, ohne dass eine schedule_id am Score-Datensatz steht.
  const scoreByTeam = useMemo(() => {
    const m = {};
    myScores.forEach(s => {
      if (s.team_id) m[s.team_id] = s;
    });
    return m;
  }, [myScores]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-10 text-center max-w-md w-full">
          <User className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Meine Turniere</h1>
          <p className="text-sm text-muted-foreground mb-6">Melde dich an, um deine gebuchten Startzeiten und Ergebnisse zu sehen.</p>
          <Button onClick={() => base44.auth.redirectToLogin(window.location.href)} className="gap-2 w-full">
            <LogIn className="w-4 h-4" />Jetzt anmelden
          </Button>
        </div>
      </div>
    );
  }

  if (!myProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-10 text-center max-w-md w-full">
          <User className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Kein Profil verknüpft</h1>
          <p className="text-sm text-muted-foreground mb-6">Verknüpfe dein Spielerprofil, um deine Turniere zu sehen.</p>
          <Link to="/player-profile">
            <Button className="gap-2 w-full">
              <User className="w-4 h-4" />Profil verknüpfen
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full overflow-x-hidden space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Meine Turniere</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Übersicht deiner gebuchten Startzeiten und erzielten Ergebnisse
        </p>
      </div>

      {/* Upcoming Start Times */}
      <section>
        <h2 className="text-base md:text-lg font-bold text-foreground mb-3 md:mb-4 flex items-center gap-2 flex-wrap">
          <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
          <span>Meine Startzeiten</span>
          <span className="text-sm font-normal text-muted-foreground">({upcomingSchedules.length})</span>
        </h2>
        {loadingSchedules ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : upcomingSchedules.length === 0 ? (
          <div className="text-center py-10 bg-card rounded-2xl border border-dashed border-border">
            <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Du hast aktuell keine gebuchten Startzeiten.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingSchedules.map(s => {
              const t = tournamentMap[s.tournament_id];
              if (!t) return null;
              // Team-Turnier: Score per team_id suchen (Score hat oft keine schedule_id).
              // Einzelstarter: Score per schedule_id suchen.
              const slotScore = (s.team_id ? scoreByTeam[s.team_id] : null) || scoreBySchedule[s.id];
              return (
                <Link
                  key={s.id}
                  to={`/tournaments/${t.id}${s.day ? `?day=${encodeURIComponent(s.day)}` : ''}`}
                  className="flex items-center gap-3 p-3 md:gap-4 md:p-4 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors overflow-hidden"
                >
                  <div className="flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center">
                    {(() => {
                      const d = slotDate(s, t);
                      return d ? (
                        <>
                          <span className="text-[9px] md:text-[10px] uppercase text-primary font-bold leading-none">
                            {format(new Date(d), 'MMM', { locale: de })}
                          </span>
                          <span className="text-base md:text-lg font-bold text-primary leading-none mt-0.5">
                            {format(new Date(d), 'dd')}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-primary">—</span>
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm md:text-base text-foreground truncate">{t.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs text-muted-foreground mt-1">
                      {s.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{s.start_time}
                        </span>
                      )}
                      {s.lane && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />Bahn {s.lane}
                        </span>
                      )}
                      {s.day && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />{dayLabel(s, t)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {slotScore ? (
                      <div className="flex flex-col items-end">
                        <p className="text-xl md:text-2xl font-black text-primary leading-none">{slotScore.score}</p>
                        <p className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">Score</p>
                      </div>
                    ) : (
                      <>
                        <span className="text-[10px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-muted text-muted-foreground whitespace-nowrap">{getTierLabel(t) || 'Turnier'}</span>
                        {t.location && <p className="text-[10px] md:text-xs text-muted-foreground mt-1 truncate max-w-[90px] md:max-w-[120px]">{t.location}</p>}
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Past Tournaments (current season, dropdown with results) */}
      <section>
        <h2 className="text-base md:text-lg font-bold text-foreground mb-3 md:mb-4 flex items-center gap-2 flex-wrap">
          <Trophy className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <span>Vergangene Turniere</span>
          {activeSeason && <span className="text-sm font-normal text-muted-foreground">– {activeSeason.name}</span>}
          <span className="text-sm font-normal text-muted-foreground">({pastSchedules.length})</span>
        </h2>
        {loadingScores ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : pastSchedules.length === 0 ? (
          <div className="text-center py-10 bg-card rounded-2xl border border-dashed border-border">
            <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Keine vergangenen Turniere in dieser Saison.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastSchedules.map(s => {
              const t = tournamentMap[s.tournament_id];
              if (!t) return null;
              const tournamentScores = scoresByTournament[s.tournament_id] || [];
              const bestScore = tournamentScores.length > 0 ? Math.max(...tournamentScores.map(sc => sc.score || 0)) : 0;
              return (
                <PastTournamentItem
                  key={s.id}
                  tournament={t}
                  scores={tournamentScores}
                  bestScore={bestScore}
                  dayLabel={dayLabel(s, t)}
                  teamMap={teamMap}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function parseVAF(notesStr) {
  try {
    const p = JSON.parse(notesStr || '');
    if (Array.isArray(p)) {
      return {
        voll: p.reduce((s, r) => s + (parseInt(r.voll) || 0), 0),
        abr: p.reduce((s, r) => s + (parseInt(r.abraeumen) || 0), 0),
        feh: p.reduce((s, r) => s + (parseInt(r.fehlwurf) || 0), 0),
      };
    }
    if (p && typeof p === 'object') {
      const v = parseInt(p.voll); const a = parseInt(p.abraeumen); const f = parseInt(p.fehlwurf);
      return { voll: isNaN(v) ? null : v, abr: isNaN(a) ? null : a, feh: isNaN(f) ? null : f };
    }
  } catch {}
  return { voll: null, abr: null, feh: null };
}

function PastTournamentItem({ tournament, scores, bestScore, dayLabel, teamMap }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-3 md:gap-4 md:p-4 hover:bg-accent/30 transition-colors overflow-hidden"
      >
        <div className="flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-xl bg-amber-500/10 flex flex-col items-center justify-center">
          <span className="text-[9px] md:text-[10px] uppercase text-amber-600 font-bold leading-none">
            {tournament.date ? format(new Date(tournament.date), 'MMM', { locale: de }) : '—'}
          </span>
          <span className="text-base md:text-lg font-bold text-amber-600 leading-none mt-0.5">
            {tournament.date ? format(new Date(tournament.date), 'dd') : '—'}
          </span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-semibold text-sm md:text-base text-foreground truncate">{tournament.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {tournament.date ? format(new Date(tournament.date), 'dd.MM.yyyy', { locale: de }) : '—'}
            </span>
            {dayLabel && <span className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{dayLabel}</span>}
            {tournament.location && <span className="truncate max-w-[100px] md:max-w-[140px]">{tournament.location}</span>}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xl md:text-2xl font-black text-amber-600 leading-none">{bestScore}</p>
          <p className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">Bestes</p>
        </div>
        <ChevronDown className={`w-4 h-4 md:w-5 md:h-5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border bg-muted/30">
          {scores.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Keine Einzelergebnisse vorhanden.</p>
          ) : (
            <div className="divide-y divide-border">
              {scores.map((sc, i) => {
                const { voll, abr, feh } = parseVAF(sc.notes);
                const team = sc.team_id ? teamMap[sc.team_id] : null;
                return (
                  <div key={sc.id || i} className="px-3 md:px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground whitespace-nowrap">
                          <Calendar className="w-3 h-3" />
                          {tournament.date ? format(new Date(tournament.date), 'dd.MM.yyyy', { locale: de }) : '—'}
                        </span>
                        {sc.category && <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground whitespace-nowrap">{sc.category}</span>}
                        {sc.group && <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground whitespace-nowrap">{sc.group}</span>}
                      </div>
                      <span className="text-base md:text-lg font-bold text-foreground whitespace-nowrap">{sc.score}</span>
                    </div>
                    {team && (
                      <p className="text-[11px] md:text-xs text-muted-foreground truncate">👥 {team.name}</p>
                    )}
                    {(voll != null || abr != null || feh != null) && (
                      <div className="grid grid-cols-3 gap-1.5 text-[11px] md:text-xs">
                        {voll != null && <span className="text-muted-foreground">Volle: <span className="font-semibold text-foreground">{voll}</span></span>}
                        {abr != null && <span className="text-muted-foreground">Abräumen: <span className="font-semibold text-foreground">{abr}</span></span>}
                        {feh != null && <span className="text-muted-foreground">Fehlwurf: <span className="font-semibold text-foreground">{feh}</span></span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-4 py-2 border-t border-border">
            <Link to={`/tournaments/${tournament.id}`} className="text-xs text-primary hover:underline">
              Zum Turnier →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}