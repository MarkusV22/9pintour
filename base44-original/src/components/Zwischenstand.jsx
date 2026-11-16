import { Fragment, useMemo, useState, useRef, useEffect } from 'react';
import { TrendingUp, Star } from 'lucide-react';
import { usePlayerMap } from '@/lib/usePlayerMap';
import { collectPlayerEntries } from '@/lib/collectPlayerEntries';

const AGE_CLASSES = ['U-10', 'U-15', 'U-19', 'U-23', 'Allgemeine Klasse', 'Ü-50', 'Ü-60'];

// Kurzform für Mobile: "M. Mustermann" (Initial + Nachname)
function shortName(full) {
  if (!full) return '';
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

// Vor- und Nachname splitten
function splitName(full) {
  if (!full) return { first: '', last: '' };
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const PlayerName = ({ name, bullet = false }) => (
  <>
    <span className="md:hidden">{bullet ? '· ' : ''}{shortName(name)}</span>
    <span className="hidden md:inline">{bullet ? '· ' : ''}{name}</span>
  </>
);

// Gestapelte Mobile-Darstellung: Vorname klein fett, Nachname groß fett, Teamname klein darunter
const StackedPlayerName = ({ name, teamName }) => {
  const { first, last } = splitName(name);
  return (
    <>
      {/* Mobile: gestapelt */}
      <div className="md:hidden min-w-0">
        <div className="text-xs font-bold text-foreground leading-tight truncate">{first}</div>
        <div className="text-base font-bold text-foreground leading-tight truncate uppercase">{last}</div>
        {teamName && <div className="text-xs text-muted-foreground truncate">{teamName}</div>}
      </div>
      {/* Desktop: wie bisher */}
      <div className="hidden md:block min-w-0">
        <div className="font-semibold text-sm text-foreground truncate">{name}</div>
        {teamName && <div className="text-xs text-muted-foreground truncate">{teamName}</div>}
      </div>
    </>
  );
};

const catColor = {
  Herren: { header: 'text-blue-600', medal: ['bg-amber-400', 'bg-gray-300', 'bg-amber-600'] },
  Damen:  { header: 'text-pink-600',  medal: ['bg-amber-400', 'bg-gray-300', 'bg-amber-600'] },
  Mixed:  { header: 'text-purple-600', medal: ['bg-amber-400', 'bg-gray-300', 'bg-amber-600'] },
};

function RankTable({ title, headerColor = 'text-foreground', rows, hideAbraeumen = false }) {
  if (rows.length === 0) return null;
  const medals = ['bg-amber-400', 'bg-gray-300', 'bg-amber-600'];
  const hasVA = rows.some(r => r.voll != null);
  const showAbr = hasVA && !hideAbraeumen;
  const topScore = rows[0]?.score ?? 0;
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden min-w-0">
      <div className="px-5 py-3 border-b border-border">
        <h2 className={`font-bold text-base ${headerColor}`}>{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-10" />
            <col />
            {hasVA && <col className="w-9" />}
            {showAbr && <col className="w-9" />}
            {hasVA && <col className="w-9" />}
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">#</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Spieler</th>
              {hasVA && <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Volle</th>}
              {showAbr && <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Abr.</th>}
              {hasVA && <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Fehl.</th>}
              <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">∑</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const gap = i > 0 && row.score != null ? topScore - row.score : 0;
              return (
                <tr key={`${row.playerId}-${i}`} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold text-white ${medals[i] || 'bg-muted text-foreground'}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 min-w-0 align-top">
                    <StackedPlayerName name={row.name} teamName={row.teamName} />
                  </td>
                  {hasVA && <td className="py-2.5 px-1 text-right text-xs text-muted-foreground tabular-nums">{row.voll ?? '–'}</td>}
                  {showAbr && <td className="py-2.5 px-1 text-right text-xs text-muted-foreground tabular-nums">{row.abraeumen ?? '–'}</td>}
                  {hasVA && <td className="py-2.5 px-1 text-right text-xs text-muted-foreground tabular-nums">{row.fehlwurf ?? '–'}</td>}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs font-bold text-primary tabular-nums">{row.score ?? '–'}</span>
                      {gap > 0 ? <span className="text-[10px] text-red-500 font-medium tabular-nums w-8 text-left">-{gap}</span> : <span className="w-8" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Hobby-Mannschaftstabelle: Teams mit vollständigem Lochkegel-Kader
function HobbyTeamTable({ result }) {
  if (result.length === 0) return null;
  const medals = ['bg-amber-400', 'bg-gray-300', 'bg-amber-600'];
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden min-w-0">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-bold text-base text-emerald-600">Mannschaft – Hobby</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">#</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Mannschaft</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">∑</th>
            </tr>
          </thead>
          <tbody>
            {result.map((row, i) => {
              const gap = i > 0 && row.total ? result[0].total - row.total : 0;
              const scoredCount = row.playerResults.filter(pr => pr.score != null).length;
              return (
                <Fragment key={row.team.id}>
                  <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold text-white ${medals[i] || 'bg-muted text-foreground'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 min-w-0 align-top">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate">{row.team.name}</span>
                        <span title="Hobby-Mannschaft" className="inline-flex items-center flex-shrink-0">
                          <Star className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{scoredCount} Spieler</div>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm font-bold text-primary tabular-nums">{row.total || '–'}</span>
                        {gap > 0 ? <span className="text-[10px] text-red-500 font-medium tabular-nums w-8 text-left">-{gap}</span> : <span className="w-8" />}
                      </div>
                    </td>
                  </tr>
                  {row.playerResults.map(pr => (
                    <tr key={pr.playerId} className="border-b border-border/20 bg-muted/5">
                      <td className="py-1 px-3" />
                      <td className="py-1 px-3 min-w-0">
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <PlayerName name={pr.name} bullet />
                          <Star className="w-3 h-3 text-amber-500 flex-shrink-0" fill="currentColor" />
                        </span>
                      </td>
                      <td className="py-1 px-3 text-right text-xs font-medium text-foreground tabular-nums">{pr.score ?? '–'}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// No-Show: Spieler nicht angetreten – zählt wie kein Score.
function isNoShowNotes(notesStr) {
  try {
    return JSON.parse(notesStr || '')?.no_show === true;
  } catch {}
  return false;
}

// Helper: parse volle + abraeumen from score notes
function parseVA(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) {
      return { voll: parseInt(parsed.voll) || 0, abraeumen: parseInt(parsed.abraeumen) || 0 };
    }
    if (Array.isArray(parsed)) {
      return {
        voll: parsed.reduce((s, b) => s + (parseInt(b.voll) || 0), 0),
        abraeumen: parsed.reduce((s, b) => s + (parseInt(b.abraeumen) || 0), 0),
      };
    }
  } catch {}
  return { voll: null, abraeumen: null };
}

function parseFehlwurf(notesStr) {
  try {
    const parsed = JSON.parse(notesStr || '');
    if (parsed?.gesamt === true) {
      return parseInt(parsed.fehlwurf) || 0;
    }
    if (Array.isArray(parsed)) {
      return parsed.reduce((s, b) => s + (parseInt(b.fehlwurf) || 0), 0);
    }
  } catch {}
  return null;
}

export default function Zwischenstand({ teams, scores, schedules = [], isFuture = false }) {
  const { playerMap, getPlayerName } = usePlayerMap();
  // Einheitliche Spieler-Liste (Mannschaften + Einzelstarter) für Einzelwertungen.
  // Lochkegel-Spieler zählen ab sofort als normale Spieler in der Tour-Wertung.
  const playerEntries = useMemo(
    () => collectPlayerEntries(teams, scores, schedules, playerMap, true, isFuture),
    [teams, scores, schedules, playerMap, isFuture]
  );

  // Team rankings by category
  const teamRanked = useMemo(() => {
    return ['Herren', 'Damen', 'Mixed'].map(cat => {
      const catTeams = teams.filter(t => t.category === cat);
      const result = catTeams.map(team => {
        // Deduplicate: keep only best score per player within this team
        const seen = {};
        scores.filter(s => s.team_id === team.id).forEach(s => {
          const cur = seen[s.player_id];
          if (!cur || s.score > cur.score || (s.score === cur.score && parseVA(s.notes).abraeumen > parseVA(cur.notes).abraeumen)) {
            seen[s.player_id] = s;
          }
        });
        const teamScores = Object.values(seen);
        const rosterIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
        const playerResults = rosterIds
          .map(playerId => {
            const ps = teamScores.find(s => s.player_id === playerId);
            const va = parseVA(ps?.notes);
            return { playerId, name: getPlayerName(playerId), score: ps && !isNoShowNotes(ps.notes) ? ps.score : null, voll: va.voll, abraeumen: va.abraeumen, fehlwurf: parseFehlwurf(ps?.notes), isHobby: !!playerMap[playerId]?.is_hobby };
          })
          // Spieler innerhalb des Teams nach Ergebnis sortieren (bester oben)
          .sort((a, b) => {
            if ((b.score ?? -1) !== (a.score ?? -1)) return (b.score ?? -1) - (a.score ?? -1);
            if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
            return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
          });
        // Summe nur über Spieler, die aktuell im Kader stehen – verhindert,
        // dass Scores vormals zugeordneter (mittlerweile entfernten) Spieler
        // die Mannschaftssumme verfälschen.
        const total = playerResults.reduce((sum, pr) => sum + (pr.score || 0), 0);
        const scoredCount = playerResults.filter(pr => pr.score != null).length;
        const avg = scoredCount > 0 ? Math.round((total / scoredCount) * 10) / 10 : null;
        return { team, total, playerResults, avg, isHobbyTeam: playerResults.length > 0 && playerResults.every(pr => pr.isHobby) };
      })
      .filter(row => row.total > 0) // hide teams with no scores
      .sort((a, b) => b.total - a.total);
      return { cat, result };
    }).filter(c => c.result.length > 0);
  }, [teams, scores, playerMap]);

  // Hobby-Mannschaften: Teams, deren kompletter Kader aus Lochkegel-Spielern besteht
  const hobbyTeamRows = useMemo(() => {
    const rows = [];
    teamRanked.forEach(({ result }) => result.forEach(row => { if (row.isHobbyTeam) rows.push(row); }));
    return rows.sort((a, b) => b.total - a.total);
  }, [teamRanked]);

  // Hobby-Einzelwertung: nur als Lochkegel markierte Spieler, getrennt nach Geschlecht
  const hobbyByGender = useMemo(() => {
    return ['Herren', 'Damen'].map(gender => {
      const bestPerPlayer = {};
      playerEntries.forEach(({ playerId, teamName, teamCategory, score, notes }) => {
        if (score == null) return;
        const playerData = playerMap[playerId];
        if (!playerData?.is_hobby) return;
        const pGender = playerData?.category || teamCategory;
        if (pGender !== gender) return;
        const va = parseVA(notes);
        const fehlwurf = (() => { try { const p = JSON.parse(notes || ''); return parseInt(p.fehlwurf) || 0; } catch { return null; } })();
        if (!bestPerPlayer[playerId] || score > bestPerPlayer[playerId].score || (score === bestPerPlayer[playerId].score && va.abraeumen > bestPerPlayer[playerId].abraeumen)) {
          bestPerPlayer[playerId] = { playerId, name: getPlayerName(playerId), score, teamName, voll: va.voll, abraeumen: va.abraeumen, fehlwurf };
        }
      });
      const rows = Object.values(bestPerPlayer).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
        return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
      });
      return { gender, rows };
    }).filter(g => g.rows.length > 0);
  }, [playerEntries, playerMap, getPlayerName]);

  // Individual rankings by gender – only best score per player_id
  const individualByGender = useMemo(() => {
    return ['Herren', 'Damen'].map(gender => {
      const bestPerPlayer = {};
      playerEntries.forEach(({ playerId, teamName, teamCategory, score, notes }) => {
        if (score == null) return;
        const playerData = playerMap[playerId];
        const pGender = playerData?.category || teamCategory;
        if (pGender !== gender) return;
        const va = parseVA(notes);
        const fehlwurf = (() => { try { const p = JSON.parse(notes || ''); return parseInt(p.fehlwurf) || 0; } catch { return null; } })();
        if (!bestPerPlayer[playerId] || score > bestPerPlayer[playerId].score || (score === bestPerPlayer[playerId].score && va.abraeumen > bestPerPlayer[playerId].abraeumen)) {
          bestPerPlayer[playerId] = { playerId, name: getPlayerName(playerId), score, teamName, voll: va.voll, abraeumen: va.abraeumen, fehlwurf };
        }
      });
      const rows = Object.values(bestPerPlayer).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
        return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
      });
      return { gender, rows };
    }).filter(g => g.rows.length > 0);
  }, [playerEntries, playerMap, getPlayerName]);

  // Individual by age class, split by gender – only best score per player_id
  const individualByAgeClass = useMemo(() => {
    const result = [];
    AGE_CLASSES.forEach(ageClass => {
      ['Herren', 'Damen'].forEach(gender => {
        const bestPerPlayer = {};
        playerEntries.forEach(({ playerId, teamName, teamCategory, score, notes }) => {
          if (score == null) return;
          const playerData = playerMap[playerId];
          if (!playerData) return;
          if ((playerData.age_class || 'Allgemeine Klasse') !== ageClass) return;
          if ((playerData.category || teamCategory) !== gender) return;
          const va2 = parseVA(notes);
          const fehlwurf2 = (() => { try { const p = JSON.parse(notes || ''); return parseInt(p.fehlwurf) || 0; } catch { return null; } })();
          if (!bestPerPlayer[playerId] || score > bestPerPlayer[playerId].score || (score === bestPerPlayer[playerId].score && va2.abraeumen > bestPerPlayer[playerId].abraeumen)) {
            bestPerPlayer[playerId] = { playerId, name: getPlayerName(playerId), score, teamName, voll: va2.voll, abraeumen: va2.abraeumen, fehlwurf: fehlwurf2 };
          }
        });
        const rows = Object.values(bestPerPlayer).sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if ((b.abraeumen ?? -1) !== (a.abraeumen ?? -1)) return (b.abraeumen ?? -1) - (a.abraeumen ?? -1);
          return (a.fehlwurf ?? 999) - (b.fehlwurf ?? 999);
        });
        if (rows.length > 0) {
          result.push({ ageClass, gender, rows });
        }
      });
    });
    return result;
  }, [playerEntries, playerMap, getPlayerName]);

  // Quick-jump targets to avoid scrolling between sections
  const teamTargets = useMemo(() => {
    const targets = [];
    if (teamRanked.some(c => c.cat === 'Herren')) targets.push({ id: 'mannschaft-herren', label: 'Team Herren' });
    if (teamRanked.some(c => c.cat === 'Damen')) targets.push({ id: 'mannschaft-damen', label: 'Team Damen' });
    if (teamRanked.some(c => c.cat === 'Mixed')) targets.push({ id: 'mannschaft-mixed', label: 'Team Mixed' });
    return targets;
  }, [teamRanked]);
  const einzelTargets = useMemo(() => {
    const targets = [];
    if (individualByGender.some(g => g.gender === 'Herren')) targets.push({ id: 'einzel-herren', label: 'Einzel Herren' });
    if (individualByGender.some(g => g.gender === 'Damen')) targets.push({ id: 'einzel-damen', label: 'Einzel Damen' });
    return targets;
  }, [individualByGender]);
  const jumpTargets = useMemo(() => [...teamTargets, ...einzelTargets], [teamTargets, einzelTargets]);

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // JS-basiertes "Stick-on-Scroll": die Leiste klebt oben am Bildschirmrand,
  // sobald ihr natürlicher Platz nach oben aus dem Viewport scrollt. Rein CSS
  // „sticky" funktioniert nicht, da Vorfahren overflow-x-hidden verwenden und
  // damit einen Scroll-Container bilden, der selbst nicht scrollt.
  const sentinelRef = useRef(null);
  const barRef = useRef(null);
  const [stuck, setStuck] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  // Linker/rechter Versatz der fixierten Leiste – wird an der Content-Kante
  // ausgerichtet, damit die Leiste auf Desktop nicht über die Sidebar ragt.
  const [barInset, setBarInset] = useState({ left: 0, right: 0 });

  useEffect(() => {
    if (jumpTargets.length < 2) return;
    const update = () => {
      const el = sentinelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStuck(rect.top < 0);
      setBarInset({ left: Math.max(0, rect.left), right: Math.max(0, window.innerWidth - rect.right) });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [jumpTargets.length]);

  useEffect(() => {
    if (barRef.current) setBarHeight(barRef.current.offsetHeight);
  }, [stuck, jumpTargets.length]);

  if (scores.length === 0) {
    return (
      <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed border-border">
        <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-semibold text-foreground">Noch keine Scores eingetragen</p>
        <p className="text-sm text-muted-foreground mt-1">Trage im Tab „Ergebnisse" die Scores ein</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {jumpTargets.length >= 2 && (
        <div>
          {/* Sentinel markiert den natürlichen Platz der Leiste */}
          <div ref={sentinelRef} aria-hidden="true" />
          {stuck && <div style={{ height: barHeight }} aria-hidden="true" />}
          <div
            ref={barRef}
            style={stuck ? { left: barInset.left, right: barInset.right } : undefined}
            className={stuck
              ? 'fixed top-0 z-30 px-2 pt-1 pb-1.5 bg-background/95 backdrop-blur-sm shadow-sm'
              : 'py-2 -mx-4 md:-mx-8 px-4 md:px-8'}
          >
            <div className="flex flex-col gap-1 bg-card/95 border border-border rounded-xl px-2.5 py-1.5 shadow-sm">
              {teamTargets.length > 0 && (
                <div className="flex flex-nowrap gap-1.5 justify-center overflow-x-auto">
                  {teamTargets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => scrollToSection(t.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              {einzelTargets.length > 0 && (
                <div className="flex flex-nowrap gap-1.5 justify-center overflow-x-auto">
                  {einzelTargets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => scrollToSection(t.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {teamRanked.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Mannschaftswertung</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {teamRanked.map(({ cat, result }) => {
              const colors = catColor[cat];
              return (
                <div key={cat} id={`mannschaft-${cat.toLowerCase()}`} className="bg-card rounded-2xl border border-border overflow-hidden min-w-0 scroll-mt-24">
                  <div className="px-5 py-3 border-b border-border">
                    <h2 className={`font-bold text-base ${colors.header}`}>{cat}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-10" />
                        <col />
                        <col className="w-9" />
                        <col className="w-9" />
                        <col className="w-9" />
                        <col className="w-16" />
                      </colgroup>
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">#</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Mannschaft</th>
                          <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Volle</th>
                          <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Abr.</th>
                          <th className="text-right py-2 px-1 text-xs font-semibold text-muted-foreground">Fehl.</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">∑</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.map((row, i) => {
                          const teamGap = i > 0 && row.total ? result[0].total - row.total : 0;
                          return (
                        <>
                          <tr key={row.team.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold text-white ${colors.medal[i] || 'bg-muted text-foreground'}`}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-sm text-foreground truncate" colSpan={4}>
                              <span className="inline-flex items-center gap-1.5">
                                {row.team.name}
                                {row.isHobbyTeam && (
                                  <span title="Hobby-Mannschaft" className="inline-flex items-center">
                                    <Star className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                           <div className="flex flex-col items-end">
                                             <div className="flex items-center justify-end gap-1">
                                               <span className="font-bold text-primary tabular-nums">{row.total || '–'}</span>
                                               {teamGap > 0 ? <span className="text-[10px] text-red-500 font-medium tabular-nums w-8 text-left">-{teamGap}</span> : <span className="w-8" />}
                                             </div>
                                             {row.avg != null && <span className="text-[10px] text-muted-foreground tabular-nums">Ø {row.avg}</span>}
                                           </div>
                                         </td>
                          </tr>
                          {row.playerResults.map(pr => (
                            <tr key={pr.playerId} className="border-b border-border/20 bg-muted/5">
                              <td className="py-1 px-3 text-xs text-muted-foreground truncate" colSpan={2}>
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <PlayerName name={pr.name} bullet />
                                {pr.isHobby && (
                                  <span title="Hobbysportler/in" className="inline-flex items-center flex-shrink-0">
                                    <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
                                  </span>
                                )}
                              </span>
                            </td>
                              <td className="py-1 px-1 text-right text-xs text-muted-foreground tabular-nums">{pr.voll ?? '–'}</td>
                              <td className="py-1 px-1 text-right text-xs text-muted-foreground tabular-nums">{pr.abraeumen ?? '–'}</td>
                              <td className="py-1 px-1 text-right text-xs text-muted-foreground tabular-nums">{pr.fehlwurf ?? '–'}</td>
                              <td className="py-1 px-3 text-right text-xs font-medium text-foreground tabular-nums">{pr.score ?? '–'}</td>
                            </tr>
                          ))}
                        </>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {individualByGender.length > 0 && !isFuture && (
        <section>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Einzelwertung Herren / Damen</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(() => {
              const herren = individualByGender.find(g => g.gender === 'Herren');
              return herren ? <div id="einzel-herren" className="scroll-mt-24"><RankTable title="Einzel – Herren" headerColor="text-blue-600" rows={herren.rows} showTeam /></div> : <div />;
            })()}
            {(() => {
              const damen = individualByGender.find(g => g.gender === 'Damen');
              return damen ? <div id="einzel-damen" className="scroll-mt-24"><RankTable title="Einzel – Damen" headerColor="text-pink-600" rows={damen.rows} showTeam /></div> : <div />;
            })()}
          </div>
        </section>
      )}

      {individualByAgeClass.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Einzelwertung nach Altersklassen</h3>
          {[...AGE_CLASSES].sort((a, b) => {
            if (a === 'Allgemeine Klasse') return -1;
            if (b === 'Allgemeine Klasse') return 1;
            return 0;
          }).map(ageClass => {
            const herrenRow = individualByAgeClass.find(g => g.ageClass === ageClass && g.gender === 'Herren');
            const damenRow  = individualByAgeClass.find(g => g.ageClass === ageClass && g.gender === 'Damen');
            if (!herrenRow && !damenRow) return null;
            return (
              <div key={ageClass} className="mb-6">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{ageClass}</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {herrenRow ? <RankTable title={`${ageClass} – Herren`} headerColor="text-blue-600" rows={herrenRow.rows} showTeam hideAbraeumen={ageClass === 'U-10'} /> : <div />}
                  {damenRow  ? <RankTable title={`${ageClass} – Damen`}  headerColor="text-pink-600"  rows={damenRow.rows}  showTeam hideAbraeumen={ageClass === 'U-10'} /> : <div />}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {hobbyTeamRows.length > 0 || hobbyByGender.length > 0 ? (
        <section>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Hobbywertung</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {hobbyTeamRows.length > 0 && <HobbyTeamTable result={hobbyTeamRows} />}
            {hobbyByGender.map(({ gender, rows }) => (
              <RankTable
                key={gender}
                title={`Hobby – ${gender}`}
                headerColor={gender === 'Herren' ? 'text-blue-600' : 'text-pink-600'}
                rows={rows}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}