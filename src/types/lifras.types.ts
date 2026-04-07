// Types pour les exercices LIFRAS (Ligue Francophone de Recherches et d'Activités Sous-marines)

export type NiveauLIFRAS = 'TN' | 'NB' | 'P2' | 'P3' | 'P4' | 'AM' | 'MC' | 'MF' | 'MN';

export interface ExerciceLIFRAS {
  id: string;
  code: string;          // Ex: "P2.RA", "AM.OP", "TN.01"
  niveau: NiveauLIFRAS;  // Niveau requis
  description: string;   // Description de l'exercice
  specialite?: string;   // Spécialité (uniquement pour niveau TN) - Ex: "Nitrox", "Combi Étanche"
  created_at?: Date;
  updated_at?: Date;
}

// Labels pour l'affichage
export const NIVEAU_LABELS: Record<NiveauLIFRAS, string> = {
  'TN': 'Tous Niveaux',
  'NB': 'Non Breveté',
  'P2': 'Plongeur 2★',
  'P3': 'Plongeur 3★',
  'P4': 'Plongeur 4★',
  'AM': 'Assistant Moniteur',
  'MC': 'Moniteur Club',
  'MF': 'Moniteur Fédéral',
  'MN': 'Moniteur National'
};

// Ordre d'affichage des niveaux (TN en premier, puis progression des brevets)
export const NIVEAU_ORDER: NiveauLIFRAS[] = ['TN', 'NB', 'P2', 'P3', 'P4', 'AM', 'MC', 'MF', 'MN'];

/**
 * Map plongeur_code (stored in member records) to NiveauLIFRAS (used for exercises).
 * Member records store numeric codes ('1', '2', '3', '4') while exercises use
 * standard LIFRAS codes ('NB', 'P2', 'P3', 'P4', 'AM', 'MC', 'MF', 'MN').
 */
export function plongeurCodeToNiveau(code: string | undefined): NiveauLIFRAS | null {
  if (!code) return null;
  const mapping: Record<string, NiveauLIFRAS> = {
    'NB': 'NB',
    '1': 'NB',  // Plongeur 1★ uses NB exercises
    '2': 'P2',
    '3': 'P3',
    '4': 'P4',
    'P2': 'P2',
    'P3': 'P3',
    'P4': 'P4',
    'AM': 'AM',
    'MC': 'MC',
    'MF': 'MF',
    'MN': 'MN',
  };
  return mapping[code.toUpperCase()] ?? null;
}