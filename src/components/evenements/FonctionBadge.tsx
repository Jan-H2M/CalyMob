/**
 * Badge pour afficher la fonction d'un participant avec couleur personnalisée
 */

import { cn } from '@/utils/utils';

// Couleurs par défaut pour les fonctions courantes
const DEFAULT_FONCTION_COLORS: Record<string, string> = {
  'membre': '#3b82f6',      // blue-500
  'encadrant': '#10b981',   // green-500
  'ca': '#2563eb',          // blue-600
  'accueil': '#ec4899', // pink-500
  'tresorier': '#f59e0b',   // amber-500
};

interface FonctionBadgeProps {
  fonction?: string;
  color?: string; // Couleur personnalisée depuis value list
  className?: string;
}

export function FonctionBadge({ fonction, color, className }: FonctionBadgeProps) {
  if (!fonction) {
    return null;
  }

  // Utiliser la couleur fournie ou la couleur par défaut
  const badgeColor = color || DEFAULT_FONCTION_COLORS[fonction.toLowerCase()];

  if (badgeColor) {
    // Calculer une couleur de texte lisible (simple heuristique)
    const getLuminance = (hex: string) => {
      const rgb = parseInt(hex.slice(1), 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = (rgb >> 0) & 0xff;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    const luminance = getLuminance(badgeColor);
    const bgOpacity = luminance > 155 ? '20' : '30';

    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
          className
        )}
        style={{
          backgroundColor: `${badgeColor}${bgOpacity}`,
          color: badgeColor,
          border: `1px solid ${badgeColor}40`
        }}
      >
        {fonction}
      </span>
    );
  }

  // Fallback sans couleur
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 border border-gray-300 dark:border-dark-border dark:border-gray-600 whitespace-nowrap",
        className
      )}
    >
      {fonction}
    </span>
  );
}
