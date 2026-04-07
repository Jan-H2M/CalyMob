// Types pour le module Inventaire et Prêt de Matériel
// CalyCompta - Calypso Diving Club

import { Timestamp } from 'firebase/firestore';

// ========== CONFIGURATION ==========

// ========== AMORTISSEMENT / DEPRECIATION ==========

/**
 * Méthode d'amortissement
 * - linear: Linéaire (répartition égale sur la durée de vie)
 * - degressive: Dégressif (accéléré les premières années, règles belges max 40%)
 * - manual: Manuel/Libre (montant saisi par l'utilisateur chaque année)
 */
export type DepreciationMethod = 'linear' | 'degressive' | 'manual';

/**
 * Configuration d'amortissement par défaut pour un type de matériel
 */
export interface DepreciationSettings {
  method: DepreciationMethod;
  lifespan: number;              // Durée de vie en années (ex: 10)
  depreciationRate?: number;     // Taux personnalisé pour dégressif (%, max 40% règle belge)
  residualValue?: number;        // Valeur résiduelle à la fin (défaut: 0)
  useCustomStartDate?: boolean;  // Permettre date début différente de date achat
}

/**
 * Override des paramètres d'amortissement pour un article spécifique
 * Tous les champs sont optionnels - utilisés pour surcharger les defaults du type
 */
export interface ItemDepreciationOverride {
  method?: DepreciationMethod;
  lifespan?: number;
  depreciationRate?: number;
  residualValue?: number;
  startDate?: Timestamp;         // Date début amortissement (peut différer de date_achat)
}

/**
 * Entrée d'amortissement manuel pour une année fiscale
 * Utilisé uniquement avec method='manual'
 */
export interface ManualDepreciationEntry {
  fiscalYearId: string;          // ID de l'année fiscale (ex: "FY2024")
  fiscalYear: number;            // Année (ex: 2024)
  amount: number;                // Montant de l'amortissement
  justification?: string;        // Notes/toelichting justifiant le montant
  createdAt: Timestamp;
  createdBy: string;
  isLocked?: boolean;            // Verrouillé après clôture exercice
}

/**
 * Paramètres de calcul d'amortissement (utilisé par le service)
 */
export interface DepreciationCalculationParams {
  purchaseValue: number;
  purchaseDate: Date;
  startDate?: Date;              // Si différent de purchaseDate
  method: DepreciationMethod;
  lifespan: number;
  depreciationRate?: number;     // Pour dégressif (défaut: 2x linéaire, max 40%)
  residualValue?: number;        // Défaut: 0
  manualEntries?: ManualDepreciationEntry[];
}

/**
 * Type de matériel (détendeur, gilet, combinaison, etc.)
 */
export interface ItemType {
  id: string;
  code?: string; // 'DETENDEUR', 'GILET', 'COMBINAISON'
  code_prefix: string; // Prefix pour code generation (REG, GILET, etc.)
  nom: string;
  description?: string;
  custom_fields: CustomField[]; // champs personnalisés (taille, pression, etc.)
  customFields?: CustomField[]; // legacy
  accountCode?: string; // code comptable PCMN (ex: 241-00-001)

  // Paramètres d'amortissement (nouveau système)
  depreciation?: DepreciationSettings;

  // Legacy fields - gardés pour compatibilité
  lifespan?: number; // DEPRECATED: utiliser depreciation.lifespan
  depreciationRate?: number; // DEPRECATED: utiliser depreciation.depreciationRate

  checklistId?: string; // checklist par défaut pour ce type
  actif: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Champ personnalisé pour un type de matériel
 */
export interface CustomField {
  id: string;
  nom: string;
  name?: string; // legacy
  type: 'text' | 'number' | 'select' | 'multiselect' | 'date';
  options?: string[]; // pour select/multiselect
  obligatoire: boolean;
  required?: boolean; // legacy
}

/**
 * Checklist de vérification (retour, maintenance, etc.)
 */
export interface Checklist {
  id: string;
  nom: string;
  description?: string;
  items: ChecklistItem[];
  appliesTo?: string[]; // legacy
  type_materiel_ids: string[]; // itemTypeIds auxquels cette checklist s'applique
  actif: boolean;
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
  retour_rappel_jours?: number;
  revision_rappel_jours?: number;
}

/**
 * Template d'email automatique
 */
export interface EmailTemplate {
  id: string;
  type: 'loan_confirmation' | 'loan_reminder' | 'loan_overdue' | 'refund_confirmation' | 'maintenance_alert' | 'return_reminder' | 'return_overdue' | 'return_confirmation' | 'maintenance_reminder' | 'stock_alert';
  nom?: string;
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
  deactivated: number;
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
  etat: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';
  statut: 'disponible' | 'prete' | 'en_maintenance';
  photo_url?: string;
  documents_urls?: string[];
  customFieldsValues?: Record<string, any>; // valeurs des champs personnalisés
  prochaine_revision?: Timestamp;
  historique_maintenance?: MaintenanceRecord[];
  fiscal_year_id?: string; // année fiscale d'achat (pour amortissement comptable)

  // Amortissement - Override des paramètres du type (optionnel)
  depreciation_override?: ItemDepreciationOverride;

  // Amortissement manuel - entrées par année (uniquement si method='manual')
  manual_depreciation_entries?: ManualDepreciationEntry[];

  // Verrouillage de l'amortissement
  depreciation_locked?: boolean;       // Verrouillage complet de l'article
  depreciation_locked_years?: string[]; // IDs des années fiscales verrouillées

  // Lieu d'utilisation (Carrière = sorties, Piscine = entraînement)
  lieu_utilisation?: 'carriere' | 'piscine' | 'les_deux';

  // Déclassement/Mise au rebut
  date_declassement?: Timestamp;       // Date de mise hors service
  motif_declassement?: string;         // Raison: "Usé", "Fuite irréparable", etc.

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

// ========== INVENTAIRE AUDIT (Contrôle annuel) ==========

/**
 * Audit d'inventaire annuel
 * Permet de faire le contrôle physique du matériel une fois par an
 */
export interface InventoryAudit {
  id: string;
  year: number;                              // 2024, 2025, etc.
  nom: string;                               // "Inventaire 2024"
  statut: 'en_cours' | 'verrouille' | 'fermee';  // 'fermee' is legacy, treated as 'en_cours'
  date_debut: Timestamp;
  date_fin?: Timestamp;
  date_verrouillage?: Timestamp;             // Quand l'audit a été verrouillé

  // Statistiques (calculées)
  total_items: number;
  items_controles: number;
  items_manquants: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Item individuel dans un audit d'inventaire
 * Créé pour chaque InventoryItem au démarrage de l'audit
 */
export interface InventoryAuditItem {
  id: string;
  auditId: string;
  itemId: string;                            // Référence vers InventoryItem

  // Snapshot de l'état au début de l'audit
  code: string;
  typeId: string;
  typeName?: string;                         // Dénormalisé pour affichage
  etat_initial: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';

  // Résultat du contrôle
  retrouve: boolean;                         // Checkbox: matériel retrouvé?
  etat_final?: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';
  notes?: string;

  // Méta
  date_controle?: Timestamp;
  controle_par?: string;                     // User ID

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ========== INVENTORY VALUE SNAPSHOTS (Year-end accounting) ==========

/**
 * Snapshot van equipment waarde op jaareinde
 * Gebruikt voor Bilan code 01.01 (Stock matériel)
 *
 * Analoog aan BoutiqueSnapshot voor shop inventory
 *
 * Collection: clubs/{clubId}/inventory_value_snapshots/{snapshotId}
 */
export interface InventoryValueSnapshot {
  id: string;
  year: number;                              // Boekjaar (2024, 2025, etc.)
  nom: string;                               // "Clôture matériel 2025"
  snapshot_date: Timestamp;                  // Datum van snapshot

  // Financiële samenvatting (frozen waarden)
  total_items: number;                       // Aantal materiaal items
  total_purchase_value: number;              // Σ valeur_achat
  total_current_value: number;               // Σ (valeur_achat - depreciation) = Bilan waarde
  total_accumulated_depreciation: number;    // Σ amortissements

  // Status (zelfde patroon als BoutiqueSnapshot)
  statut: 'en_cours' | 'verrouille';
  date_verrouillage?: Timestamp;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Item in een inventory value snapshot
 * Bevat de frozen waarde van elk materiaal item op snapshot moment
 *
 * Sub-collection: clubs/{clubId}/inventory_value_snapshots/{snapshotId}/items/{itemId}
 */
export interface InventoryValueSnapshotItem {
  id: string;
  snapshotId: string;
  itemId: string;                            // Reference naar origineel inventory_items item

  // Identificatie (snapshot van item data)
  code: string;
  nom: string;
  typeId: string;
  typeName?: string;

  // Financiële waarden (frozen op snapshot moment)
  valeur_achat: number;                      // Oorspronkelijke aankoopwaarde
  accumulated_depreciation: number;          // Gecumuleerde afschrijving
  current_value: number;                     // valeur_achat - accumulated_depreciation

  // Extra info
  etat?: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';
  statut?: 'disponible' | 'prete' | 'en_maintenance';

  createdAt: Timestamp;
}
