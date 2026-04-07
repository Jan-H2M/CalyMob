/**
 * Tariff & Dive Location Types
 * Used for event pricing configuration
 */

/**
 * @deprecated TariffCategory is now dynamic and loaded from value lists.
 * Use string type instead and reference the "fonction" value list.
 * Legacy values: 'membre' | 'non_membre' | 'encadrant' | 'junior' | 'etudiant' | 'decouverte'
 */
export type TariffCategory = string;

export interface Tariff {
  id: string;                    // Unique ID
  label: string;                 // Display name: "Plongeur", "Apnéiste"
  category: string;              // Tariff category (references value list item.value from "fonction" list)
  price: number;                 // Price in euros
  is_default: boolean;           // Pre-select in UI?
  display_order: number;         // Custom sort order
}

export interface DiveLocation {
  id: string;
  name: string;                  // "Grevelingen", "Oosterschelde"
  description?: string;          // Optional description
  country: string;               // "BE", "NL", "FR", etc.
  address?: string;              // Full address for Google Maps integration
  phone?: string;                // Contact phone number
  email?: string;                // Contact email
  website?: string;              // Website URL
  notes?: string;                // Additional notes/comments
  tariffs: Tariff[];             // Tariffs for this location
  created_at: Date;
  updated_at: Date;
  created_by: string;            // User ID who created
}

// Country options for select dropdown
export const COUNTRY_OPTIONS = [
  { value: 'BE', label: 'Belgique' },
  { value: 'NL', label: 'Pays-Bas' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Allemagne' },
  { value: 'IT', label: 'Italie' },
  { value: 'ES', label: 'Espagne' },
  { value: 'PT', label: 'Portugal' },
  { value: 'GR', label: 'Grèce' },
  { value: 'HR', label: 'Croatie' },
  { value: 'EG', label: 'Égypte' }
] as const;

/**
 * @deprecated Category labels are now dynamically loaded from value lists.
 * Use getValueListItem() or getValueList() to retrieve labels.
 * This constant is kept for backwards compatibility only.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  membre: 'Membre',
  non_membre: 'Non-membre',
  encadrant: 'Encadrant',
  junior: 'Junior (<18)',
  etudiant: 'Étudiant',
  decouverte: 'Découverte',
  ca: 'Comité d\'Administration',
  accueil: 'Accueil'
};
