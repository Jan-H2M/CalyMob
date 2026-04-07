/**
 * Supplement - Option supplémentaire pour les événements
 * Ex: Location de combinaison, location de palmes, etc.
 */
export interface Supplement {
  id: string;           // UUID généré
  name: string;         // "Location combinaison", "Location palmes"
  price: number;        // Prix en euros
  display_order: number;// Ordre d'affichage
}

/**
 * Selected supplement stored in inscription
 * Snapshot of the supplement at registration time
 */
export interface SelectedSupplement {
  id: string;
  name: string;
  price: number;
}
