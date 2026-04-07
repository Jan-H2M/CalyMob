/**
 * Session Themes — Bibliothèque de thèmes pédagogiques
 * Collection: clubs/{clubId}/session_themes/{themeId}
 */

export type ThemeCategory =
  | 'technique'
  | 'sauvetage'
  | 'orientation'
  | 'apnee'
  | 'flottabilite'
  | 'communication'
  | 'securite'
  | 'encadrement'
  | 'gestion_stress'
  | 'examen_prep'
  | 'jeux'
  | 'theorie'
  | 'autre';

export interface ThemeDocument {
  name: string;
  url: string;
  type: string;       // 'pdf' | 'docx' | 'image'
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date;
}
export interface RelatedExercice {
  code: string;         // "P2.CO"
  description: string;  // "Épreuve du combiné"
}

export interface SessionTheme {
  id: string;

  // Identité
  title: string;
  description: string;
  instructorNotes?: string;

  // Classification
  category: ThemeCategory;
  targetNiveaux: string[];    // ["1*", "2*"]
  difficulty: 'debutant' | 'intermediaire' | 'avance';

  // Liens LIFRAS
  relatedExercices: RelatedExercice[];

  // Documents pédagogiques
  documents: ThemeDocument[];

  // Statistiques d'utilisation
  timesUsed: number;
  lastUsedDate?: Date;
  lastUsedSessionId?: string;
  // Méta
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export const THEME_CATEGORIES: { value: ThemeCategory; label: string }[] = [
  { value: 'technique', label: 'Technique' },
  { value: 'sauvetage', label: 'Sauvetage' },
  { value: 'orientation', label: 'Orientation' },
  { value: 'apnee', label: 'Apnée' },
  { value: 'flottabilite', label: 'Flottabilité' },
  { value: 'communication', label: 'Communication' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'encadrement', label: 'Encadrement' },
  { value: 'gestion_stress', label: 'Gestion du stress' },
  { value: 'examen_prep', label: 'Préparation examen' },
  { value: 'jeux', label: 'Jeux' },
  { value: 'theorie', label: 'Théorie' },
  { value: 'autre', label: 'Autre' },
];