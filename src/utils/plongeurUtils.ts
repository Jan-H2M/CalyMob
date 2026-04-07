/**
 * Utility functions for plongeur niveau/code management
 *
 * Niveaux LIFRAS officiels (MIL 2026):
 * NB, 1★, 2★, 3★, 4★, AM, MC, MF, MN
 */

/**
 * Options officielles pour le dropdown niveau de plongée.
 * Ordre: du plus bas (NB) au plus haut (MN).
 */
export const NIVEAU_OPTIONS: Array<{ code: string; label: string; fullName: string }> = [
  { code: 'NAG', label: 'NAG', fullName: 'Nageur' },
  { code: 'NB', label: 'NB',  fullName: 'Non Breveté' },
  { code: '1',  label: '1★',  fullName: 'Plongeur 1★' },
  { code: '2',  label: '2★',  fullName: 'Plongeur 2★' },
  { code: '3',  label: '3★',  fullName: 'Plongeur 3★' },
  { code: '4',  label: '4★',  fullName: 'Plongeur 4★' },
  { code: 'AM', label: 'AM',  fullName: 'Assistant Moniteur' },
  { code: 'MC', label: 'MC',  fullName: 'Moniteur Club' },
  { code: 'MF', label: 'MF',  fullName: 'Moniteur Fédéral' },
  { code: 'MN', label: 'MN',  fullName: 'Moniteur National' },
];

/**
 * Calculate standardized plongeur code from raw niveau value
 *
 * Mappings:
 * - "Non Breveté" / "NB" → "NB"
 * - "Plongeur 1*" (and variations) → "1"
 * - "Plongeur 2*" (and variations) → "2"
 * - "Plongeur 3*" (and variations) → "3"
 * - "Plongeur 4*" → "4"
 * - "Assistant Moniteur" → "AM"
 * - "Moniteur Club" → "MC"
 * - "Moniteur Fédéral" → "MF"
 * - "Moniteur National" → "MN"
 *
 * @param niveau - Raw niveau from Excel or dropdown (e.g., "Plongeur 1*", "Moniteur Club", "2★")
 * @returns Standardized code (e.g., "1", "MC", "NB") or empty string if not recognized
 */
export function calculatePlongeurCode(niveau: string | undefined): string {
  if (!niveau) return '';

  const normalized = niveau.trim().toLowerCase();

  // Nageur (swimmer, non-diver member)
  if (normalized === 'nag' || normalized.includes('nageur') || normalized.includes('zwemmer') || normalized.includes('swimmer')) return 'NAG';

  // Non Breveté
  if (normalized === 'nb' || normalized.includes('non breveté') || normalized.includes('non brevete')) return 'NB';

  // Plongeur 1* (with variations like NELOS, assimilation, dauphin)
  if (normalized.includes('plongeur 1') || normalized === '1' || normalized === '1★' || normalized === '1*') return '1';

  // Plongeur 2* (with variations like assimilation)
  if (normalized.includes('plongeur 2') || normalized === '2' || normalized === '2★' || normalized === '2*') return '2';

  // Plongeur 3* (with variations like assimilation)
  if (normalized.includes('plongeur 3') || normalized === '3' || normalized === '3★' || normalized === '3*') return '3';

  // Plongeur 4*
  if (normalized.includes('plongeur 4') || normalized === '4' || normalized === '4★' || normalized === '4*') return '4';

  // Moniteur National (check before Moniteur Club/Fédéral to avoid false matches)
  if (normalized.includes('moniteur national') || normalized === 'mn') return 'MN';

  // Moniteur Club
  if (normalized.includes('moniteur club') || normalized === 'mc') return 'MC';

  // Moniteur Fédéral
  if (normalized.includes('moniteur fédéral') || normalized.includes('moniteur federal') || normalized === 'mf') return 'MF';

  // Assistant Moniteur
  if (normalized.includes('assistant moniteur') || normalized === 'am') return 'AM';

  // Unknown niveau - return empty string
  return '';
}

/**
 * Get display label for plongeur code
 */
export function getPlongeurCodeLabel(code: string): string {
  const labels: Record<string, string> = {
    'NAG': 'Nageur',
    'NB': 'NB',
    '1': 'P1★',
    '2': 'P2★',
    '3': 'P3★',
    '4': 'P4★',
    'AM': 'Assistant Moniteur',
    'MC': 'Moniteur Club',
    'MF': 'Moniteur Fédéral',
    'MN': 'Moniteur National'
  };

  return labels[code] || code;
}

/**
 * Get all available plongeur codes for filtering
 */
export function getAllPlongeurCodes(): Array<{ code: string; label: string }> {
  return [
    { code: 'NAG', label: 'Nageur' },
    { code: 'NB', label: 'NB' },
    { code: '1', label: 'P1★' },
    { code: '2', label: 'P2★' },
    { code: '3', label: 'P3★' },
    { code: '4', label: 'P4★' },
    { code: 'AM', label: 'Assistant Moniteur' },
    { code: 'MC', label: 'Moniteur Club' },
    { code: 'MF', label: 'Moniteur Fédéral' },
    { code: 'MN', label: 'Moniteur National' }
  ];
}

/**
 * Hiérarchie numérique des niveaux (pour tri et comparaison)
 * Plus le nombre est élevé, plus le niveau est haut.
 */
export const NIVEAU_HIERARCHY: Record<string, number> = {
  'NAG': -1,
  'NB': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  'AM': 5,
  'MC': 6,
  'MF': 7,
  'MN': 8,
};

/**
 * Compare deux niveaux de plongée.
 * @returns >0 si a > b, <0 si a < b, 0 si égal
 */
export function compareNiveaux(a: string, b: string): number {
  return (NIVEAU_HIERARCHY[a] ?? -1) - (NIVEAU_HIERARCHY[b] ?? -1);
}
