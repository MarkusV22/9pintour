import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const FUTURE_SETTING_KEY = 'future_series_visible';

export function useFutureSeriesSetting() {
  const queryClient = useQueryClient();
  const { data: setting } = useQuery({
    queryKey: ['app-setting', FUTURE_SETTING_KEY],
    queryFn: async () => {
      const list = await base44.entities.AppSetting.filter({ key: FUTURE_SETTING_KEY });
      return list[0] || null;
    },
    staleTime: 60 * 1000,
  });

  // Standardmäßig sichtbar, solange kein Setting hinterlegt ist
  const isVisible = setting ? setting.value === 'true' : true;

  const toggleMutation = useMutation({
    mutationFn: async (visible) => {
      const value = visible ? 'true' : 'false';
      if (setting?.id) {
        return base44.entities.AppSetting.update(setting.id, { value });
      }
      return base44.entities.AppSetting.create({ key: FUTURE_SETTING_KEY, value });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-setting', FUTURE_SETTING_KEY] }),
  });

  return { isVisible, toggle: (visible) => toggleMutation.mutate(visible), isToggling: toggleMutation.isPending };
}