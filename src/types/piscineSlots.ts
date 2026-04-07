/**
 * Constantes pour les créneaux horaires du planning piscine
 * Utilisées pour le gonflage, les disponibilités encadrants, et la théorie
 */

// --- Types de session ---
export const SESSION_TYPES = ['piscine', 'theorie'] as const;
export type SessionType = typeof SESSION_TYPES[number];

// --- Créneaux gonflage ---
export const GONFLAGE_SLOTS = ['19h45', '20h15', '21h30'] as const;
export type GonflageSlot = typeof GONFLAGE_SLOTS[number];

export const GONFLAGE_SLOT_LABELS: Record<GonflageSlot, string> = {
  '19h45': '19h45',
  '20h15': '20h15',
  '21h30': '21h30',
};

// --- Créneaux disponibilité encadrants ---
export const ENCADRANT_SLOTS = ['1ere_heure', '2eme_heure'] as const;
export type EncadrantSlot = typeof ENCADRANT_SLOTS[number];

export const ENCADRANT_SLOT_LABELS: Record<EncadrantSlot, string> = {
  '1ere_heure': '20h15',
  '2eme_heure': '21h15',
};

/** Niveaux qui ne font que le 1er créneau (20h15-21h15) */
export const LEVELS_FIRST_HOUR_ONLY = ['1*'] as const;
/** Niveaux qui ne font que le 2e créneau (21h15-22h30) */
export const LEVELS_SECOND_HOUR_ONLY = ['2*', '3*', '4*', 'AM', 'MC'] as const;

// --- Créneaux théorie ---
export const THEORIE_SLOTS = ['19h30', '21h45'] as const;
export type TheorieSlot = typeof THEORIE_SLOTS[number];

export const THEORIE_SLOT_LABELS: Record<TheorieSlot, string> = {
  '19h30': 'Théorie 19h30',
  '21h45': 'Théorie 21h45',
};

// --- Créneaux accueil ---
export const ACCUEIL_SLOTS = ['20h00'] as const;
export type AccueilSlot = typeof ACCUEIL_SLOTS[number];

export const ACCUEIL_SLOT_LABELS: Record<AccueilSlot, string> = {
  '20h00': '20h00',
};

// --- Créneaux disponibilité gonflage (identiques aux créneaux d'assignation) ---
export const GONFLAGE_AVAILABILITY_SLOTS = GONFLAGE_SLOTS;

// --- Utilitaires ---

/**
 * Obtenir le label d'affichage pour un créneau de disponibilité selon le rôle
 */
export function getSlotLabel(role: string, slot: string): string {
  if (role === 'accueil' && slot in ACCUEIL_SLOT_LABELS) {
    return ACCUEIL_SLOT_LABELS[slot as AccueilSlot];
  }
  if (role === 'gonflage' && slot in GONFLAGE_SLOT_LABELS) {
    return GONFLAGE_SLOT_LABELS[slot as GonflageSlot];
  }
  if (role === 'encadrant' && slot in ENCADRANT_SLOT_LABELS) {
    return ENCADRANT_SLOT_LABELS[slot as EncadrantSlot];
  }
  if (role === 'theorie' && slot in THEORIE_SLOT_LABELS) {
    return THEORIE_SLOT_LABELS[slot as TheorieSlot];
  }
  return slot;
}

/**
 * Obtenir tous les créneaux disponibles pour un rôle donné
 */
export function getSlotsForRole(role: string): readonly string[] {
  switch (role) {
    case 'accueil':
      return ACCUEIL_SLOTS;
    case 'gonflage':
      return GONFLAGE_SLOTS;
    case 'encadrant':
      return ENCADRANT_SLOTS;
    case 'theorie':
      return THEORIE_SLOTS;
    default:
      return [];
  }
}

/**
 * Vérifier si un rôle supporte les créneaux horaires
 */
export function roleHasSlots(role: string): boolean {
  return role === 'accueil' || role === 'gonflage' || role === 'encadrant' || role === 'theorie';
}
