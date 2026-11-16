import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, UserPlus, X, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

const categoryColor = (cat) =>
  cat === 'Herren' ? 'bg-blue-100 text-blue-700 border-blue-200' :
  cat === 'Damen'  ? 'bg-pink-100 text-pink-700 border-pink-200'  :
  'bg-purple-100 text-purple-700 border-purple-200';

function calcAgeClass(birthDateStr) {
  if (!birthDateStr) return 'Allgemeine Klasse';
  const birth = new Date(birthDateStr);
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

export default function EinzelstarterPickerDialog({ open, onOpenChange, players, getPlayerName, excludeIds = new Set(), onSelect }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newData, setNewData] = useState({ first_name: '', last_name: '', category: 'Herren', birth_date: '', club: '', photo_url: '' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) { setSearch(''); setShowCreate(false); }
  }, [open]);

  const candidates = useMemo(() => {
    return players
      .filter(p => !excludeIds.has(p.id))
      .map(p => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        name: getPlayerName(p.id),
        category: p.category || '',
        club: p.club || '',
      }))
      .filter(p => {
        if (!search.trim()) return false;
        const q = search.toLowerCase().trim();
        return (
          (p.first_name || '').toLowerCase().includes(q) ||
          (p.last_name || '').toLowerCase().includes(q) ||
          (p.name || '').toLowerCase().includes(q) ||
          (p.club || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.last_name || a.name).localeCompare(b.last_name || b.name, 'de'));
  }, [players, excludeIds, search, getPlayerName]);

  const handleSelect = (player) => {
    onSelect(player);
    onOpenChange(false);
  };

  const createMutation = useMutation({
    mutationFn: (data) => {
      const fullName = `${data.first_name.trim()} ${data.last_name.trim()}`.trim();
      const number = Math.max(...players.map(p => p.number || 0), 0) + 1;
      return base44.entities.Player.create({
        first_name: data.first_name,
        last_name: data.last_name,
        name: fullName,
        category: data.category,
        age_class: calcAgeClass(data.birth_date),
        birth_date: data.birth_date || '',
        club: data.club || '',
        photo_url: data.photo_url || '',
        number,
      });
    },
    onSuccess: (newPlayer) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      handleSelect(newPlayer);
    },
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setNewData(prev => ({ ...prev, photo_url: file_url }));
    } finally {
      setUploading(false);
    }
  };

  const existingWithSameName = players.find(p =>
    `${newData.first_name.trim()} ${newData.last_name.trim()}`.toLowerCase() === (p.name || '').toLowerCase() && newData.first_name.trim()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Einzelspieler hinzufügen
          </DialogTitle>
        </DialogHeader>

        {!showCreate ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Vor- oder Nachname suchen…"
                className="pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="text-xs text-muted-foreground px-1">
              {search.trim() ? `${candidates.length} Spieler${candidates.length === 1 ? '' : ' verfügbar'}` : '\u00A0'}
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1 min-h-[120px]">
              {!search.trim() ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Tippe einen Namen ein, um Spieler zu suchen
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Keine Spieler gefunden
                </div>
              ) : (
                candidates.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">
                        {p.name}
                      </div>
                      {p.club && (
                        <div className="text-xs text-muted-foreground truncate">{p.club}</div>
                      )}
                    </div>
                    {p.category && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${categoryColor(p.category)}`}>
                        {p.category}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => { setShowCreate(true); setNewData(d => ({ ...d, first_name: search })); }}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-primary border border-dashed border-primary/40 rounded-lg py-2.5 hover:bg-primary/5 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Neuen Spieler anlegen
            </button>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
            {existingWithSameName && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Es existiert bereits ein Spieler mit dem Namen „{existingWithSameName.name}".
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-24 h-24 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden"
              >
                {newData.photo_url ? <img src={newData.photo_url} alt="Foto" className="w-full h-full object-cover" />
                  : uploading ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Upload className="w-5 h-5" /><span className="text-xs">Foto</span></div>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              {newData.photo_url && (
                <button type="button" onClick={() => setNewData(prev => ({ ...prev, photo_url: '' }))} className="text-xs text-destructive hover:underline">
                  Foto entfernen
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Vorname *</Label><Input value={newData.first_name} onChange={e => setNewData({ ...newData, first_name: e.target.value })} placeholder="Max" /></div>
              <div className="space-y-1.5"><Label>Nachname *</Label><Input value={newData.last_name} onChange={e => setNewData({ ...newData, last_name: e.target.value })} placeholder="Mustermann" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategorie</Label>
                <Select value={newData.category} onValueChange={v => setNewData(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Herren">Herren</SelectItem><SelectItem value="Damen">Damen</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Verein</Label><Input value={newData.club} onChange={e => setNewData({ ...newData, club: e.target.value })} placeholder="Optional" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Geburtsdatum</Label>
              <Input type="date" value={newData.birth_date} onChange={e => setNewData({ ...newData, birth_date: e.target.value })} />
              {newData.birth_date && <p className="text-xs text-muted-foreground">Altersklasse: <span className="font-semibold text-primary">{calcAgeClass(newData.birth_date)}</span></p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Zurück</Button>
              <Button
                onClick={() => createMutation.mutate(newData)}
                disabled={!newData.first_name.trim() || !newData.last_name.trim() || createMutation.isPending || uploading}
              >
                {createMutation.isPending ? 'Erstelle...' : 'Spieler erstellen & hinzufügen'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}