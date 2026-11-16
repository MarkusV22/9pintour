import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useMemo } from 'react';
import { formatName } from '@/lib/utils';

export function usePlayerMap() {
  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.list('name', 9999),
  });

  const playerMap = useMemo(() => {
    const map = {};
    players.forEach(p => { map[p.id] = p; });
    return map;
  }, [players]);

  const getPlayerName = (playerId) => {
    if (!playerId) return '–';
    const p = playerMap[playerId];
    if (!p) return '–';
    const raw = p.first_name && p.last_name
      ? `${p.first_name} ${p.last_name}`
      : (p.name || '');
    return formatName(raw) || playerId;
  };

  return { playerMap, players, getPlayerName };
}