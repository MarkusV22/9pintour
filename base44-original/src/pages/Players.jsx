import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Users, Search, Pencil, Upload, User, FileUp, ShieldCheck, IdCard, BarChart2, Phone, MessageCircle, Music, Calendar, Lock, FileCheck2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatName } from '@/lib/utils';
import CsvImportDialog from '@/components/CsvImportDialog';
import AdminPlayerAssignDialog from '@/components/AdminPlayerAssignDialog';
import PlayerChangeRequestDialog from '@/components/PlayerChangeRequestDialog';
import PlayerChangeRequestsAdmin from '@/components/PlayerChangeRequestsAdmin';
import TourCard from '@/components/TourCard';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin, isTurnierAdmin } from '@/lib/roles';

const empty = { first_name: '', last_name: '', category: 'Herren', age_class: 'Allgemeine Klasse', club: '', photo_url: '', birth_date: '', phone: '', whatsapp: false, personal_best: '', walk_on_song: '', is_hobby: false };
const AGE_CLASSES = ['U-15', 'U-19', 'U-23', 'Allgemeine Klasse', 'Ü-50', 'Ü-60'];

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

function PlayerDialog({ open, onOpenChange, onSave, isPending, initial, allPlayers = [], isAdminUser = false }) {
  const [form, setForm] = useState(initial ? {
    first_name: initial.first_name || '',
    last_name: initial.last_name || '',
    category: initial.category || 'Herren',
    age_class: initial.age_class || 'Allgemeine Klasse',
    club: initial.club || '',
    photo_url: initial.photo_url || '',
    number: initial.number || '',
    birth_date: initial.birth_date || '',
    phone: initial.phone || '',
    whatsapp: initial.whatsapp || false,
    personal_best: initial.personal_best || '',
    walk_on_song: initial.walk_on_song || '',
    is_hobby: initial.is_hobby || false,
  } : empty);
  const [numberError, setNumberError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const fileRef = useRef(null);

  // Beim Bearbeiten (existing player): Name & Nummer für Nicht-Admins gesperrt.
  const isLockedName = !!initial && !isAdminUser;

  // Re-initialize form when initial player changes
  useEffect(() => {
    if (initial) {
      setForm({
        first_name: initial.first_name || '',
        last_name: initial.last_name || '',
        category: initial.category || 'Herren',
        age_class: initial.age_class || 'Allgemeine Klasse',
        club: initial.club || '',
        photo_url: initial.photo_url || '',
        number: initial.number || '',
        birth_date: initial.birth_date || '',
        phone: initial.phone || '',
        whatsapp: initial.whatsapp || false,
        personal_best: initial.personal_best || '',
        walk_on_song: initial.walk_on_song || '',
        is_hobby: initial.is_hobby || false,
      });
    } else {
      setForm(empty);
    }
    setNumberError('');
  }, [initial?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set('photo_url', file_url);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setNumberError('');
    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

    // Admins: Konfliktprüfung nur gegen andere Spieler (nicht sich selbst)
    const num = form.number ? parseInt(String(form.number)) : null;
    if (isAdminUser && num) {
      const selfId = initial?.id;
      const conflict = allPlayers.find(p => {
        if (selfId && String(p.id) === String(selfId)) return false; // eigene ID überspringen
        return Number(p.number) === num;
      });
      if (conflict) {
        setNumberError(`Nummer ${num} ist bereits vergeben.`);
        return;
      }
    }

    const data = { ...form, name: fullName };
    if (data.birth_date) data.age_class = calcAgeClass(data.birth_date);
    if (!isAdminUser) data.number = initial?.number ?? form.number;
    else data.number = num ?? form.number;
    // Leere Strings in null umwandeln für optionale Felder
    if (!data.birth_date) data.birth_date = null;
    if (!data.personal_best) data.personal_best = null;
    onSave(data);
  };

  const valid = form.first_name.trim() && form.last_name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Spieler bearbeiten' : 'Spieler anlegen'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Photo upload */}
          <div className="flex flex-col items-center gap-2">
            <div
              onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden"
            >
              {form.photo_url ? (
                <img src={form.photo_url} alt="Foto" className="w-full h-full object-cover" />
              ) : uploading ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Upload className="w-5 h-5" />
                  <span className="text-xs">Foto</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            {form.photo_url && (
              <button type="button" onClick={() => set('photo_url', '')} className="text-xs text-destructive hover:underline">
                Foto entfernen
              </button>
            )}
          </div>

          {/* Name */}
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
            <div className="space-y-1.5">
              <Label>Vorname *</Label>
              <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Max" required disabled={isLockedName} />
            </div>
            <div className="space-y-1.5">
              <Label>Nachname *</Label>
              <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Mustermann" required disabled={isLockedName} />
            </div>
          </div>
          {isLockedName && initial && (
            <PlayerChangeRequestDialog open={showRequestDialog} onOpenChange={setShowRequestDialog} player={initial} />
          )}

          {/* Category, Age Class, Club */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Herren">Herren</SelectItem>
                  <SelectItem value="Damen">Damen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Altersklasse</Label>
              <Select value={form.age_class || 'Allgemeine Klasse'} onValueChange={v => set('age_class', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGE_CLASSES.map(ac => <SelectItem key={ac} value={ac}>{ac}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Verein</Label>
            <Input value={form.club} onChange={e => set('club', e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Spielernummer {!isAdminUser && <span className="text-xs text-muted-foreground font-normal">(nur von Admins änderbar)</span>}</Label>
            <Input
              type="number"
              min={1}
              value={form.number}
              onChange={e => { set('number', e.target.value); setNumberError(''); }}
              placeholder="z.B. 101"
              disabled={!isAdminUser}
            />
            {numberError && <p className="text-xs text-destructive">{numberError}</p>}
          </div>

          {/* Birth date */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Geburtsdatum</Label>
            <Input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
            {form.birth_date && (
              <p className="text-xs text-muted-foreground">
                Altersklasse: <span className="font-semibold text-primary">{calcAgeClass(form.birth_date)}</span>
              </p>
            )}
          </div>

          {/* Phone & WhatsApp */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Telefon</Label>
              <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</Label>
              <div className="flex items-center h-9 gap-2">
                <button
                  type="button"
                  onClick={() => set('whatsapp', !form.whatsapp)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.whatsapp ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.whatsapp ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-muted-foreground">{form.whatsapp ? 'Ja' : 'Nein'}</span>
              </div>
            </div>
          </div>

          {/* Personal Best */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">🏆 Personal Best</Label>
            <Input
              type="number"
              min={0}
              max={1200}
              value={form.personal_best}
              onChange={e => set('personal_best', e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="z.B. 742"
            />
            <p className="text-xs text-muted-foreground">Persönliche Bestleistung (Gesamtholz in einem Durchgang)</p>
          </div>

          {/* Walk-on Song */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Music className="w-3.5 h-3.5" />Walk-on Song</Label>
            <Input
              value={form.walk_on_song}
              onChange={e => set('walk_on_song', e.target.value)}
              placeholder="z.B. Enter Sandman – Metallica"
            />
            <p className="text-xs text-muted-foreground">Song beim Walk-on (Song + Interpret)</p>
          </div>

          <div className="space-y-1.5">
            <Label>Hobby-Spieler</Label>
            <label className="flex items-center gap-2 min-h-9">
              <input type="checkbox" checked={form.is_hobby || false} onChange={e => set('is_hobby', e.target.checked)} disabled={!!initial && !isAdminUser} className="w-4 h-4 rounded border-border" />
              <span className="text-sm text-muted-foreground">Für Hobby-Spieler wird eine eigene Hobby-Wertung erstellt, der Spieler wird aber auch in der 9-Pin Tour gewertet{initial && !isAdminUser ? ' (nur von Admins änderbar)' : ''}</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={!valid || isPending || uploading}>
              {isPending ? 'Speichern...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Players() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const canManagePlayers = isTurnierAdmin(user);
  const canDeletePlayers = isAdmin(user);
  const [showDialog, setShowDialog] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('alle');
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [showChangeRequestsDialog, setShowChangeRequestsDialog] = useState(false);


  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('created_date', 5000),
  });

  const { data: changeRequests = [] } = useQuery({
    queryKey: ['playerChangeRequests'],
    queryFn: () => base44.entities.PlayerChangeRequest.list('-created_date', 200),
    enabled: canDeletePlayers,
  });
  const pendingChangeRequests = changeRequests.filter(r => r.status === 'offen').length;



  // Auto-assign next number: max existing number in category + 1
  const nextNumber = (allPlayers, category) => {
    const nums = allPlayers
      .filter(p => p.category === category && p.number)
      .map(p => Number(p.number))
      .filter(n => !isNaN(n));
    const fallback = category === 'Herren' ? 10001 : 20001;
    return nums.length > 0 ? Math.max(...nums) + 1 : fallback;
  };

  const createMutation = useMutation({
    mutationFn: (data) => {
      const number = nextNumber(players, data.category);
      return base44.entities.Player.create({ ...data, number });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['players'] }); setShowDialog(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Player.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['players'] }); setEditPlayer(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Player.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] }),
  });

  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ done: 0, total: 0 });
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      setDeletingAll(true);
      // Fetch ALL players from DB (not just the loaded ones)
      const allPlayers = await base44.entities.Player.list('created_date', 99999);
      const total = allPlayers.length;
      setDeleteProgress({ done: 0, total });
      for (let i = 0; i < allPlayers.length; i++) {
        await base44.entities.Player.delete(allPlayers[i].id);
        setDeleteProgress({ done: i + 1, total });
      }
      setDeletingAll(false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] }),
  });

  const getDisplayName = (p) => {
    const raw = p.first_name && p.last_name
      ? `${p.first_name} ${p.last_name}`
      : (p.name || '');
    return formatName(raw) || '–';
  };

  const filtered = players.filter(p => {
    const name = getDisplayName(p);
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) ||
      (p.club || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'alle' || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const herren = filtered.filter(p => p.category === 'Herren');
  const damen = filtered.filter(p => p.category === 'Damen');

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Spielerdatenbank</h1>
          <p className="text-muted-foreground mt-1">{players.length} Spieler gesamt</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManagePlayers && (
            <>
              {canDeletePlayers && (
                <>
                  <Button variant="outline" onClick={() => setShowChangeRequestsDialog(true)} className="gap-2 relative">
                    <FileCheck2 className="w-4 h-4" />
                    Änderungsanträge
                    {pendingChangeRequests > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {pendingChangeRequests}
                      </span>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAdminDialog(true)} className="gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Admin
                  </Button>

                </>
              )}
              <Button variant="outline" onClick={() => setShowCsvDialog(true)} className="gap-2">
                <FileUp className="w-4 h-4" />
                CSV importieren
              </Button>
              <Button onClick={() => setShowDialog(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Spieler anlegen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name oder Verein suchen..."
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle</SelectItem>
            <SelectItem value="Herren">Herren</SelectItem>
            <SelectItem value="Damen">Damen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-semibold text-foreground">Noch keine Spieler</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Lege Spieler an, um sie bei Mannschaften auswählen zu können.</p>
          <Button size="sm" onClick={() => setShowDialog(true)}>Ersten Spieler anlegen</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {herren.length > 0 && (
            <PlayerGroup title="Herren" players={herren} color="text-blue-600"
              onEdit={canManagePlayers ? setEditPlayer : null}
              onDelete={canDeletePlayers ? (id) => { if (confirm('Spieler löschen?')) deleteMutation.mutate(id); } : null}
              getDisplayName={getDisplayName}
            />
          )}
          {damen.length > 0 && (
            <PlayerGroup title="Damen" players={damen} color="text-pink-600"
              onEdit={canManagePlayers ? setEditPlayer : null}
              onDelete={canDeletePlayers ? (id) => { if (confirm('Spieler löschen?')) deleteMutation.mutate(id); } : null}
              getDisplayName={getDisplayName}
            />
          )}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-10">Keine Spieler gefunden.</p>
          )}
        </div>
      )}

      <AdminPlayerAssignDialog
        open={showAdminDialog}
        onOpenChange={setShowAdminDialog}
        players={players}
      />

      {canDeletePlayers && (
        <PlayerChangeRequestsAdmin open={showChangeRequestsDialog} onOpenChange={setShowChangeRequestsDialog} />
      )}

      <CsvImportDialog
        open={showCsvDialog}
        onOpenChange={setShowCsvDialog}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['players'] })}
      />

      {showDialog && (
        <PlayerDialog open={showDialog} onOpenChange={setShowDialog}
          onSave={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          allPlayers={players}
          isAdminUser={canDeletePlayers}
        />
      )}

      {editPlayer && (
        <PlayerDialog open={!!editPlayer} onOpenChange={() => setEditPlayer(null)}
          initial={editPlayer}
          onSave={(data) => updateMutation.mutate({ id: editPlayer.id, data })}
          isPending={updateMutation.isPending}
          allPlayers={players}
          isAdminUser={canDeletePlayers}
        />
      )}
    </div>
  );
}

function PlayerGroup({ title, players, color, onEdit, onDelete, getDisplayName }) {
  const [openCardId, setOpenCardId] = useState(null);

  const sorted = [...players].sort((a, b) => {
    if (a.number && b.number) return a.number - b.number;
    if (a.number) return -1;
    if (b.number) return 1;
    return getDisplayName(a).localeCompare(getDisplayName(b), 'de');
  });

  return (
    <div>
      <h2 className={`text-base font-bold mb-2 ${color}`}>{title} ({players.length})</h2>
      <div className="space-y-1.5">
        {sorted.map(p => (
          <div key={p.id}>
            <div className="flex items-center justify-between px-4 py-3 bg-card rounded-xl border border-border hover:border-primary/20 transition-colors">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {p.photo_url
                    ? <img src={p.photo_url} alt={getDisplayName(p)} className="w-full h-full object-cover" />
                    : <User className="w-4 h-4 text-muted-foreground" />
                  }
                </div>
                {/* Number badge */}
                {p.number && (
                  <span className="text-xs font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded min-w-[24px] text-center">
                    {p.number}
                  </span>
                )}
                <div>
                  <span className="font-medium text-foreground">{getDisplayName(p)}</span>
                  {p.is_hobby && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Lochkegel</span>}
                  {p.club && <span className="text-sm text-muted-foreground ml-2">· {p.club}</span>}
                  {p.birth_date && p.age_class && (
                    <span className="ml-2 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{p.age_class === 'Allgemeine Klasse' ? 'Allg. Klasse' : p.age_class}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                  onClick={() => setOpenCardId(openCardId === p.id ? null : p.id)}
                  title="Tour Card anzeigen"
                >
                  <IdCard className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                  <Link to={`/stats?id=${p.id}`} title="Spielerprofil">
                    <BarChart2 className="w-3.5 h-3.5" />
                  </Link>
                </Button>
                {onEdit && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(p)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(p.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {openCardId === p.id && (
              <div className="mt-1 mb-2 px-4 py-4 bg-muted/30 rounded-xl border border-border">
                <TourCard player={p} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}