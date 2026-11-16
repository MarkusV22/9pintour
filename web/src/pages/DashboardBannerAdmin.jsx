import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isTurnierAdmin } from '@/lib/roles';
import { Upload, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function DashboardBannerAdmin() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: settings = {} } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const data = await base44.entities.AppSetting.filter({});
      return Object.fromEntries(data.map(s => [s.key, s.value]));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      setUploading(true);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        const existing = await base44.entities.AppSetting.filter({ key: 'dashboard_banner_url' });
        if (existing.length > 0) {
          await base44.entities.AppSetting.update(existing[0].id, { value: file_url });
        } else {
          await base44.entities.AppSetting.create({ key: 'dashboard_banner_url', value: file_url });
        }
        
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return file_url;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const existing = await base44.entities.AppSetting.filter({ key: 'dashboard_banner_url' });
      if (existing.length > 0) {
        await base44.entities.AppSetting.delete(existing[0].id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
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

  const bannerUrl = settings.dashboard_banner_url;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard-Banner</h1>
        <p className="text-muted-foreground mt-1">Verwalte das Banner, das oben im Dashboard angezeigt wird</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
        {/* Aktuelles Banner */}
        {bannerUrl ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Aktuelles Banner:</p>
            <div className="rounded-xl overflow-hidden border border-border">
              <img src={bannerUrl} alt="Dashboard Banner" className="w-full h-auto object-cover" />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-muted/30 rounded-xl">
            <p className="text-muted-foreground">Kein Banner hochgeladen</p>
          </div>
        )}

        {/* Upload */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Neues Banner hochladen:</p>
          <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  uploadMutation.mutate(e.target.files[0]);
                }
              }}
              disabled={uploading}
              className="hidden"
            />
            <div className="text-center">
              <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Bild hochladen</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG oder WebP</p>
            </div>
          </label>
        </div>

        {saved && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-4 h-4" />
            Banner gespeichert ✓
          </div>
        )}

        {/* Aktionen */}
        {bannerUrl && (
          <div className="pt-4 border-t border-border flex gap-3">
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-2 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
              Löschen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}