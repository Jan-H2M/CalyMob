// Types pour le module Inventaire et Prêt de Matériel
// CalyCompta - Calypso Diving Club

import { Timestamp } from 'firebase/firestore';

// ========== CONFIGURATION ==========

/**
 * Type de matériel (détendeur, gilet, combinaison, etc.)
 */
export interface ItemType {
  id: string;
  code: string; // 'DETENDEUR', 'GILET', 'COMBINAISON'
  nom: string;
  customFields: CustomField[]; // champs personnalisés (taille, pression, etc.)
  accountCode?: string; // code comptable PCMN (ex: 241-00-001)
  lifespan?: number; // durée de vie en années (pour amortissement)
  depreciationRate?: number; // taux d'amortissement % par an
  checklistId?: string; // checklist par défaut pour ce type
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Champ personnalisé pour un type de matériel
 */
export interface CustomField {
  name: string;
  type: 'text' | 'number' | 'select' | 'multiselect';
  options?: string[]; // pour select/multiselect
  required: boolean;
}

/**
 * Checklist de vérification (retour, maintenance, etc.)
 */
export interface Checklist {
  id: string;
  nom: string;
  items: ChecklistItem[];
  appliesTo: string[]; // itemTypeIds auxquels cette checklist s'applique
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Item d'une checklist
 */
export interface ChecklistItem {
  id: string;
  text: string;
  order: number;
}

/**
 * Règles de caution (montants, remboursement, etc.)
 */
export interface CautionRule {
  id: string;
  nom: string;
  description: string;
  montant: number;
  pourcentage_remboursement: {
    excellent: number; // 100%
    bon: number; // 100%
    correct: number; // 80%
    mauvais: number; // 50%
    perte: number; // 0%
  };
  mode_validation: 'manuel' | 'auto';
  delai_remboursement: 'immediat' | 'fin_semaine' | 'fin_mois';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Emplacement physique du matériel
 */
export interface Location {
  id: string;
  code: string;
  nom: string;
  type: 'club' | 'member' | 'external';
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Configuration des alertes automatiques
 */
export interface AlertSettings {
  loanReturnReminder: {
    enabled: boolean;
    daysBefore: number; // 7
  };
  loanOverdue: {
    enabled: boolean;
  };
  maintenanceDue: {
    enabled: boolean;
    daysBefore: number; // 30
  };
  maintenanceOverdue: {
    enabled: boolean;
  };
  stockLow: {
    enabled: boolean;
  };
  recipients: {
    responsableMateriel?: string; // email
    responsableBoutique?: string; // email
    tresorier?: string; // email
  };
}

/**
 * Template d'email automatique
 */
export interface EmailTemplate {
  id: string;
  type: 'loan_confirmation' | 'loan_reminder' | 'loan_overdue' | 'refund_confirmation' | 'maintenance_alert';
  subject: string;
  body: string; // avec variables {MEMBRE_NOM}, {MATERIEL_LISTE}, etc.
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ========== MEMBRES ==========

/**
 * Membre du club (unifié avec User - accès CalyCompta)
 * DEPRECATED: Utiliser Membre (importé depuis index.ts)
 *
 * Ce type existe uniquement pour compatibilité backward.
 * Tous les membres sont maintenant dans /clubs/{clubId}/members
 * avec structure unifiée (voir Membre dans index.ts)
 */
export type Member = import('./index').Membre;

/**
 * Résultat d'un import XLS de membres
 */
export interface ImportResult {
  success: boolean;
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// ========== MATÉRIEL UNITAIRE ==========

/**
 * Article de matériel unitaire (détendeur, gilet, etc.)
 */
export interface InventoryItem {
  id: string;
  code: string; // REG-001, BC-015, etc.
  nom: string;
  fabricant?: string;
  modele?: string;
  numero_serie?: string;
  typeId: string; // référence vers ItemType
  valeur_achat: number;
  date_achat: Timestamp;
  valeur_actuelle: number; // calculée automatiquement (amortissement)
  locationId: string; // référence vers Location
  etat: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';
  statut: 'disponible' | 'prete' | 'en_maintenance';
  photo_url?: string;
  documents_urls?: string[];
  customFieldsValues?: Record<string, any>; // valeurs des champs personnalisés
  prochaine_revision?: Timestamp;
  historique_maintenance?: MaintenanceRecord[];
  fiscal_year_id?: string; // année fiscale d'achat (pour amortissement comptable)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Enregistrement de maintenance/réparation
 */
export interface MaintenanceRecord {
  date: Timestamp;
  type: 'revision' | 'reparation';
  description: string;
  cout?: number;
  prestataireId?: string;
  transactionId?: string; // lien avec transaction bancaire
}

/**
 * Statistiques du matériel
 */
export interface ItemStats {
  totalValue: number; // valeur totale du matériel
  byType: { typeId: string; count: number; value: number }[];
  byStatus: { status: string; count: number }[];
  byLocation: { locationId: string; count: number }[];
  maintenanceDue: number; // nombre d'articles avec révision due
}

// ========== PRÊTS ==========

/**
 * Prêt de matériel à un membre
 */
export interface Loan {
  id: string;
  memberId: string;
  memberName: string; // dénormalisé pour affichage
  itemIds: string[]; // liste des articles prêtés
  date_debut: Timestamp;
  date_fin_prevue: Timestamp;
  date_fin_reelle?: Timestamp;
  caution_montant: number;
  caution_payee: boolean;
  caution_transaction_id?: string; // lien avec transaction bancaire
  caution_remboursee: boolean;
  caution_montant_rembourse?: number;
  statut: 'en_cours' | 'termine' | 'en_retard';
  document_decharge_url?: string; // PDF signé
  signature_base64?: string;
  checklist_retour?: ChecklistResult[];
  comments?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Résultat de checklist de vérification au retour
 */
export interface ChecklistResult {
  itemId: string;
  checklistId: string;
  results: { itemId: string; checked: boolean }[];
  etatFinal: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'perte';
}

/**
 * Statistiques des prêts
 */
export interface LoanStats {
  total: number;
  enCours: number;
  enRetard: number;
  valeurTotaleEnCours: number;
  cautionsEnCours: number;
}

// ========== PRODUITS EN STOCK ==========

/**
 * Produit consommable en stock (carnets, autocollants, t-shirts, cours Lifras, etc.)
 */
export interface StockProduct {
  id: string;
  reference: string; // CARNET-PLONGEE, COURS-LIFRAS, etc.
  nom: string;
  description?: string;
  stock_actuel: number;
  stock_minimum: number; // seuil d'alerte
  prix_achat: number;
  prix_vente_membre: number;
  prix_vente_non_membre: number;
  locationId?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Vente de produit à un membre
 */
export interface Sale {
  id: string;
  memberId: string;
  memberName: string; // dénormalisé
  productId: string;
  productName: string; // dénormalisé
  quantite: number;
  prix_unitaire: number;
  montant_total: number;
  mode_paiement: 'virement' | 'especes';
  transaction_id?: string; // lien avec transaction bancaire
  date_vente: Timestamp;
  fiscal_year_id: string; // année fiscale de la vente (OBLIGATOIRE - revenu comptable)
  createdAt: Timestamp;
  createdBy: string;
}

/**
 * Commande de réapprovisionnement auprès d'un fournisseur
 */
export interface Order {
  id: string;
  productId: string;
  productName: string; // dénormalisé
  fournisseur: string;
  quantite: number;
  prix_achat_unitaire: number;
  montant_total: number;
  date_commande: Timestamp;
  date_reception?: Timestamp;
  statut: 'en_attente' | 'recue';
  transaction_id?: string; // lien avec transaction bancaire
  fiscal_year_id: string; // année fiscale de la commande (OBLIGATOIRE - charge comptable)
  createdAt: Timestamp;
  createdBy: string;
}

/**
 * Statistiques des produits en stock
 */
export interface StockStats {
  totalValue: number; // valeur totale du stock (quantité × prix achat)
  byProduct: { productId: string; quantity: number; value: number }[];
  lowStockCount: number; // nombre de produits sous seuil minimum
}

/**
 * Statistiques des ventes
 */
export interface SalesStats {
  totalRevenue: number; // revenus totaux
  byProduct: { productId: string; quantity: number; revenue: number }[];
  byMonth: { month: string; revenue: number }[];
  topProducts: { productId: string; quantity: number }[]; // Top 5
  topMembers: { memberId: string; totalSpent: number }[]; // Top 5
}
