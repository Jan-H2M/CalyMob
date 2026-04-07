/**
 * Types voor Boutique Stockbeheer
 *
 * Dit systeem beheert:
 * - Boutique: club merchandise, accessoires
 * - Boutique LIFRAS: LIFRAS materiaal voor doorverkoop
 *
 * De waarde van de stock wordt automatisch berekend
 * en gebruikt voor Bilan codes 02.01.01 en 02.01.02
 */

export type BoutiqueType = 'boutique' | 'boutique_lifras';

export interface BoutiqueItem {
  id: string;
  type: BoutiqueType;
  nom: string;
  description?: string;
  quantite: number;
  prix_achat: number;       // Aankoopprijs per stuk (kostprijs)
  prix_vente?: number;      // Verkoopprijs per stuk (optioneel)
  date_achat: Date;
  fournisseur?: string;
  reference?: string;       // Artikelnummer of referentie
  photo_url?: string;
  actif: boolean;           // false = niet meer in verkoop maar nog in stock
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;       // userId van wie item aanmaakte
}

export interface BoutiqueStockSummary {
  type: BoutiqueType;
  totalItems: number;       // Aantal verschillende producten
  totalQuantite: number;    // Totaal aantal stuks in stock
  totalValue: number;       // Σ(quantite × prix_achat) = stockwaarde
  totalSaleValue?: number;  // Σ(quantite × prix_vente) = potentiële verkoopwaarde
}

export interface BoutiqueStockChange {
  id: string;
  itemId: string;
  type: 'entree' | 'sortie' | 'correction' | 'vente';
  quantite: number;         // Positief voor entree, negatief voor sortie/vente
  date: Date;
  raison?: string;
  prix_unitaire?: number;   // Voor ventes: verkoopprijs
  createdBy?: string;
  createdAt: Date;
}

/**
 * Form data voor het aanmaken/bewerken van een BoutiqueItem
 */
export interface BoutiqueItemFormData {
  type: BoutiqueType;
  nom: string;
  description?: string;
  quantite: number;
  prix_achat: number;
  prix_vente?: number;
  date_achat: Date;
  fournisseur?: string;
  reference?: string;
  photo_url?: string;
  actif: boolean;
}

/**
 * Snapshot van boutique stock op jaareinde
 * Gebruikt voor Bilan afsluiting (codes 02.01.01 en 02.01.02)
 *
 * Collection: clubs/{clubId}/boutique_snapshots/{snapshotId}
 */
export interface BoutiqueSnapshot {
  id: string;
  year: number;                       // Boekjaar (zoals InventoryAudit)
  type: BoutiqueType;                 // 'boutique' | 'boutique_lifras'
  nom: string;                        // "Boutique Club 2025"
  snapshot_date: Date;                // Datum van snapshot

  // Samenvatting
  total_items: number;                // Aantal verschillende producten
  total_quantite: number;             // Totaal aantal stuks
  total_value: number;                // Σ(quantite × prix_achat)

  // Status (zelfde patroon als InventoryAudit)
  statut: 'en_cours' | 'verrouille';
  date_verrouillage?: Date;

  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * Item in een boutique snapshot
 * Sub-collection: clubs/{clubId}/boutique_snapshots/{snapshotId}/items/{itemId}
 */
export interface BoutiqueSnapshotItem {
  id: string;
  snapshotId: string;
  itemId: string;                     // Reference naar origineel boutique_stock item
  nom: string;
  type: BoutiqueType;
  quantite: number;
  prix_achat: number;
  value: number;                      // quantite × prix_achat
  createdAt: Date;
}
