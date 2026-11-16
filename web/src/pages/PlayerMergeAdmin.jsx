import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Merge, AlertTriangle, CheckCircle2, Search, RefreshCw, Link2, Pencil, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PlayerMergeAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [repairSearches, setRepairSearches] = useState({});
  const [repairTargets, setRepairTargets] = useState({});
  const [repairMessages, setRepairMessages] = useState({});
  const [manualSearch, setManualSearch] = useState('');
  const [keepPlayerId, setKeepPlayerId] = useState(null);
  const [removePlayerId, setRemovePlayerId] = useState(null);
  const [mergeMessage, setMergeMessage] = useState(null);

  const isAdmin = isTurnierAdmin(user);

  // Fetch merge history
  const { data: merges = [], isLoading: mergesLoading } = useQuery({
    queryKey: ['playerMerges'],
    queryFn: () => base44.entities.PlayerMerge.list('-created_date', 200),
    enabled: isAdmin,
  });

  // Fetch all players (for dropdown selection)
  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('created_date', 2000),
    enabled: isAdmin,
  });

  // Fetch orphaned refs
  const { data: orphanData, isLoading: orphansLoading, refetch: refetchOrphans } = useQuery({
    queryKey: ['orphanedPlayerRefs'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getOrphanedPlayerRefs', {});
      return res.data;
    },
    enabled: isAdmin,
  });

  const orphans = orphanData?.orphans || [];

  const getFilteredPlayers = (search) => players.filter(p => {
    if (!search) return true;
    return String(p.number || '').includes(search.trim());
  });

  const manualResults = manualSearch.trim()
    ? players.filter(p => {
        const name = (p.name || `${p.first_name} ${p.last_name}`).toLowerCase();
        const q = manualSearch.toLowerCase().trim();
        return name.includes(q) || String(p.number || '').includes(q) || p.id.toLowerCase().includes(q);
      }).slice(0, 50)
    : [];

  const manualMergeMutation = useMutation({
    mutationFn: async ({ keepId, removeId }) => {
      const res = await base44.functions.invoke('mergePlayers', { keepId, removeId });
      return res.data;
    },
    onSuccess: (data) => {
      setMergeMessage({ type: 'success', text: `Erfolgreich zusammengelegt: ${data.keepPlayerName}` });
      setKeepPlayerId(null);
      setRemovePlayerId(null);
      setManualSearch('');
      queryClient.invalidateQueries({ queryKey: ['orphanedPlayerRefs'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['playerMerges'] });
    },
    onError: (err) => {
      setMergeMessage({ type: 'error', text: err?.response?.data?.error || 'Fehler beim Zusammenlegen' });
    },
  });

  const repairMutation = useMutation({
    mutationFn: async ({ orphanId, targetId }) => {
      const res = await base44.functions.invoke('mergePlayers', { keepId: targetId, removeId: orphanId });
      return res.data;
    },
    onSuccess: (data, variables) => {
      setRepairMessages(prev => ({ ...prev, [variables.orphanId]: { type: 'success', text: `Erfolgreich repariert → ${data.keepPlayerName}` } }));
      queryClient.invalidateQueries({ queryKey: ['orphanedPlayerRefs'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['playerMerges'] });
      setRepairTargets(prev => { const next = { ...prev }; delete next[variables.orphanId]; return next; });
    },
    onError: (err, variables) => {
      setRepairMessages(prev => ({ ...prev, [variables.orphanId]: { type: 'error', text: err?.response?.data?.error || 'Fehler beim Reparieren' } }));
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Du hast keine Berechtigung für diesen Bereich.
          </CardContent>
        </Card>
      </div>
    );
  }

  const playerLabel = (p) => p ? `${p.name || `${p.first_name} ${p.last_name}`}${p.number ? ` (#${p.number})` : ''}${p.club ? ` · ${p.club}` : ''}` : '';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Merge className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Spieler-Zusammenlegung</h1>
          <p className="text-sm text-muted-foreground">Verwaltung von zusammengelegten Profilen und verwaisten Referenzen</p>
        </div>
      </div>

      {/* ── Orphaned References (Repair Tool) ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-base">Verwaiste Referenzen</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchOrphans()} disabled={orphansLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${orphansLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Spieler-IDs, die in Turnieren/Teams referenziert sind, aber nicht mehr als Spieler existieren. Weise sie einem existierenden Spieler zu, um die Anzeige wiederherzustellen.</p>
        </CardHeader>
        <CardContent>
          {orphansLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lade verwaiste Referenzen…</div>
          ) : orphans.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <p>Keine verwaisten Referenzen gefunden.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{orphans.length}</span> verwaiste Spieler-ID(s) gefunden
              </div>
              {orphans.map((orphan) => {
                const msg = repairMessages[orphan.player_id];
                return (
                  <div key={orphan.player_id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{orphan.player_id}</code>
                      <div className="flex flex-wrap gap-1.5">
                        {orphan.scores > 0 && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Scores: {orphan.scores}</span>}
                        {orphan.schedules > 0 && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Spielpläne: {orphan.schedules}</span>}
                        {orphan.results > 0 && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Ergebnisse: {orphan.results}</span>}
                        {orphan.teams > 0 && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Teams: {orphan.teams}</span>}
                      </div>
                    </div>
                    {msg?.type === 'success' ? (
                      <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        {msg.text}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input value={repairSearches[orphan.player_id] || ''} onChange={e => setRepairSearches(prev => ({ ...prev, [orphan.player_id]: e.target.value }))} placeholder="Spielernummer eingeben…" className="pl-9 h-9 text-sm" />
                        </div>
                        {repairTargets[orphan.player_id] && (
                          <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="font-medium truncate">{playerLabel(players.find(p => p.id === repairTargets[orphan.player_id]))}</span>
                            <button onClick={() => setRepairTargets(prev => { const next = { ...prev }; delete next[orphan.player_id]; return next; })} className="ml-auto text-xs text-muted-foreground hover:text-destructive">× Zurücksetzen</button>
                          </div>
                        )}
                        {!repairTargets[orphan.player_id] && (
                          <div className="max-h-48 overflow-y-auto border border-border rounded-lg">
                            {getFilteredPlayers(repairSearches[orphan.player_id] || '').length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">Keine Spieler gefunden</p>
                            ) : getFilteredPlayers(repairSearches[orphan.player_id] || '').map(p => (
                              <button
                                key={p.id}
                                onClick={() => setRepairTargets(prev => ({ ...prev, [orphan.player_id]: p.id }))}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 border-b border-border/40 last:border-b-0 transition-colors"
                              >
                                <span className="font-medium">{p.name || `${p.first_name} ${p.last_name}`}</span>
                                {p.number ? <span className="text-xs text-muted-foreground ml-1.5">#{p.number}</span> : null}
                                {p.club ? <span className="text-xs text-muted-foreground ml-1.5">· {p.club}</span> : null}
                                <code className="text-[10px] font-mono text-muted-foreground/50 block">{p.id}</code>
                              </button>
                            ))}
                          </div>
                        )}
                        <Button
                          size="sm"
                          disabled={!repairTargets[orphan.player_id] || repairMutation.isPending}
                          onClick={() => repairMutation.mutate({ orphanId: orphan.player_id, targetId: repairTargets[orphan.player_id] })}
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1.5" />
                          Reparieren
                        </Button>
                      </div>
                    )}
                    {msg?.type === 'error' && <p className="text-sm text-destructive">{msg.text}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Manual Merge ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Manuelle Zusammenlegung</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Suche nach Name, Nummer oder Spieler-ID, wähle einen Spieler zum Behalten und einen zum Zusammenlegen.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={manualSearch}
              onChange={(e) => { setManualSearch(e.target.value); setMergeMessage(null); }}
              placeholder="Spieler suchen (Name, Nummer oder ID)…"
              className="pl-9"
            />
          </div>

          {mergeMessage && (
            <div className={`flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2 ${mergeMessage.type === 'success' ? 'text-green-700 bg-green-50 border border-green-200' : 'text-destructive bg-destructive/10 border border-destructive/20'}`}>
              {mergeMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {mergeMessage.text}
            </div>
          )}

          {manualResults.length > 0 && (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {manualResults.map(p => {
                const isKeep = keepPlayerId === p.id;
                const isRemove = removePlayerId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 border rounded-lg p-2.5 transition-colors ${
                      isKeep ? 'border-green-400 bg-green-50' : isRemove ? 'border-red-400 bg-red-50' : 'border-border'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.name || `${p.first_name} ${p.last_name}`}
                        {p.number ? <span className="text-xs text-muted-foreground ml-1.5">#{p.number}</span> : null}
                        {p.club ? <span className="text-xs text-muted-foreground ml-1.5">· {p.club}</span> : null}
                      </div>
                      <code className="text-[10px] font-mono text-muted-foreground/60 truncate block">{p.id}</code>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setKeepPlayerId(isKeep ? null : p.id); if (isRemove) setRemovePlayerId(null); }}
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                          isKeep ? 'bg-green-600 text-white border-green-600' : 'bg-card text-green-700 border-green-300 hover:bg-green-50'
                        }`}
                      >
                        Behalten
                      </button>
                      <button
                        onClick={() => { setRemovePlayerId(isRemove ? null : p.id); if (isKeep) setKeepPlayerId(null); }}
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                          isRemove ? 'bg-red-600 text-white border-red-600' : 'bg-card text-red-700 border-red-300 hover:bg-red-50'
                        }`}
                      >
                        Zusammenlegen
                      </button>
                      <Link to="/players" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Spieler bearbeiten">
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {keepPlayerId && removePlayerId && (
            <div className="flex items-center gap-3 flex-wrap border border-border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs font-semibold text-green-700">Behalten:</span>
                <span className="font-medium">{playerLabel(players.find(p => p.id === keepPlayerId))}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs font-semibold text-red-700">Zusammenlegen:</span>
                <span className="font-medium line-through">{playerLabel(players.find(p => p.id === removePlayerId))}</span>
              </div>
              <Button
                size="sm"
                className="ml-auto"
                disabled={manualMergeMutation.isPending}
                onClick={() => manualMergeMutation.mutate({ keepId: keepPlayerId, removeId: removePlayerId })}
              >
                <Merge className="w-3.5 h-3.5 mr-1.5" />
                {manualMergeMutation.isPending ? 'Führe zusammen…' : 'Zusammenlegen'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Merge History ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Zusammenlegungs-Verlauf</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Alle durchgeführten Zusammenlegungen und Reparaturen</p>
        </CardHeader>
        <CardContent>
          {mergesLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lade Verlauf…</div>
          ) : merges.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Noch keine Zusammenlegungen durchgeführt.
            </div>
          ) : (
            <div className="space-y-2">
              {merges.map((m) => (
                <div key={m.id} className="border border-border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        {m.keep_player_name}
                        {m.keep_player_number ? <span className="text-xs text-muted-foreground">#{m.keep_player_number}</span> : null}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span className="line-through">{m.remove_player_name}</span>
                        {m.remove_player_number ? <span className="text-xs">#{m.remove_player_number}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {m.is_repair && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Reparatur</span>}
                    <span>{new Date(m.created_date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {m.performed_by && <span className="truncate max-w-[120px]">von {m.performed_by}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}