import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin } from '@/lib/roles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, UserPlus, X, AlertCircle, Upload, Pencil, Lock } from 'lucide-react';
import PlayerChangeRequestDialog from '@/components/PlayerChangeRequestDialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { matchesMixedCombination } from '@/lib/mixedCombinations';
import { useToast } from '@/components/ui/use-toast';

const empty = { name: '', category: 'Herren', player1_id: '', player2_id: '', player3_id: '', player4_id: '', player5_id: '', player6_id: '' };

function calcAgeClass(birthDateStr) {
  if (!birthDateStr) return 'Allgemeine Klasse';
  const birth = new Date(birthDateStr);
  // Stichtag 1. Juli des laufenden Jahres (saisonüblich)
  const ref = new Date(new Date().getFullYear(), 6, 1);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age < 10) return 'U-10';
  if (age < 15) return 'U-15';
  if (age < 19) return 'U-19';
  if (age < 23) return 'U-23';
  if (age < 50) return 'Allgemeine Klasse';
  if (age < 60) return 'Ü-50';
  return 'Ü-60';
}

function PlayerSelect({ value, onChange, players, label, exclude, allPlayers, category }) {
  const [searchFirst, setSearchFirst] = useState('');
  const [searchLast, setSearchLast] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createdPlayer, setCreatedPlayer] = useState(null);
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const containerRef = useRef(null);
  const [newPlayerData, setNewPlayerData] = useState({
    first_name: '', last_name: '', category: '', birth_date: '', club: '', photo_url: '', is_hobby: false,
  });
  const [categoryError, setCategoryError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState(null);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const isLockedName = !isAdmin(user);

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const updates = {
        first_name: data.first_name,
        last_name: data.last_name,
        name: `${data.first_name.trim()} ${data.last_name.trim()}`.trim(),
        number: data.number === '' ? null : Number(data.number),
        category: data.category,
        birth_date: data.birth_date || '',
        age_class: calcAgeClass(data.birth_date),
        club: data.club || '',
        phone: data.phone || '',
        whatsapp: data.whatsapp || false,
        personal_best: data.personal_best === '' ? null : Number(data.personal_best),
        walk_on_song: data.walk_on_song || '',
        photo_url: data.photo_url || '',
        is_hobby: data.is_hobby || false,
      };
      return base44.entities.Player.update(id, updates);
    },
    onSuccess: (updated) => {
      setCreatedPlayer(updated);
      queryClient.invalidateQueries({ queryKey: ['players'] });
      setShowEditDialog(false);
    },
    onError: (err) => {
      const msg = String(err?.message || err || '');
      const noPermission = /permission|forbidden|403/i.test(msg);
      toast({
        title: 'Speichern fehlgeschlagen',
        description: noPermission
          ? 'Keine Berechtigung: Spieler mit verknüpftem Profil können nur vom Admin bzw. Turnier-Admin bearbeitet werden.'
          : msg || 'Unbekannter Fehler beim Speichern.',
        variant: 'destructive',
      });
    },
  });

  const handleEditPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setEditData(prev => ({ ...prev, photo_url: file_url }));
    setUploading(false);
  };

  const openEditDialog = () => {
    setEditData({
      id: selectedPlayer.id,
      first_name: selectedPlayer.first_name || '',
      last_name: selectedPlayer.last_name || '',
      number: selectedPlayer.number ?? '',
      category: selectedPlayer.category || 'Herren',
      birth_date: selectedPlayer.birth_date || '',
      club: selectedPlayer.club || '',
      phone: selectedPlayer.phone || '',
      whatsapp: selectedPlayer.whatsapp || false,
      personal_best: selectedPlayer.personal_best ?? '',
      walk_on_song: selectedPlayer.walk_on_song || '',
      user_email: selectedPlayer.user_email || '',
      privacy_accepted: selectedPlayer.privacy_accepted || false,
      privacy_accepted_at: selectedPlayer.privacy_accepted_at || '',
      photo_url: selectedPlayer.photo_url || '',
      is_hobby: selectedPlayer.is_hobby || false,
    });
    setShowEditDialog(true);
  };

  const selectedPlayer = players.find(p => p.id === value) || allPlayers.find(p => p.id === value) || (createdPlayer?.id === value ? createdPlayer : null);

  // Hide dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const available = players.filter(p => p.id !== value && !exclude.includes(p.id));
  const searchTerm = `${searchFirst} ${searchLast}`.trim().toLowerCase();
  const filtered = searchTerm.length >= 1 ? available.filter(p => {
    const name = (p.name || `${p.first_name || ''} ${p.last_name || ''}`).toLowerCase();
    const first = (p.first_name || '').toLowerCase();
    const last = (p.last_name || '').toLowerCase();
    return name.includes(searchTerm) ||
      (searchFirst && first.includes(searchFirst.toLowerCase()) && (!searchLast || last.includes(searchLast.toLowerCase())));
  }).slice(0, 8) : [];

  const createPlayerMutation = useMutation({
    mutationFn: (data) => {
      const fullName = `${data.first_name.trim()} ${data.last_name.trim()}`.trim();
      const number = Math.max(...allPlayers.map(p => p.number || 0), 0) + 1;
      return base44.entities.Player.create({
        first_name: data.first_name, last_name: data.last_name, name: fullName,
        category: data.category, age_class: calcAgeClass(data.birth_date),
        birth_date: data.birth_date || '', club: data.club, photo_url: data.photo_url, number,
        is_hobby: data.is_hobby || false,
      });
    },
    onSuccess: (newPlayer) => {
      setCreatedPlayer(newPlayer);
      queryClient.invalidateQueries({ queryKey: ['players'] });
      onChange(newPlayer.id);
      setShowCreateDialog(false);
      setSearchFirst('');
      setSearchLast('');
      setShowResults(false);
      setNewPlayerData({ first_name: '', last_name: '', category: '', birth_date: '', club: '', photo_url: '', is_hobby: false });
    },
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setNewPlayerData(prev => ({ ...prev, photo_url: file_url }));
    setUploading(false);
  };

  const handleSelect = (player) => {
    onChange(player.id);
    setShowResults(false);
    setSearchFirst('');
    setSearchLast('');
  };

  const handleClear = () => {
    onChange('');
    setSearchFirst('');
    setSearchLast('');
    setShowResults(false);
  };

  const handleCreate = () => {
    if (!newPlayerData.category) {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);
    createPlayerMutation.mutate(newPlayerData);
  };

  const existingWithSameName = allPlayers.find(p =>
    `${newPlayerData.first_name.trim()} ${newPlayerData.last_name.trim()}`.toLowerCase() === (p.name || '').toLowerCase()
  );

  return (
    <div className="space-y-1" ref={containerRef}>
      <Label className="text-xs text-muted-foreground">{label}</Label>

      {selectedPlayer ? (
        // Show selected player with edit and clear buttons
        <div className="space-y-1">
          <div className="flex items-center gap-2 px-3 py-2 h-9 bg-muted/40 rounded-md border border-border text-sm">
            <span className="flex-1 font-medium truncate">
              {selectedPlayer.name || `${selectedPlayer.first_name} ${selectedPlayer.last_name}`}
              {selectedPlayer.club && <span className="text-muted-foreground font-normal ml-1">· {selectedPlayer.club}</span>}
            </span>
            <button type="button" onClick={openEditDialog} className="text-muted-foreground hover:text-primary flex-shrink-0" title="Spielerprofil bearbeiten">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {!selectedPlayer.birth_date && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 flex-shrink-0 text-destructive cursor-help">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium leading-tight">GEBURTSDATUM ERGÄNZEN</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Das Geburtsdatum ist notwendig, um die entsprechenden Altersklassen einzuteilen. Bitte ergänze es im Spielerprofil über den Bleistift-Symbol.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ) : (
        // Search inputs
        <div className="relative">
          <div className="flex gap-1.5">
            <Input
              value={searchFirst}
              onChange={e => { setSearchFirst(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              placeholder="Vorname"
              className="h-9 text-sm"
            />
            <Input
              value={searchLast}
              onChange={e => { setSearchLast(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              placeholder="Nachname"
              className="h-9 text-sm"
            />
          </div>

          {showResults && (filtered.length > 0 || searchTerm.length >= 2) && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
              {filtered.length > 0 ? (
                <>
                  {filtered.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => handleSelect(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center justify-between"
                    >
                      <span className="font-medium">{p.name || `${p.first_name} ${p.last_name}`}</span>
                      <span className="text-xs text-muted-foreground">{p.club || ''}</span>
                    </button>
                  ))}
                  <div className="border-t border-border">
                    <button
                      type="button"
                      onMouseDown={() => { setNewPlayerData(d => ({ ...d, first_name: searchFirst, last_name: searchLast })); setShowCreateDialog(true); setShowResults(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-primary hover:bg-muted/50 flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />Neuer Spieler
                    </button>
                  </div>
                </>
              ) : (
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-1">Kein Spieler gefunden.</p>
                  <button
                    type="button"
                    onMouseDown={() => { setNewPlayerData(d => ({ ...d, first_name: searchFirst, last_name: searchLast })); setShowCreateDialog(true); setShowResults(false); }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <UserPlus className="w-3 h-3" />Neuen Spieler erstellen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCreateDialog && (
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Neuer Spieler</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {existingWithSameName && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Es existiert bereits ein Spieler mit dem Namen „{existingWithSameName.name}".</AlertDescription>
                </Alert>
              )}
              {categoryError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Bitte wähle das Geschlecht (Herren oder Damen) aus – ohne Zuordnung kann der Spieler nicht angelegt werden.</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col items-center gap-2">
                <div onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden">
                  {newPlayerData.photo_url ? <img src={newPlayerData.photo_url} alt="Foto" className="w-full h-full object-cover" />
                    : uploading ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Upload className="w-5 h-5" /><span className="text-xs">Foto</span></div>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                {newPlayerData.photo_url && <button type="button" onClick={() => setNewPlayerData(prev => ({ ...prev, photo_url: '' }))} className="text-xs text-destructive hover:underline">Foto entfernen</button>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Vorname *</Label><Input value={newPlayerData.first_name} onChange={e => setNewPlayerData({ ...newPlayerData, first_name: e.target.value })} placeholder="Max" /></div>
                <div className="space-y-1.5"><Label>Nachname *</Label><Input value={newPlayerData.last_name} onChange={e => setNewPlayerData({ ...newPlayerData, last_name: e.target.value })} placeholder="Mustermann" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kategorie *</Label>
                  <Select value={newPlayerData.category || undefined} onValueChange={v => { setNewPlayerData(prev => ({ ...prev, category: v })); setCategoryError(false); }}>
                    <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                    <SelectContent><SelectItem value="Herren">Herren</SelectItem><SelectItem value="Damen">Damen</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Verein</Label><Input value={newPlayerData.club} onChange={e => setNewPlayerData(prev => ({ ...prev, club: e.target.value }))} placeholder="Optional" /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Geburtsdatum</Label>
                <Input type="date" value={newPlayerData.birth_date} onChange={e => setNewPlayerData(prev => ({ ...prev, birth_date: e.target.value }))} />
                {newPlayerData.birth_date && <p className="text-xs text-muted-foreground">Altersklasse: <span className="font-semibold text-primary">{calcAgeClass(newPlayerData.birth_date)}</span></p>}
              </div>
              <div className="space-y-1.5">
                <Label>Hobby-Spieler</Label>
                <label className="flex items-center gap-2 min-h-9">
                  <input type="checkbox" checked={newPlayerData.is_hobby || false} onChange={e => setNewPlayerData(prev => ({ ...prev, is_hobby: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                  <span className="text-sm text-muted-foreground">Für Hobby-Spieler wird eine eigene Hobby-Wertung erstellt, der Spieler wird aber auch in der 9-Pin Tour gewertet</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={!newPlayerData.first_name.trim() || !newPlayerData.last_name.trim() || createPlayerMutation.isPending || uploading}>
                {createPlayerMutation.isPending ? 'Erstelle...' : 'Spieler erstellen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showEditDialog && editData && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Spieler bearbeiten</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden">
                  {editData.photo_url ? <img src={editData.photo_url} alt="Foto" className="w-full h-full object-cover" />
                    : uploading ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Upload className="w-5 h-5" /><span className="text-xs">Foto</span></div>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleEditPhotoUpload} />
                {editData.photo_url && <button type="button" onClick={() => setEditData(prev => ({ ...prev, photo_url: '' }))} className="text-xs text-destructive hover:underline">Foto entfernen</button>}
              </div>
              {isLockedName && (
                <div className="flex items-start gap-2 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg border border-amber-200">
                  <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    Name und Spielernummer können nur vom Admin direkt geändert werden.
                    <button type="button" onClick={() => setShowRequestDialog(true)} className="ml-1 font-semibold text-primary hover:underline">
                      Änderung beantragen
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Vorname *</Label><Input value={editData.first_name} onChange={e => setEditData({ ...editData, first_name: e.target.value })} disabled={isLockedName} /></div>
                <div className="space-y-1.5"><Label>Nachname *</Label><Input value={editData.last_name} onChange={e => setEditData({ ...editData, last_name: e.target.value })} disabled={isLockedName} /></div>
              </div>
              <div className="space-y-1.5"><Label>Verein</Label><Input value={editData.club} onChange={e => setEditData({ ...editData, club: e.target.value })} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label>Telefon</Label><Input value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder="Optional" /></div>
              <div className="space-y-1.5">
                <Label>Geburtsdatum</Label>
                <Input type="date" value={editData.birth_date} onChange={e => setEditData({ ...editData, birth_date: e.target.value })} />
                {editData.birth_date && <p className="text-xs text-muted-foreground">Altersklasse: <span className="font-semibold text-primary">{calcAgeClass(editData.birth_date)}</span></p>}
              </div>

              <div className="space-y-1.5">
                <Label>Hobby-Spieler</Label>
                <label className="flex items-center gap-2 min-h-9">
                  <input type="checkbox" checked={editData.is_hobby || false} onChange={e => setEditData({ ...editData, is_hobby: e.target.checked })} disabled={isLockedName} className="w-4 h-4 rounded border-border" />
                  <span className="text-sm text-muted-foreground">Für Hobby-Spieler wird eine eigene Hobby-Wertung erstellt, der Spieler wird aber auch in der 9-Pin Tour gewertet{isLockedName ? ' (nur von Admins änderbar)' : ''}</span>
                </label>
              </div>

              {isAdmin(user) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Spielernummer</Label><Input type="number" value={editData.number ?? ''} onChange={e => setEditData({ ...editData, number: e.target.value })} placeholder="Automatisch" /></div>
                  <div className="space-y-1.5">
                    <Label>Kategorie</Label>
                    <Select value={editData.category || 'Herren'} onValueChange={v => setEditData({ ...editData, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Herren">Herren</SelectItem><SelectItem value="Damen">Damen</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>WhatsApp</Label>
                  <label className="flex items-center gap-2 h-9">
                    <input type="checkbox" checked={editData.whatsapp || false} onChange={e => setEditData({ ...editData, whatsapp: e.target.checked })} className="w-4 h-4 rounded border-border" />
                    <span className="text-sm">Verfügbar</span>
                  </label>
                </div>
                <div className="space-y-1.5"><Label>Pers. Bestleistung</Label><Input type="number" value={editData.personal_best ?? ''} onChange={e => setEditData({ ...editData, personal_best: e.target.value })} placeholder="Optional" /></div>
              </div>

              <div className="space-y-1.5"><Label>Walk-on Song</Label><Input value={editData.walk_on_song || ''} onChange={e => setEditData({ ...editData, walk_on_song: e.target.value })} placeholder="Song + Interpret" /></div>

              {isAdmin(user) && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground">System-Infos (nur Admin)</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Konto:</span> <span className="text-foreground break-all">{editData.user_email || '—'}</span></div>
                    <div><span className="text-muted-foreground">Datenschutz:</span> <span className="text-foreground">{editData.privacy_accepted ? 'akzeptiert' : 'offen'}{editData.privacy_accepted_at ? ` (${new Date(editData.privacy_accepted_at).toLocaleDateString('de-AT')})` : ''}</span></div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>Abbrechen</Button>
              <Button onClick={() => updatePlayerMutation.mutate({ id: editData.id, data: editData })} disabled={!editData.first_name.trim() || !editData.last_name.trim() || updatePlayerMutation.isPending || uploading}>
                {updatePlayerMutation.isPending ? 'Speichere...' : 'Änderungen speichern'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isLockedName && selectedPlayer && (
        <PlayerChangeRequestDialog open={showRequestDialog} onOpenChange={setShowRequestDialog} player={selectedPlayer} />
      )}
    </div>
  );
}

export default function TeamFormDialog({ open, onOpenChange, onSave, isPending, initialData, teamSize = 4, allowedCategories = ['Herren', 'Damen', 'Mixed'], mixedCombinations = [], existingTeams = [] }) {
  const isEdit = !!initialData;
  const [form, setForm] = useState(empty);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Bestimme die Kategorie automatisch, sobald alle Spielerplätze belegt sind.
  // Vorab (weniger als teamSize Spieler) bleibt die manuell gewählte Kategorie erhalten.
  const computeCategory = (playerIds, allPlayers) => {
    const players = playerIds.map(id => allPlayers.find(p => p.id === id)).filter(Boolean);
    if (players.length !== teamSize) return null;
    const d = players.filter(p => p.category === 'Damen').length;
    const h = players.filter(p => p.category === 'Herren').length;
    // Turnierspezifische Mixed-Kombinationen (überschreibt systemweite Logik)
    if (mixedCombinations && mixedCombinations.length > 0 && allowedCategories.includes('Mixed')) {
      if (matchesMixedCombination(d, h, mixedCombinations)) return 'Mixed';
      if (d === teamSize) return 'Damen';
      return 'Herren';
    }
    if (teamSize === 4 && allowedCategories.includes('Mixed')) {
      if (d === 4) return 'Damen';           // 4D = Damen
      if (h === 4) return 'Herren';          // 4H = Herren
      if (d === 3 && h === 1) return 'Mixed'; // 3D+1H = Mixed
      if (d === 2 && h === 2) return 'Mixed'; // 2D+2H = Mixed
      if (d === 1 && h === 3) return 'Herren'; // 1D+3H = Herren
    }
    if (teamSize === 4) {
      // Ohne Mixed-Wertung: 4D = Damen, alle anderen = Herren
      if (d === 4) return 'Damen';
      return 'Herren';
    }
    // Andere Team-Größen: alle Damen = Damen, sonst Herren
    if (d === teamSize) return 'Damen';
    return 'Herren';
  };

  useEffect(() => {
    if (open) setForm(initialData ? { ...initialData } : { ...empty, category: allowedCategories[0] || 'Herren' });
  }, [open, initialData, allowedCategories]);

  const { data: allPlayers = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('name', 9999),
    enabled: open,
  });

  const selected = [form.player1_id, form.player2_id, form.player3_id, form.player4_id, form.player5_id, form.player6_id].filter(Boolean);

  // Kategorie dient nur als Vorauswahl/Label – Spielerliste wird nicht gefiltert.
  const categoryPlayers = allPlayers;

  // Duplikat-Prüfung: gleicher Vereinsname innerhalb des Turniers
  const existingNames = (existingTeams || [])
    .filter(t => t.id !== initialData?.id)
    .map(t => (t.name || '').trim())
    .filter(Boolean);
  const trimmedName = (form.name || '').trim();
  const isDuplicate = trimmedName.length > 0 && existingNames.some(n => n.toLowerCase() === trimmedName.toLowerCase());
  const suggestedName = (() => {
    if (!isDuplicate) return '';
    const base = trimmedName;
    let i = 2;
    while (existingNames.some(n => n.toLowerCase() === `${base} ${i}`.toLowerCase())) i++;
    return `${base} ${i}`;
  })();

  // Live-Neuberechnung der Mannschaftskategorie nach jeder Spieleränderung
  useEffect(() => {
    const playerIds = [form.player1_id, form.player2_id, form.player3_id, form.player4_id, form.player5_id, form.player6_id].filter(Boolean);
    const auto = computeCategory(playerIds, allPlayers);
    if (auto && auto !== form.category) setForm(f => ({ ...f, category: auto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.player1_id, form.player2_id, form.player3_id, form.player4_id, form.player5_id, form.player6_id, allPlayers]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const playerIds = [form.player1_id, form.player2_id, form.player3_id, form.player4_id, form.player5_id, form.player6_id].filter(Boolean);
    const autoCategory = computeCategory(playerIds, allPlayers);
    const finalForm = autoCategory ? { ...form, category: autoCategory } : form;
    onSave(finalForm);
    if (!isEdit) setForm({ ...empty, category: allowedCategories[0] || 'Herren' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Mannschaft bearbeiten' : 'Mannschaft anlegen'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mannschaftsname</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="z.B. SV Muster" required />
              {isDuplicate && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 flex-wrap">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Dieser Vereinsname existiert bereits.</span>
                  {suggestedName && (
                    <button type="button" onClick={() => set('name', suggestedName)} className="font-semibold text-primary hover:underline">
                      {suggestedName} übernehmen
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              <Select value={form.category} onValueChange={v => {
                setForm(f => ({ ...f, category: v }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowedCategories.includes('Herren') && <SelectItem value="Herren">Herren</SelectItem>}
                  {allowedCategories.includes('Damen') && <SelectItem value="Damen">Damen</SelectItem>}
                  {allowedCategories.includes('Mixed') && <SelectItem value="Mixed">Mixed</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Kategorie wird automatisch geprüft, sobald alle {teamSize} Spieler belegt sind.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Spieler <span className="text-muted-foreground font-normal text-xs">(optional, max. {teamSize})</span></Label>
              {categoryPlayers.length === 0 && (
                <Link to="/players" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => onOpenChange(false)}>
                  <UserPlus className="w-3 h-3" />Spieler anlegen
                </Link>
              )}
            </div>
            {[1, 2, 3, 4, 5, 6].slice(0, teamSize).map(n => (
              <div key={n} className="flex items-center gap-1.5">
                <div className="flex-1">
                  <PlayerSelect
                    label={`Spieler ${n}`}
                    value={form[`player${n}_id`]}
                    onChange={v => set(`player${n}_id`, v)}
                    players={categoryPlayers}
                    exclude={selected.filter(s => s !== form[`player${n}_id`])}
                    allPlayers={allPlayers}
                    category={form.category}
                  />
                </div>
                {form[`player${n}_id`] && (
                  <button
                    type="button"
                    onClick={() => set(`player${n}_id`, '')}
                    className="mt-5 opacity-40 hover:opacity-80 p-1 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={!form.name || isPending}>
              {isPending ? 'Speichern...' : isEdit ? 'Änderungen speichern' : 'Mannschaft speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}