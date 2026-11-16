import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const NEWSLETTER_ENABLED_KEY = 'newsletter_enabled';

// Standardmäßig aktiv, solange kein Setting hinterlegt ist.
export function useNewsletterEnabled() {
  const queryClient = useQueryClient();
  const { data: setting } = useQuery({
    queryKey: ['app-setting', NEWSLETTER_ENABLED_KEY],
    queryFn: async () => {
      const list = await base44.entities.AppSetting.filter({ key: NEWSLETTER_ENABLED_KEY });
      return list[0] || null;
    },
    staleTime: 60 * 1000,
  });

  const isEnabled = setting ? setting.value !== 'false' : true;

  const toggleMutation = useMutation({
    mutationFn: async (enabled) => {
      const value = enabled ? 'true' : 'false';
      if (setting?.id) {
        return base44.entities.AppSetting.update(setting.id, { value });
      }
      return base44.entities.AppSetting.create({ key: NEWSLETTER_ENABLED_KEY, value });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-setting', NEWSLETTER_ENABLED_KEY] }),
  });

  return { isEnabled, toggle: (enabled) => toggleMutation.mutate(enabled), isToggling: toggleMutation.isPending };
}