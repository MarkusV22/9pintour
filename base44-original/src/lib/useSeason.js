import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useSeasons() {
  const { data: seasons = [], isLoading } = useQuery({
    queryKey: ['seasons'],
    queryFn: () => base44.entities.Season.list('-start_date', 50),
  });

  const activeSeason = seasons.find(s => s.is_active) || null;

  return { seasons, activeSeason, isLoading };
}