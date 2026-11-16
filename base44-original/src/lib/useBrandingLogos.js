import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const TIER_KEYS = {
  'Grand Slam': 'pdf_logo_grand_slam',
  'Masters 1000': 'pdf_logo_masters_1000',
  'Masters 500': 'pdf_logo_masters_500',
  'Masters 250': 'pdf_logo_masters_250',
  'Challenger': 'pdf_logo_challenger',
  'Competition': 'pdf_logo_competition',
};

export function useBrandingLogos() {
  const { data: settings = [] } = useQuery({
    queryKey: ['branding-logos'],
    queryFn: () => base44.entities.AppSetting.list(),
    staleTime: 5 * 60 * 1000,
  });

  const map = {};
  settings.forEach(s => { map[s.key] = s.value; });

  const tourLogoUrl = map['pdf_logo_tour'] || null;
  const tierLogoUrls = {};
  Object.entries(TIER_KEYS).forEach(([tier, key]) => {
    if (map[key]) tierLogoUrls[tier] = map[key];
  });

  return { tourLogoUrl, tierLogoUrls };
}