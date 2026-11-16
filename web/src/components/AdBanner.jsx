import { useEffect, useRef } from 'react';
import { useAdsSettings, ADS_KEYS } from '@/lib/useAdsSetting';
import { useAuth } from '@/lib/AuthContext';
import { isPremiumActive } from '@/lib/premium';

// Zeigt die konfigurierte Werbung an, sofern global aktiviert und der Nutzer
// kein aktives Werbefrei-Abo hat. Unterstützt AdSense & Co., indem Script-Tags
// im eingefügten HTML nach der Render-Phase neu ausgeführt werden.
export default function AdBanner({ className = '' }) {
  const { map } = useAdsSettings();
  const { user } = useAuth();
  const containerRef = useRef(null);

  const adsEnabled = map[ADS_KEYS.enabled] === 'true';
  const html = map[ADS_KEYS.html];
  const showAds = adsEnabled && !!html && !isPremiumActive(user);

  // Script-Tags aus dem eingefügten HTML neu ausführen (AdSense etc.)
  useEffect(() => {
    if (!showAds) return;
    const container = containerRef.current;
    if (!container) return;
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }, [showAds, html]);

  if (!showAds) return null;

  return (
    <div className={`rounded-2xl border border-border bg-card overflow-hidden ${className}`}>
      <div className="flex items-center justify-center min-h-[90px] px-2 py-2">
        <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} className="w-full flex items-center justify-center" />
      </div>
    </div>
  );
}