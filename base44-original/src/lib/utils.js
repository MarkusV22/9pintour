import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/** Formatiert einen Namen so dass jedes Wort mit Großbuchstaben beginnt (Title Case) */
export function formatName(name) {
  if (!name) return name;
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => {
      const chars = [...word]; // korrekte Aufteilung bei Unicode/Umlauten
      return chars[0].toLocaleUpperCase('de') + chars.slice(1).join('').toLocaleLowerCase('de');
    })
    .join(' ');
} 


export const isIframe = window.self !== window.top;

/** Extrahiert alle Player-IDs eines Teams (1–6 Spieler), leerzeichen herausgefiltert */
export function getTeamPlayerIds(team) {
  if (!team) return [];
  return [team.player1_id, team.player2_id, team.player3_id, team.player4_id, team.player5_id, team.player6_id].filter(Boolean);
}