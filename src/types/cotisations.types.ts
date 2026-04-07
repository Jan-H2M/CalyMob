/**
 * Cotisations (Membership Tariffs) Types
 * Used for yearly membership fee management
 * 
 * Each "season" represents a pricing period (e.g., "Sept 2025")
 * with embedded tariffs for different member categories.
 * Two pricing columns per tariff: Jan→Déc and Sept→Déc+1
 */

export interface MembershipTariff {
  id: string;                      // Unique ID (e.g., "tar_1")
  label: string;                   // Display name: "Membre en 1ère appartenance"
  code: string;                    // Technical code: "membre_1ere" (unique within season)
  price_jan_dec: number | null;    // Price for Jan→Dec period (null = not available)
  price_sept_dec: number | null;   // Price for Sept→Dec+1 period (null = not available)
  footnote_ref?: string;           // Reference to footnote: "*1", "*2", etc.
  display_order: number;           // Sort order (0, 1, 2...)
}

export interface MembershipFootnote {
  ref: string;                     // "*1", "*2", etc.
  text: string;                    // Full explanation text
}

export interface MembershipSeason {
  id: string;
  label: string;                   // "Sept 2025", "2026", etc.
  start_year: number;              // 2025
  is_active: boolean;              // Only one active per club
  tariffs: MembershipTariff[];     // Embedded tariff array
  footnotes: MembershipFootnote[]; // Embedded footnotes array
  created_at: Date;
  updated_at: Date;
  created_by: string;              // User ID who created
}

/**
 * Membership period type for member records
 */
export type MembershipPeriod = 'jan_dec' | 'sept_dec';

/**
 * Membership period labels for display
 */
export const MEMBERSHIP_PERIOD_LABELS: Record<MembershipPeriod, string> = {
  jan_dec: 'Jan → Déc',
  sept_dec: 'Sept → Déc+1',
};
