import { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, ExternalLink, Image as ImageIcon, AlertCircle } from 'lucide-react';

export default function PdfLogoUpload({ label, settingKey, currentUrl, onSave, onDelete, aspect = 'square' }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await onSave(settingKey, file_url);
    } catch (err) {
      setError(err?.message || 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const aspectClass = aspect === 'wide' ? 'aspect-[3/1]' : 'aspect-square';

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm text-foreground">{label}</h3>
      </div>

      {currentUrl ? (
        <div className="space-y-3">
          <div className={`${aspectClass} bg-muted/30 rounded-xl border border-border flex items-center justify-center overflow-hidden p-3`}>
            <img src={currentUrl} alt={label} className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 flex-1"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Lädt...</>
                : <><Upload className="w-4 h-4" />Ersetzen</>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.open(currentUrl, '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => { if (confirm(`${label} löschen?`)) onDelete(settingKey); }}
              disabled={uploading}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`${aspectClass} bg-muted/20 rounded-xl border border-dashed border-border flex items-center justify-center`}>
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <Button
            variant="outline"
            className="gap-2 w-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Lädt hoch...</>
              : <><Upload className="w-4 h-4" />Logo hochladen</>}
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}