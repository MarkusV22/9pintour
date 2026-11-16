// Admin: Datenprüfung – Unstimmigkeiten im Datenbestand ansehen und gezielt korrigieren
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchCheck, Copy, Users, Calculator, ExternalLink, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin, isAdmin } from '@/lib/roles';
import { api } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const entry = (e) => `${e.notes} · Platz ${e.position} · ${e.points} P`;

function Section({ icon: Icon, title, count, hint, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
        <div>
          <h2 className="font-semibold">{title} <span className={`ml-1 text-xs font-semibold px-2 py-0.5 rounded-full ${count ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{count || 'keine'}</span></h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {count === 0 ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3"><CheckCircle2 className="w-4 h-4" />Alles in Ordnung.</div>
      ) : children}
    </section>
  );
}

const TLink = ({ id, name }) => <Link to={`/tournaments/${id}`} className="font-semibold text-primary hover:underline inline-flex items-center gap-1">{name}<ExternalLink className="w-3 h-3" /></Link>;
const PLink = ({ id, name }) => <Link to={`/stats?id=${id}`} className="font-medium hover:underline">{name}</Link>;

export default function DataCheck() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState({});
  const { data, isLoading, error } = useQuery({
    queryKey: ['data-check'],
    queryFn: () => api('/admin/data-check'),
    enabled: isTurnierAdmin(user),
  });

  if (!isTurnierAdmin(user)) {
    return <div className="p-6 md:p-8 max-w-4xl mx-auto"><div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Du hast keine Berechtigung für diesen Bereich.</div></div>;
  }

  const rescore = async (t) => {
    if (!window.confirm(`„${t.tournament_name}“ neu werten?\n\nDie gespeicherten Platzierungen und Punkte werden durch die Neuberechnung ersetzt (${t.changed_players} Spieler betroffen). Das wird im Action-Log protokolliert.`)) return;
    setBusy(t.tournament_id);
    try {
      await api(`/admin/tournaments/${t.tournament_id}/rewertung`, { method: 'POST', body: {} });
      setDone((d) => ({ ...d, [t.tournament_id]: true }));
      qc.invalidateQueries();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><SearchCheck className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Datenprüfung</h1>
          <p className="text-sm text-muted-foreground">Unstimmigkeiten im Datenbestand. Es wird nichts automatisch geändert.</p>
        </div>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Prüfe Daten …</div>}
      {error && <div className="text-destructive">{error.message}</div>}

      {data && (
        <>
          <Section icon={Copy} title="Spieler doppelt in einer Turnierwertung" count={data.double_entries.length}
            hint="Derselbe Spieler hat in einem Turnier mehrere Platzierungen – meist nach dem Zusammenführen von Duplikaten. Die Punkte zählen dann doppelt in der Rangliste.">
            <div className="space-y-2">
              {data.double_entries.map((d) => (
                <div key={d.tournament_id + d.player_id} className="bg-card border border-amber-200 rounded-xl p-4 text-sm space-y-1">
                  <div><TLink id={d.tournament_id} name={d.tournament_name} /> · <PLink id={d.player_id} name={d.player_name} /></div>
                  <div className="flex flex-wrap gap-2">{d.entries.map((e, i) => <span key={i} className="font-mono text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5">{entry(e)}</span>)}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={Users} title="Gleicher Name als Herren und Damen" count={data.category_duplicates.length}
            hint="Mögliche Duplikate mit falscher Kategorie. Prüfen und ggf. unter „Spieler-Zusammenlegung“ zusammenführen bzw. die Kategorie korrigieren.">
            <div className="space-y-2">
              {data.category_duplicates.map((g) => (
                <div key={g.name} className="bg-card border border-border rounded-xl p-4 text-sm">
                  <div className="font-semibold mb-2">{g.name}</div>
                  <div className="grid gap-1.5">
                    {g.players.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.category === 'Damen' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{p.category}</span>
                        <PLink id={p.id} name={`Nr. ${p.number ?? '–'}`} />
                        {p.club && <span className="text-muted-foreground">{p.club}</span>}
                        <span className="text-muted-foreground">{p.results} Wertungen · {p.points} P · {p.scores} Ergebnisse · {p.teams} Mannschaften</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Link to="/player-merges" className="text-sm text-primary hover:underline inline-flex items-center gap-1">Zur Spieler-Zusammenlegung <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </Section>

          <Section icon={Calculator} title="Gespeicherte Wertung weicht von Neuberechnung ab" count={data.recalculation.length}
            hint="Platzierungen werden beim Abschluss eines Turniers gespeichert. Wurden danach Spieler, Startpläne oder Regeln geändert, käme heute ein anderes Ergebnis heraus.">
            <div className="space-y-3">
              {data.recalculation.map((t) => (
                <div key={t.tournament_id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
                    <div className="text-sm"><TLink id={t.tournament_id} name={t.tournament_name} /><span className="text-muted-foreground"> · {t.changed_players} Spieler betroffen · Punkte gesamt {t.points_diff >= 0 ? '+' : ''}{t.points_diff}</span></div>
                    {isAdmin(user) && (done[t.tournament_id]
                      ? <span className="text-sm text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />neu gewertet</span>
                      : <Button size="sm" variant="outline" disabled={busy === t.tournament_id} onClick={() => rescore(t)} className="gap-2">
                          {busy === t.tournament_id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Neu werten
                        </Button>)}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-muted-foreground bg-muted/40"><th className="text-left px-4 py-2">Spieler</th><th className="text-left px-4 py-2">Gespeichert (heute in der Rangliste)</th><th className="text-left px-4 py-2">Neu berechnet</th></tr></thead>
                      <tbody>
                        {t.rows.map((r) => (
                          <tr key={r.player_id} className="border-t border-border">
                            <td className="px-4 py-1.5"><PLink id={r.player_id} name={r.player_name} /></td>
                            <td className="px-4 py-1.5 font-mono text-xs">{r.stored.map(entry).join(' / ') || '—'}</td>
                            <td className="px-4 py-1.5 font-mono text-xs">{r.computed.map(entry).join(' / ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
