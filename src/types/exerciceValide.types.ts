/**
 * Types pour le suivi des exercices validés par membre
 * Collection: /clubs/{clubId}/members/{memberId}/exercices_valides/{exerciceValideId}
 */

export interface ExerciceValide {
  id: string;

  // Référence à l'exercice LIFRAS
  exercice_id: string;           // ID de l'exercice dans exercices_lifras
  exercice_code: string;         // Code de l'exercice (ex: "P2.RA", "TN.NB1")
  exercice_description: string;  // Description de l'exercice
  exercice_niveau: string;       // Niveau de l'exercice (TN, NB, P2, etc.)
  exercice_specialite?: string;  // Spécialité si niveau TN

  // Date de validation
  date_validation: Date;         // Date où l'exercice a été validé

  // Moniteur qui a validé
  moniteur_nom: string;          // Nom du moniteur (texte libre)
  moniteur_id?: string;          // ID du membre si moniteur du club (optionnel)

  // Notes optionnelles
  notes?: string;                // Commentaires éventuels
  lieu?: string;                 // Lieu où l'exercice a été effectué

  // Métadonnées
  created_at: Date;
  updated_at: Date;
  created_by?: string;           // ID de l'utilisateur qui a créé l'entrée
}

// Type pour la création (sans id et métadonnées auto-générées)
export type ExerciceValideCreate = Omit<ExerciceValide, 'id' | 'created_at' | 'updated_at'>;

// Type pour la mise à jour partielle
export type ExerciceValideUpdate = Partial<Omit<ExerciceValide, 'id' | 'created_at' | 'updated_at'>>;
