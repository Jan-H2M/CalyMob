/**
 * Value List Types
 *
 * Type definitions voor het dynamische waardenlijst systeem.
 * Vervangt hardcoded dropdowns door configureerbare lijsten in Firestore.
 */

/**
 * Enkel item in een waardelijst
 */
export interface ValueListItem {
  /** Technische waarde (voor opslag in database) */
  value: string;

  /** Volledige display naam */
  label: string;

  /** Verkorting voor badges/flags (bijv. "CA", "E", "TRES") */
  shortCode: string;

  /** Hex color voor badge achtergrond (optioneel) */
  color?: string;

  /** Lucide icon naam (optioneel, bijv. "Shield", "User") */
  icon?: string;

  /** Sorteer volgorde (lager = eerder in lijst) */
  order: number;

  /** Favoriet markering (favoriten tonen bovenaan) */
  isFavorite: boolean;

  /** Actief/inactief (inactieve items worden niet getoond) */
  active: boolean;
}

/**
 * Volledige waardelijst
 */
export interface ValueList {
  /** Unieke identifier (bijv. "club_statuten", "user_roles") */
  id: string;

  /** Display naam (bijv. "Club Statuten", "Rôles Utilisateurs") */
  name: string;

  /** Optionele beschrijving */
  description?: string;

  /** Type lijst:
   * - "system": Read-only, beheerd door systeem
   * - "club": Editable door club admins
   */
  type: 'system' | 'club';

  /** Categorie voor groepering in UI */
  category: ValueListCategory;

  /** Items in deze lijst */
  items: ValueListItem[];

  /** Aanmaak timestamp */
  createdAt: Date;

  /** Laatste wijziging timestamp */
  updatedAt: Date;

  /** User ID van aanmaker */
  createdBy: string;
}

/**
 * Categorieën voor waardelijsten
 */
export type ValueListCategory = 'users' | 'operations' | 'finance' | 'settings';

/**
 * Type lijst (system of club)
 */
export type ValueListType = 'system' | 'club';

/**
 * Data transfer object voor het maken van een nieuwe waardelijst
 */
export interface CreateValueListDTO {
  name: string;
  description?: string;
  type: ValueListType;
  category: ValueListCategory;
  items?: ValueListItem[];
}

/**
 * Data transfer object voor het updaten van een waardelijst
 */
export interface UpdateValueListDTO {
  name?: string;
  description?: string;
  category?: ValueListCategory;
  items?: ValueListItem[];
}

/**
 * Data transfer object voor het maken van een nieuw item
 */
export interface CreateValueListItemDTO {
  value: string;
  label: string;
  shortCode: string;
  color?: string;
  icon?: string;
  isFavorite?: boolean;
  active?: boolean;
}

/**
 * Data transfer object voor het updaten van een item
 */
export interface UpdateValueListItemDTO {
  label?: string;
  shortCode?: string;
  color?: string;
  icon?: string;
  order?: number;
  isFavorite?: boolean;
  active?: boolean;
}

/**
 * Categorie labels voor UI
 */
export const CATEGORY_LABELS: Record<ValueListCategory, string> = {
  users: 'Utilisateurs',
  operations: 'Opérations',
  finance: 'Finance',
  settings: 'Paramètres'
};

/**
 * Type labels voor UI
 */
export const TYPE_LABELS: Record<ValueListType, string> = {
  system: 'Système',
  club: 'Club'
};

/**
 * Categorie kleuren voor badges
 */
export const CATEGORY_COLORS: Record<ValueListCategory, string> = {
  users: 'blue',
  operations: 'green',
  finance: 'amber',
  settings: 'gray'
};

/**
 * Type kleuren voor badges
 */
export const TYPE_COLORS: Record<ValueListType, string> = {
  system: 'gray',
  club: 'blue'
};
