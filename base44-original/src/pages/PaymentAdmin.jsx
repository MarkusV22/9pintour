import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { CreditCard, CheckCircle2, TrendingUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';

export default function PaymentAdmin() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: settings = {} } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const data = await base44.entities.AppSetting.filter({});
      return Object.fromEntries(data.map(s => [s.key, s.value]));
    },
  });

  const enabled = settings.online_payment_enabled !== 'false';

  const toggleMutation = useMutation({
    mutationFn: async (newValue) => {
      const existing = await base44.entities.AppSetting.filter({ key: 'online_payment_enabled' });
      if (existing.length > 0) {
        await base44.entities.AppSetting.update(existing[0].id, { value: String(newValue) });
      } else {
        await base44.entities.AppSetting.create({ key: 'online_payment_enabled', value: String(newValue) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const tourFeeEuros = settings.tour_fee_cents ? (parseInt(settings.tour_fee_cents, 10) / 100) : 0;
  const [tourFeeInput, setTourFeeInput] = useState(tourFeeEuros ? tourFeeEuros.toString() : '');

  const tourFeeMutation = useMutation({
    mutationFn: async (euros) => {
      const cents = Math.round(parseFloat(euros) * 100);
      const existing = await base44.entities.AppSetting.filter({ key: 'tour_fee_cents' });
      if (existing.length > 0) {
        await base44.entities.AppSetting.update(existing[0].id, { value: String(cents) });
      } else {
        await base44.entities.AppSetting.create({ key: 'tour_fee_cents', value: String(cents) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (!isAuthenticated || !isTurnierAdmin(user)) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <p className="text-muted-foreground">Zugriff verweigert – nur Admins</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Online-Zahlung</h1>
        <p className="text-muted-foreground mt-1">Globale Steuerung der Online-Startgebühren über Stripe</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Online-Zahlung aktiviert</p>
              <p className="text-xs text-muted-foreground">
                {enabled ? 'Spieler können online über Stripe bezahlen' : 'Online-Zahlung ist deaktiviert – nur Bar-Zahlung möglich'}
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
          />
        </div>

        {saved && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-4 h-4" />
            Einstellung gespeichert ✓
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Diese Einstellung gilt für <strong>alle Turniere</strong>. Ist sie deaktiviert, wird keine Online-Zahlung über Stripe angeboten, unabhängig von den einzelnen Turnier-Einstellungen. Bar-Zahlungen können weiterhin im Startplan markiert werden.
          </p>
        </div>
      </div>

      {/* Tour-Fee Konfiguration */}
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4 mt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Tour-Fee (9-Pin Tour Abgabe)</p>
            <p className="text-xs text-muted-foreground">Fester Betrag pro Spieler, der zusätzlich zur Startgebühr erhoben wird</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tour-Fee pro Spieler (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={tourFeeInput}
              onChange={e => setTourFeeInput(e.target.value)}
              placeholder="z.B. 2.00"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <button
            onClick={() => {
              if (tourFeeInput === '' || isNaN(parseFloat(tourFeeInput))) return;
              tourFeeMutation.mutate(tourFeeInput);
            }}
            disabled={tourFeeMutation.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Speichern
          </button>
        </div>

        {tourFeeEuros > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
            <p className="text-xs text-purple-800">
              <strong>Aktuell: {tourFeeEuros.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</strong> pro Spieler
            </p>
            <p className="text-xs text-purple-600 mt-1">
              Bei Online-Zahlung wird die Tour-Fee automatisch einbehalten. Bei Bar-Zahlung kassiert der Verein den Gesamtbetrag und muss die Tour-Fee an die 9-Pin Tour abführen – nachverfolgbar im Veranstalter-Dashboard.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Die Tour-Fee gilt <strong>global für alle Turniere</strong> und wird pro Spieler (Mannschaftsspieler und Einzelstarter) berechnet. Veranstalter sehen im Dashboard transparent, wie viel Tour-Fee online einbehalten wurde und wie viel sie aus Barzahlungen noch abführen müssen.
          </p>
        </div>
      </div>
    </div>
  );
}