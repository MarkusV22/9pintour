import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const ADS_KEYS = {
  enabled: 'ads_enabled',
  html: 'ads_html',
  yearlyPriceId: 'ads_premium_yearly_price_id',
  lifetimePriceId: 'ads_premium_lifetime_price_id',
  yearlyLabel: 'ads_premium_yearly_label',
  lifetimeLabel: 'ads_premium_lifetime_label',
};

const ALL_KEYS = Object.values(ADS_KEYS);

// Lädt alle werbebezogenen AppSettings und bietet ein Save-Helper zum Upserten.
export function useAdsSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['ads-settings'],
    queryFn: async () => {
      const all = await base44.entities.AppSetting.list('-created_date', 200);
      const map = {};
      const byKey = {};
      ALL_KEYS.forEach(k => { map[k] = ''; });
      all.forEach(s => { byKey[s.key] = s; });
      ALL_KEYS.forEach(k => { if (byKey[k]) map[k] = byKey[k].value; });
      return { map, byKey };
    },
    staleTime: 60 * 1000,
  });

  const map = data?.map || {};
  const byKey = data?.byKey || {};

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      const existing = byKey[key];
      if (existing?.id) {
        return base44.entities.AppSetting.update(existing.id, { value });
      }
      return base44.entities.AppSetting.create({ key, value });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ads-settings'] }),
  });

  const save = (key, value) => saveMutation.mutate({ key, value });

  return { map, save, isSaving: saveMutation.isPending };
}