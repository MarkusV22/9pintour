import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, ExternalLink, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin } from '@/lib/roles';
import PdfLogoUpload from '@/components/PdfLogoUpload';

const LOGO_KEYS = [
  { key: 'pdf_logo_tour', label: '9-Pin Tour Logo', aspect: 'square' },
  { key: 'pdf_logo_future', label: '9PinFuture', aspect: 'wide' },
  { key: 'pdf_logo_grand_slam', label: 'Grand Slam', aspect: 'wide' },
  { key: 'pdf_logo_masters_1000', label: 'Masters 1000', aspect: 'wide' },
  { key: 'pdf_logo_masters_500', label: 'Masters 500', aspect: 'wide' },
  { key: 'pdf_logo_masters_250', label: 'Masters 250', aspect: 'wide' },
  { key: 'pdf_logo_challenger', label: 'Challenger', aspect: 'wide' },
  { key: 'pdf_logo_competition', label: 'Competition', aspect: 'wide' },
];

const SPONSOR_KEY = 'pdf_sponsor_logos';

export default function PdfBrandingAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploadingSponsor, setUploadingSponsor] = useState(false);
  const [saved, setSaved] = useState(false);

  const allKeys = [...LOGO_KEYS.map(l => l.key), SPONSOR_KEY];

  const { data: settings = [] } = useQuery({
    queryKey: ['pdf-branding-settings'],
    queryFn: async () => {
      const all = await base44.entities.AppSetting.list();
      return all.filter(s => allKeys.includes(s.key));
    },
  });

  const settingsMap = {};
  settings.forEach(s => { settingsMap[s.key] = s; });

  const sponsorSetting = settingsMap[SPONSOR_KEY];
  const sponsorLogos = (() => {
    try { return JSON.parse(sponsorSetting?.value || '[]'); } catch { return []; }
  })();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pdf-branding-settings'] });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const saveLogoMutation = useMutation({
    mutationFn: async ({ key, url }) => {
      if (settingsMap[key]) {
        await base44.entities.AppSetting.update(settingsMap[key].id, { value: url });
      } else {
        await base44.entities.AppSetting.create({ key, value: url });
      }
    },
    onSuccess: invalidate,
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async (key) => {
      if (settingsMap[key]) await base44.entities.AppSetting.delete(settingsMap[key].id);
    },
    onSuccess: invalidate,
  });

  const addSponsorMutation = useMutation({
    mutationFn: async (url) => {
      const newList = [...sponsorLogos, url];
      const value = JSON.stringify(newList);
      if (sponsorSetting) {
        await base44.entities.AppSetting.update(sponsorSetting.id, { value });
      } else {
        await base44.entities.AppSetting.create({ key: SPONSOR_KEY, value });
      }
    },
    onSuccess: invalidate,
  });

  const removeSponsorMutation = useMutation({
    mutationFn: async (idx) => {
      const newList = sponsorLogos.filter((_, i) => i !== idx);
      const value = JSON.stringify(newList);
      if (sponsorSetting) {
        await base44.entities.AppSetting.update(sponsorSetting.id, { value });
      } else {
        await base44.entities.AppSetting.create({ key: SPONSOR_KEY, value });
      }
    },
    onSuccess: invalidate,
  });

  const handleSponsorUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSponsor(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await addSponsorMutation.mutateAsync(file_url);
    } finally {
      setUploadingSponsor(false);
      if (e.target) e.target.value = '';
    }
  };

  if (!isAdmin(user)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Kein Zugriff – nur für Administratoren.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">PDF-Branding</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Lade hier die Logos für den PDF-Header und die Sponsoren-Bereiche hoch. Diese werden in allen generierten PDFs (Startplan, Ergebnisliste, Eingabeblatt) angezeigt.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4" />
          Gespeichert!
        </div>
      )}

      {/* Header-Logos */}
      <section>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Header-Logos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LOGO_KEYS.map(({ key, label, aspect }) => (
            <PdfLogoUpload
              key={key}
              label={label}
              settingKey={key}
              aspect={aspect}
              currentUrl={settingsMap[key]?.value || null}
              onSave={(k, url) => saveLogoMutation.mutateAsync({ key: k, url })}
              onDelete={(k) => deleteLogoMutation.mutateAsync(k)}
            />
          ))}
        </div>
      </section>

      {/* Sponsor-Logos */}
      <section>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Sponsor-Logos</h2>
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          {sponsorLogos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {sponsorLogos.map((url, idx) => (
                <div key={idx} className="bg-muted/20 rounded-xl border border-border p-3 space-y-2">
                  <div className="aspect-[3/1] bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src={url} alt={`Sponsor ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 flex-1"
                      onClick={() => window.open(url, '_blank')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => removeSponsorMutation.mutate(idx)}
                      disabled={removeSponsorMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
                <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="font-semibold text-foreground">Keine Sponsor-Logos hinterlegt</p>
              <p className="text-sm text-muted-foreground mt-1">Lade Logos hoch (PNG, JPG oder SVG).</p>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <label className="block">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={handleSponsorUpload}
                disabled={uploadingSponsor}
              />
              <Button
                variant="outline"
                className="gap-2 w-full cursor-pointer"
                disabled={uploadingSponsor}
                onClick={(e) => e.currentTarget.parentElement.querySelector('input').click()}
              >
                {uploadingSponsor
                  ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Lädt hoch...</>
                  : <><Upload className="w-4 h-4" />Sponsor-Logo hinzufügen</>}
              </Button>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}