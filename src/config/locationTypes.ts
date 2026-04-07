/**
 * Configuration des types de lieu pour les opérations de plongée
 * Utilisé dans OperationsPage (tableau), OperationDetailView (formulaire),
 * et PalanqueeBuilder (validation selon lieu)
 */

export const LOCATION_TYPES = [
  'Carrière',
  'Zélande',
  'Mer du Nord',
  'Mer',
  'Lac',
  'Piscine',
  'Autre'
] as const;

export type LocationType = typeof LOCATION_TYPES[number];

/** Couleurs Tailwind pour badges dans le tableau des opérations */
export const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  'Carrière': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Zélande': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Mer du Nord': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Mer': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'Lac': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Piscine': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'Autre': 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400'
};

/** Icônes pour affichage rapide dans le tableau */
export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  'Carrière': '⛏️',
  'Zélande': '🌊',
  'Mer du Nord': '🚢',
  'Mer': '🏖️',
  'Lac': '🏞️',
  'Piscine': '🏊',
  'Autre': '📍'
};

/**
 * Types de lieu considérés comme "Nos Eaux" selon le MIL 2026
 * (lacs, carrières, Zélande)
 */
export const NOS_EAUX_TYPES: LocationType[] = ['Carrière', 'Zélande', 'Lac'];

/**
 * Types de lieu considérés comme "Mer" selon le MIL 2026
 */
export const MER_TYPES: LocationType[] = ['Mer du Nord', 'Mer'];
