import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2, FileText, Trash2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin } from '@/lib/roles';

const DISCLAIMER_KEY = 'privacy_disclaimer_url';

export default function DisclaimerAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSetting.filter({ key: DISCLAIMER_KEY }),
  });

  const currentSetting = settings[0] || null;
  const currentUrl = currentSetting?.value || null;

  const saveMutation = useMutation({
    mutationFn: async (url) => {
      if (currentSetting) {
        await base44.entities.AppSetting.update(currentSetting.id, { value: url });
      } else {
        await base44.entities.AppSetting.create({ key: DISCLAIMER_KEY, value: url });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (currentSetting) await base44.entities.AppSetting.delete(currentSetting.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await saveMutation.mutateAsync(file_url);
    setUploading(false);
  };

  if (!isAdmin(user)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Kein Zugriff – nur für Administratoren.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Datenschutz-Disclaimer</h1>
        <p className="text-muted-foreground mt-1 text-sm">Lade hier das Datenschutzdokument hoch (PDF oder Bild). Spieler sehen diesen Disclaimer beim ersten Speichern ihres Profils.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        {currentUrl ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">Disclaimer hochgeladen</p>
                <p className="text-xs text-green-600 truncate">{currentUrl}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(currentUrl, '_blank')}
              >
                <ExternalLink className="w-4 h-4" />
                Vorschau
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => { if (confirm('Disclaimer löschen?')) deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4" />
                Löschen
              </Button>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3">Dokument ersetzen:</p>
              <Button
                variant="outline"
                className="gap-2 w-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Lädt hoch...</>
                  : <><Upload className="w-4 h-4" />Neue Datei hochladen</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Kein Disclaimer hinterlegt</p>
              <p className="text-sm text-muted-foreground mt-1">Lade ein PDF oder Bild hoch (max. 10 MB).</p>
            </div>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading
                ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />Lädt hoch...</>
                : <><Upload className="w-4 h-4" />Datei hochladen</>}
            </Button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleUpload}
        />

        {saved && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Gespeichert!
          </div>
        )}
      </div>
    </div>
  );
}