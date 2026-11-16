import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin } from '@/lib/roles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PlayerChangeRequestDialog from '@/components/PlayerChangeRequestDialog';

export function calcAgeClass(birthDateStr) {
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

export default function PlayerEditDialog({ open, onOpenChange, player, onSaved }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [editData, setEditData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const { toast } = useToast();
  const isLockedName = !isAdmin(user);

  useEffect(() => {
    if (open && player) {
      setEditData({
        id: player.id,
        first_name: player.first_name || '',
        last_name: player.last_name || '',
        birth_date: player.birth_date || '',
        club: player.club || '',
        phone: player.phone || '',
        photo_url: player.photo_url || '',
        is_hobby: player.is_hobby || false,
      });
    }
  }, [open, player]);

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const updates = {
        first_name: data.first_name,
        last_name: data.last_name,
        name: `${data.first_name.trim()} ${data.last_name.trim()}`.trim(),
        birth_date: data.birth_date || '',
        age_class: calcAgeClass(data.birth_date),
        club: data.club || '',
        phone: data.phone || '',
        photo_url: data.photo_url || '',
        is_hobby: data.is_hobby || false,
      };
      return base44.entities.Player.update(id, updates);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      onSaved?.(updated);
      onOpenChange(false);
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

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setEditData(prev => ({ ...prev, photo_url: file_url }));
    setUploading(false);
  };

  if (!editData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Spieler bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {editData.photo_url ? (
                <img src={editData.photo_url} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl text-muted-foreground">👤</span>
              )}
            </div>
            <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="w-3.5 h-3.5" /> {uploading ? 'Lädt...' : 'Foto ändern'}
            </Button>
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
          {isLockedName && player && (
            <PlayerChangeRequestDialog open={showRequestDialog} onOpenChange={setShowRequestDialog} player={player} />
          )}
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
              <input type="checkbox" checked={editData.is_hobby || false} onChange={e => setEditData({ ...editData, is_hobby: e.target.checked })} disabled={!isAdmin(user)} className="w-4 h-4 rounded border-border" />
              <span className="text-sm text-muted-foreground">Für Hobby-Spieler wird eine eigene Hobby-Wertung erstellt, der Spieler wird aber auch in der 9-Pin Tour gewertet{!isAdmin(user) ? ' (nur von Admins änderbar)' : ''}</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => updatePlayerMutation.mutate({ id: editData.id, data: editData })} disabled={!editData.first_name.trim() || !editData.last_name.trim() || updatePlayerMutation.isPending || uploading}>
            {updatePlayerMutation.isPending ? 'Speichere...' : 'Änderungen speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}