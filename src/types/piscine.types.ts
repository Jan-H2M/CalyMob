/**
 * Types pour le système de planification piscine
 * Séances piscine, disponibilités, et configuration par niveau
 */

import type { GonflageSlot, SessionType } from './piscineSlots';

/**
 * Disponibilité d'un membre pour une séance piscine
 * Collection: /clubs/{clubId}/availabilities
 *
 * Pour encadrants: time_slots contient '1ere_heure', '2eme_heure', ou les deux
 * Pour gonflage: time_slots contient '19h45', '20h15', '21h30' (un ou plusieurs)
 * Pour accueil: time_slots reste vide (pas de créneaux, juste available oui/non)
 *
 * Rétrocompatibilité: si time_slots est absent/undefined, on interprète
 * available=true comme "disponible pour tous les créneaux"
 */
export interface Availability {
  id: string;
  membre_id: string;
  membre_nom: string;
  membre_prenom: string;
  date: Date;                           // La date du mardi
  role: 'accueil' | 'encadrant' | 'gonflage' | 'theorie';
  available: boolean;
  time_slots?: string[];                // Créneaux spécifiques (encadrant/gonflage/theorie)
  created_at: Date;
  updated_at: Date;
}

/**
 * Assignment d'un membre à une fonction dans une séance
 */
export interface SessionAssignment {
  membre_id: string;
  membre_nom: string;
  membre_prenom: string;
  /** Pour les encadrants: créneau horaire (1ere_heure / 2eme_heure) */
  heure?: string;
}

/**
 * Configuration d'un niveau dans une séance
 */
export interface LevelAssignment {
  encadrants: SessionAssignment[];
  theme?: string;
  themeUpdatedBy?: string;
  themeUpdatedAt?: Date;
  // Per-uur thema's (TV-guide layout)
  theme_1ere_heure?: string;
  theme_1ere_heure_updated_by?: string;
  theme_1ere_heure_updated_at?: Date;
  theme_2eme_heure?: string;
  theme_2eme_heure_updated_by?: string;
  theme_2eme_heure_updated_at?: Date;
  // Index signature voor eventuele extra dynamische velden
  [key: string]: unknown;
}

/**
 * Niveaux de plongée pour les séances piscine
 */
export const PiscineLevel = {
  niveau1: '1*' as const,
  niveau2: '2*' as const,
  niveau3: '3*' as const,
  niveau4: '4*' as const,
  am: 'AM' as const,
  mc: 'MC' as const,

  all: ['1*', '2*', '3*', '4*', 'AM', 'MC'] as const,

  displayName(level: string): string {
    switch (level) {
      case '1*': return '1 Étoile';
      case '2*': return '2 Étoiles';
      case '3*': return '3 Étoiles';
      case '4*': return '4 Étoiles';
      case 'AM': return 'Aide Moniteur';
      case 'MC': return 'Moniteur Club';
      default: return level;
    }
  },

  stars(level: string): string {
    switch (level) {
      case '1*': return '⭐';
      case '2*': return '⭐⭐';
      case '3*': return '⭐⭐⭐';
      case '4*': return '⭐⭐⭐⭐';
      case 'AM': return '🎓';
      case 'MC': return '🎓🎓';
      default: return '';
    }
  }
};

export type PiscineLevelType = '1*' | '2*' | '3*' | '4*' | 'AM' | 'MC';

/**
 * Statuts d'une séance piscine
 */
export const PiscineSessionStatus = {
  brouillon: 'brouillon' as const,
  publie: 'publie' as const,
  termine: 'termine' as const,
};

export type PiscineSessionStatusType = 'brouillon' | 'publie' | 'termine';

/**
 * Configuration complète d'une séance piscine (ou théorie)
 * Collection: /clubs/{clubId}/piscine_sessions
 *
 * Le champ `type` distingue une séance piscine classique d'une séance théorie autonome.
 * Valeur par défaut : 'piscine' (rétrocompatibilité avec les sessions existantes).
 */
export interface PiscineSession {
  id: string;
  operationId: string;                 // Référence vers l'opération piscine
  type: SessionType;                   // 'piscine' | 'theorie' (défaut: 'piscine')
  date: Date;
  lieu: string;
  horaireDebut: string;                // Format: "20:30"
  horaireFin: string;                  // Format: "21:30"

  // Équipe accueil (gestion vestiaires, entrée)
  accueil: SessionAssignment[];

  // Encadrants baptêmes (initiations nouveaux)
  baptemes: SessionAssignment[];

  // Équipe gonflage — indexé par créneau horaire (19h45, 20h15, 21h30)
  // Rétrocompatibilité: anciennes sessions avec gonflage: [] ou clé '21h15' seront migrées
  gonflage: Record<GonflageSlot, SessionAssignment[]>;

  // Configuration par niveau de plongée
  niveaux: Record<string, LevelAssignment>;

  // Théorie — indexé par créneau horaire (19h30, 21h45)
  // Optionnel: peut être ajouté à une séance piscine ou être le contenu principal d'une séance théorie
  theorie?: Record<string, LevelAssignment>;

  // Notes/commentaires par cellule — clés: 'accueil', 'baptemes', 'gonflage_19h45', etc.
  notes?: Record<string, string>;

  statut: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * Types de groupes de discussion
 */
export type SessionGroupType = 'accueil' | 'encadrants' | 'gonflage' | 'niveau' | 'theorie';

/**
 * Pièce jointe dans un message
 */
export interface MessageAttachment {
  type: 'image' | 'pdf';
  url: string;
  filename: string;
  size: number;
}

/**
 * Message dans un groupe de discussion de séance
 * Collection: /clubs/{clubId}/piscine_sessions/{sessionId}/messages
 */
export interface SessionMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  group_type: SessionGroupType;
  group_level?: PiscineLevelType;       // Uniquement si group_type = 'niveau'
  attachments?: MessageAttachment[];
  read_by: string[];
  created_at: Date;
}

/**
 * Types de canaux d'équipe
 */
export type TeamChannelType = 'accueil' | 'encadrants' | 'gonflage';

/**
 * Canal d'équipe permanent
 * Collection: /clubs/{clubId}/team_channels
 */
export interface TeamChannel {
  id: string;                           // 'equipe_accueil' ou 'equipe_encadrants'
  name: string;
  type: TeamChannelType;
  description?: string;
  created_at: Date;
}

/**
 * Message dans un canal d'équipe
 * Collection: /clubs/{clubId}/team_channels/{channelId}/messages
 */
export interface TeamMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  attachments?: MessageAttachment[];
  read_by: string[];
  created_at: Date;
}

// ============ Types utilitaires ============

/**
 * Détail de disponibilité d'un membre avec ses créneaux
 */
export interface AvailabilityDetail extends SessionAssignment {
  time_slots?: string[];               // Créneaux spécifiques sélectionnés
}

/**
 * Vue groupée des disponibilités par date pour l'admin
 */
export interface AvailabilityByDate {
  date: Date;
  accueil: {
    available: SessionAssignment[];
    unavailable: SessionAssignment[];
    notIndicated: SessionAssignment[];
  };
  encadrants: {
    available: AvailabilityDetail[];    // Avec détail des créneaux (1ère/2ème heure)
    unavailable: SessionAssignment[];
    notIndicated: SessionAssignment[];
  };
  gonflage: {
    available: AvailabilityDetail[];    // Avec détail des créneaux (19h45/20h15/21h30)
    unavailable: SessionAssignment[];
    notIndicated: SessionAssignment[];
  };
  theorie: {
    available: AvailabilityDetail[];    // Avec détail des créneaux (19h30/21h45)
    unavailable: SessionAssignment[];
    notIndicated: SessionAssignment[];
  };
}

/**
 * Résumé des disponibilités pour un mois
 */
export interface AvailabilitySummary {
  year: number;
  month: number;
  tuesdays: Date[];
  availabilitiesByDate: AvailabilityByDate[];
}

/**
 * Filtre pour les disponibilités
 */
export interface AvailabilityFilter {
  year: number;
  month: number;
  role?: 'accueil' | 'encadrant' | 'gonflage' | 'theorie' | 'all';
}
