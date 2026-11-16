import { useState, useEffect } from 'react';
import { useAdsSettings, ADS_KEYS } from '@/lib/useAdsSetting';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Megaphone, Save, CheckCircle2 } from 'lucide-react';

export default function AdsAdmin() {
  const { user } = useAuth();
  const { map, save, isSaving } = useAdsSettings();
  const [form, setForm] = useState({
    enabled: false,
    html: '',
    yearlyPriceId: '',
    lifetimePriceId: '',
    yearlyLabel: '',
    lifetimeLabel: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      enabled: map[ADS_KEYS.enabled] === 'true',
      html: map[ADS_KEYS.html] || '',
      yearlyPriceId: map[ADS_KEYS.yearlyPriceId] || '',
      lifetimePriceId: map[ADS_KEYS.lifetimePriceId] || '',
      yearlyLabel: map[ADS_KEYS.yearlyLabel] || '',
      lifetimeLabel: map[ADS_KEYS.lifetimeLabel] || '',
    });
  }, [map]);

  if (!isTurnierAdmin(user)) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Du hast keine Berechtigung für diesen Bereich.
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    await Promise.all([
      save(ADS_KEYS.enabled, form.enabled ? 'true' : 'false'),
      save(ADS_KEYS.html, form.html),
      save(ADS_KEYS.yearlyPriceId, form.yearlyPriceId),
      save(ADS_KEYS.lifetimePriceId, form.lifetimePriceId),
      save(ADS_KEYS.yearlyLabel, form.yearlyLabel),
      save(ADS_KEYS.lifetimeLabel, form.lifetimeLabel),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Werbung &amp; Werbefrei</h1>
          <p className="text-sm text-muted-foreground">Werbung ein-/ausschalten, Werbecode hinterlegen und Werbefrei-Preise konfigurieren</p>
        </div>
      </div>

      {/* Globaler Schalter */}
      <div className="flex items-center justify-between gap-4 border border-border rounded-xl p-4 bg-card">
        <div>
          <h3 className="font-semibold text-sm">Werbung aktiv</h3>
          <p className="text-xs text-muted-foreground">Schaltet die Werbeanzeigen für alle Nutzer ein oder aus (außer Werbefrei-Abonnenten).</p>
        </div>
        <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
      </div>

      {/* Werbecode */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-3">
        <div>
          <Label className="text-sm font-semibold">Werbecode (HTML / AdSense)</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Füge hier den Werbecode ein (z.B. AdSense &lt;ins&gt;-Tag inkl. &lt;script&gt;). Script-Tags werden automatisch ausgeführt.
          </p>
        </div>
        <textarea
          value={form.html}
          onChange={e => setForm(f => ({ ...f, html: e.target.value }))}
          rows={6}
          placeholder='<ins class="adsbygoogle" ...></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>'
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Werbefrei-Preise */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-4">
        <h3 className="font-semibold text-sm">Werbefrei-Preise (Stripe)</h3>
        <p className="text-xs text-muted-foreground">Hinterlege die Stripe Price-IDs und Anzeige-Labels für die Upgrade-Buttons im Profil.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-primary">Jährlich</p>
            <div className="space-y-1.5">
              <Label>Stripe Price-ID</Label>
              <Input value={form.yearlyPriceId} onChange={e => setForm(f => ({ ...f, yearlyPriceId: e.target.value }))} placeholder="price_..." className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label>Anzeige-Label</Label>
              <Input value={form.yearlyLabel} onChange={e => setForm(f => ({ ...f, yearlyLabel: e.target.value }))} placeholder="z.B. 9,99 €" />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-amber-600">Lebenslang</p>
            <div className="space-y-1.5">
              <Label>Stripe Price-ID</Label>
              <Input value={form.lifetimePriceId} onChange={e => setForm(f => ({ ...f, lifetimePriceId: e.target.value }))} placeholder="price_..." className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label>Anzeige-Label</Label>
              <Input value={form.lifetimeLabel} onChange={e => setForm(f => ({ ...f, lifetimeLabel: e.target.value }))} placeholder="z.B. 29,99 €" />
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
        {saved ? <><CheckCircle2 className="w-4 h-4 text-green-400" />Gespeichert!</> : isSaving ? 'Speichern…' : <><Save className="w-4 h-4" />Speichern</>}
      </Button>
    </div>
  );
}