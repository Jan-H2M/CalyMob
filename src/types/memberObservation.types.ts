/**
 * Member Observations — Observations des encadrants
 * Collection: clubs/{clubId}/member_observations/{observationId}
 */

export type ObservationCategory =
  | 'exercice_lifras'
  | 'theme_session'
  | 'technique'
  | 'securite'
  | 'attitude'
  | 'general';

export type ObservationResult = 'acquis' | 'en_progres' | 'a_revoir';

export type ObservationContextType = 'piscine' | 'plongee' | 'theorie' | 'autre';

export interface MemberObservation {
  id: string;

  // Sujet
  memberId: string;
  memberName: string;
  memberNiveau: string;

  // Contexte
  contextType: ObservationContextType;
  contextId: string;  contextDate: Date;
  contextTitle: string;

  // Catégorie
  category: ObservationCategory;

  // Si category === 'exercice_lifras'
  exerciceCode?: string;
  exerciceDescription?: string;

  // Si category === 'theme_session'
  themeId?: string;
  themeTitle?: string;

  // Résultat
  result?: ObservationResult | null;
  note: string;

  // Observateur
  observerId: string;
  observerName: string;

  // Méta
  createdAt: Date;
  updatedAt: Date;
}

export const OBSERVATION_CATEGORIES: { value: ObservationCategory; label: string }[] = [
  { value: 'exercice_lifras', label: 'Exercice LIFRAS' },
  { value: 'theme_session', label: 'Thème de session' },  { value: 'technique', label: 'Technique' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'attitude', label: 'Attitude' },
  { value: 'general', label: 'Général' },
];

export const OBSERVATION_RESULTS: { value: ObservationResult; label: string; color: string }[] = [
  { value: 'acquis', label: 'Acquis', color: 'green' },
  { value: 'en_progres', label: 'En progrès', color: 'yellow' },
  { value: 'a_revoir', label: 'À revoir', color: 'red' },
];