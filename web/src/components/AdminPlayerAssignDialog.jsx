import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Link2, Merge, User, AlertCircle } from 'lucide-react';

/**
 * Admin dialog for:
 * 1. Assigning a user (by email) to an existing player
 * 2. Merging two duplicate player profiles into one
 */
export default function AdminPlayerAssignDialog({ open, onOpenChange, players }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('assign'); // 'assign' | 'merge'

  // ── Assign tab state ──
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');

  // ── Merge tab state ──
  const [keepPlayerId, setKeepPlayerId] = useState('');
  const [removePlayerId, setRemovePlayerId] = useState('');
  const [mergeSearch1, setMergeSearch1] = useState('');
  const [mergeSearch2, setMergeSearch2] = useState('');

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setTargetPlayerId(''); setUserEmail(''); setPlayerSearch('');
    setKeepPlayerId(''); setRemovePlayerId(''); setMergeSearch1(''); setMergeSearch2('');
    setMessage(''); setError('');
  };

  // Filter helpers
  const filteredForAssign = players.filter(p => {
    const name = (p.name || `${p.first_name} ${p.last_name}`).toLowerCase();
    return name.includes(playerSearch.toLowerCase()) || String(p.number || '').includes(playerSearch);
  });

  const filteredForKeep = players.filter(p => {
    const name = (p.name || `${p.first_name} ${p.last_name}`).toLowerCase();
    return name.includes(mergeSearch1.toLowerCase()) || String(p.number || '').includes(mergeSearch1);
  });

  const filteredForRemove = players.filter(p => {
    if (p.id === keepPlayerId) return false;
    const name = (p.name || `${p.first_name} ${p.last_name}`).toLowerCase();
    return name.includes(mergeSearch2.toLowerCase()) || String(p.number || '').includes(mergeSearch2);
  });

  // ── Assign mutation ──
  const assignMutation = useMutation({
    mutationFn: ({ playerId, email }) =>
      base44.entities.Player.update(playerId, { user_email: email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setMessage('Spieler wurde erfolgreich zugewiesen.');
      setError('');
    },
    onError: () => setError('Fehler beim Zuweisen. Bitte erneut versuchen.'),
  });

  // ── Merge mutation (delegates to backend function for reference updates) ──
  const mergeMutation = useMutation({
    mutationFn: async ({ keepId, removeId }) => {
      const res = await base44.functions.invoke('mergePlayers', { keepId, removeId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['playerMerges'] });
      queryClient.invalidateQueries({ queryKey: ['orphanedPlayerRefs'] });
      setMessage('Profile wurden erfolgreich zusammengelegt. Alle Turnier-Referenzen wurden aktualisiert.');
      setError('');
      setKeepPlayerId(''); setRemovePlayerId('');
    },
    onError: (err) => setError(err?.response?.data?.error || 'Fehler beim Zusammenlegen.'),
  });

  const handleAssign = () => {
    setMessage(''); setError('');
    if (!targetPlayerId || !userEmail.trim()) return;
    assignMutation.mutate({ playerId: targetPlayerId, email: userEmail.trim() });
  };

  const handleMerge = () => {
    setMessage(''); setError('');
    if (!keepPlayerId || !removePlayerId) return;
    if (!confirm('Doppeltes Profil wirklich löschen und zusammenlegen?')) return;
    mergeMutation.mutate({ keepId: keepPlayerId, removeId: removePlayerId });
  };

  const isPending = assignMutation.isPending || mergeMutation.isPending;

  const playerLabel = (p) => p ? `${p.name || `${p.first_name} ${p.last_name}`}${p.number ? ` (#${p.number})` : ''}${p.club ? ` · ${p.club}` : ''}` : '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admin: Spieler verwalten</DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setTab('assign'); setMessage(''); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'assign' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            <Link2 className="w-3.5 h-3.5" />
            User zuweisen
          </button>
          <button
            onClick={() => { setTab('merge'); setMessage(''); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'merge' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            <Merge className="w-3.5 h-3.5" />
            Profile zusammenlegen
          </button>
        </div>

        {/* Assign tab */}
        {tab === 'assign' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Spieler auswählen</Label>
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} placeholder="Name oder Nummer suchen..." className="pl-8 h-8 text-sm" />
              </div>
              <Select value={targetPlayerId} onValueChange={setTargetPlayerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Spieler wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredForAssign.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        {p.photo_url
                          ? <img src={p.photo_url} className="w-5 h-5 rounded-full object-cover" />
                          : <User className="w-4 h-4 text-muted-foreground" />}
                        <span>{playerLabel(p)}</span>
                        {p.user_email && <span className="text-xs text-muted-foreground ml-1">(bereits verknüpft)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetPlayerId && (() => {
              const p = players.find(x => x.id === targetPlayerId);
              return p?.user_email ? (
                <div className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-lg">
                  Aktuell verknüpft mit: <span className="font-medium text-foreground">{p.user_email}</span>
                </div>
              ) : null;
            })()}

            <div className="space-y-1.5">
              <Label>E-Mail-Adresse des Users</Label>
              <Input
                type="email"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                placeholder="user@beispiel.de"
              />
            </div>
          </div>
        )}

        {/* Merge tab */}
        {tab === 'merge' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Das Profil das du <strong>behältst</strong> bleibt erhalten. Das andere wird gelöscht. Fehlende Daten werden übernommen.</p>

            <div className="space-y-1.5">
              <Label>Profil behalten</Label>
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={mergeSearch1} onChange={e => setMergeSearch1(e.target.value)} placeholder="Suchen..." className="pl-8 h-8 text-sm" />
              </div>
              <Select value={keepPlayerId} onValueChange={setKeepPlayerId}>
                <SelectTrigger><SelectValue placeholder="Spieler wählen..." /></SelectTrigger>
                <SelectContent>
                  {filteredForKeep.map(p => (
                    <SelectItem key={p.id} value={p.id}>{playerLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Doppeltes Profil löschen</Label>
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={mergeSearch2} onChange={e => setMergeSearch2(e.target.value)} placeholder="Suchen..." className="pl-8 h-8 text-sm" />
              </div>
              <Select value={removePlayerId} onValueChange={setRemovePlayerId}>
                <SelectTrigger><SelectValue placeholder="Zu löschendes Profil..." /></SelectTrigger>
                <SelectContent>
                  {filteredForRemove.map(p => (
                    <SelectItem key={p.id} value={p.id}>{playerLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {keepPlayerId && removePlayerId && (
              <div className="flex items-start gap-2 bg-destructive/10 text-destructive text-xs px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>„{playerLabel(players.find(p => p.id === removePlayerId))}" wird unwiderruflich gelöscht!</span>
              </div>
            )}
          </div>
        )}

        {message && <p className="text-sm text-green-600 font-medium">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Schließen</Button>
          {tab === 'assign' ? (
            <Button
              onClick={handleAssign}
              disabled={!targetPlayerId || !userEmail.trim() || isPending}
            >
              {isPending ? 'Zuweisen...' : 'User zuweisen'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleMerge}
              disabled={!keepPlayerId || !removePlayerId || isPending}
            >
              {isPending ? 'Zusammenlegen...' : 'Zusammenlegen'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}