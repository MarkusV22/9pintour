import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useAdsSettings, ADS_KEYS } from '@/lib/useAdsSetting';
import { useAuth } from '@/lib/AuthContext';
import { isPremiumActive, formatPremiumExpiry } from '@/lib/premium';
import { Crown, CheckCircle2, Sparkles, Loader2, AlertCircle } from 'lucide-react';

// Eingebettetes Upgrade-UI für das Werbefrei-Abo (jährlich / lebenslang).
export default function PremiumUpgrade() {
  const { user, checkUserAuth } = useAuth();
  const { map } = useAdsSettings();
  const [error, setError] = useState('');

  const yearlyPriceId = map[ADS_KEYS.yearlyPriceId];
  const lifetimePriceId = map[ADS_KEYS.lifetimePriceId];
  const yearlyLabel = map[ADS_KEYS.yearlyLabel] || '9,99 €';
  const lifetimeLabel = map[ADS_KEYS.lifetimeLabel] || '29,99 €';

  const isActive = isPremiumActive(user);
  const expiry = formatPremiumExpiry(user?.premium_expires_at);

  const checkoutMutation = useMutation({
    mutationFn: async ({ type, priceId }) => {
      const res = await base44.functions.invoke('createCheckoutSession', {
        mode: 'premium',
        premium_type: type,
        price_id: priceId,
        user_email: user.email,
        success_url: window.location.href,
        cancel_url: window.location.href,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.url) {
        // Checkout funktioniert nicht innerhalb eines Iframes (Vorschau)
        if (window.self !== window.top) {
          alert('Die Zahlung ist nur in der veröffentlichten App möglich. Bitte öffne die App direkt im Browser.');
          return;
        }
        window.location.href = data.url;
      } else {
        setError('Keine Checkout-URL erhalten.');
      }
    },
    onError: (e) => setError(e?.message || 'Zahlung konnte nicht gestartet werden.'),
  });

  const buy = (type, priceId, label) => {
    setError('');
    if (!priceId) {
      setError('Für diese Option ist noch kein Preis hinterlegt. Bitte wende dich an den Support.');
      return;
    }
    checkoutMutation.mutate({ type, priceId });
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-primary/5 border border-amber-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="w-5 h-5 text-amber-500" />
        <h2 className="text-base font-semibold text-foreground">Werbefrei nutzen</h2>
      </div>

      {isActive ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Du nutzt werbefrei {user.premium_type === 'lifetime' ? '– lebenslang' : ''}</p>
            {user.premium_type === 'yearly' && expiry && (
              <p className="text-xs text-green-700">Gültig bis: {expiry}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Schalte alle Werbeanzeigen in der App dauerhaft aus. Wähle zwischen einem jährlichen Abo oder einer einmaligen Lebenszeit-Zahlung.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Jährlich */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">Jährlich</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{yearlyLabel}<span className="text-sm font-normal text-muted-foreground">/Jahr</span></p>
              <Button
                onClick={() => buy('yearly', yearlyPriceId, yearlyLabel)}
                disabled={checkoutMutation.isPending}
                className="w-full gap-2"
              >
                {checkoutMutation.isPending && checkoutMutation.variables?.type === 'yearly'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Weiterleitung…</>
                  : 'Jetzt abonnieren'}
              </Button>
            </div>
            {/* Lebenslang */}
            <div className="bg-card border border-amber-200 rounded-xl p-4 flex flex-col gap-3 relative">
              <span className="absolute -top-2 right-3 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Bestes Angebot</span>
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm text-foreground">Lebenslang</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{lifetimeLabel}<span className="text-sm font-normal text-muted-foreground">einmalig</span></p>
              <Button
                variant="outline"
                onClick={() => buy('lifetime', lifetimePriceId, lifetimeLabel)}
                disabled={checkoutMutation.isPending}
                className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                {checkoutMutation.isPending && checkoutMutation.variables?.type === 'lifetime'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Weiterleitung…</>
                  : 'Einmal kaufen'}
              </Button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</p>
          )}
        </>
      )}
    </div>
  );
}