/**
 * Tariff & Dive Location Types
 * Used for event pricing configuration
 */

export type TariffCategory =
  | 'membre'         // Regular member
  | 'non_membre'     // Non-member
  | 'encadrant'      // Instructor/supervisor (links to User.isEncadrant)
  | 'junior'         // Under 18
  | 'etudiant'       // Student
  | 'decouverte';    // Discovery/trial dive

export interface Tariff {
  id: string;                    // Unique ID
  label: string;                 // Display name: "Plongeur", "Apnéiste"
  category: TariffCategory;      // Tariff category
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

// Category labels for UI
export const CATEGORY_LABELS: Record<TariffCategory, string> = {
  membre: 'Membre',
  non_membre: 'Non-membre',
  encadrant: 'Encadrant',
  junior: 'Junior (<18)',
  etudiant: 'Étudiant',
  decouverte: 'Découverte'
};
