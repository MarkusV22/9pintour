import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function AddResultDialog({ open, onOpenChange, onSave, isPending }) {
  const [form, setForm] = useState({ player_name: '', position: '', points: '', notes: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      player_name: form.player_name,
      position: Number(form.position),
      points: form.points ? Number(form.points) : undefined,
      notes: form.notes || undefined,
    });
    setForm({ player_name: '', position: '', points: '', notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ergebnis eintragen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Spielername *</Label>
            <Input
              value={form.player_name}
              onChange={(e) => setForm({ ...form, player_name: e.target.value })}
              placeholder="Name des Spielers"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Platzierung *</Label>
              <Input
                type="number"
                min="1"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Punkte</Label>
              <Input
                type="number"
                min="0"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notizen</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Speichern...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}