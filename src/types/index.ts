// Types pour l'application CalyCompta

export type Role = 'membre' | 'organisateur' | 'validateur' | 'admin';

// Export user types
export * from './user.types';
import { Permission, UserRole, UserStatus } from './user.types';

/**
 * Membre unifié - Combine utilisateurs CalyCompta ET membres club
 * Collection: /clubs/{clubId}/members/{memberId}
 *
 * Tous les membres du club sont dans cette collection.
 * Champs de différenciation:
 * - has_app_access: Peut se connecter à CalyCompta
 * - app_role: Rôle dans l'application (si accès app)
 * - member_status: Statut en tant que membre club
 * - is_diver: Est plongeur actif (filtre rapide)
 * - has_lifras: A une licence LIFRAS (filtre rapide)
 */
export interface Membre {
  // ========== IDENTIFICATION ==========
  id: string;                          // Firebase Auth UID (si accès app) ou UUID

  // Identifiants fédéraux (pour plongeurs)
  lifras_id?: string;                  // LifrasID (clé unique LIFRAS)
  nr_febras?: string;                  // Numéro FEBRAS

  // ========== IDENTITÉ ==========
  nom: string;                         // Nom de famille (OBLIGATOIRE)
  prenom: string;                      // Prénom (OBLIGATOIRE)
  email: string;                       // Email (OBLIGATOIRE - unique)
  displayName?: string;                // Nom d'affichage (calculé: "Prénom Nom" si absent)
  date_naissance?: Date;               // Date de naissance

  // ========== CONTACT ==========
  telephone?: string;                  // GSM principal (renommé de gsm pour cohérence)
  phoneNumber?: string;                // Alias de telephone (backward compatibility)
  gsm?: string;                        // DEPRECATED - Utiliser telephone
  adresse?: string;                    // Adresse complète
  code_postal?: string;                // Code postal
  localite?: string;                   // Localité
  pays?: string;                       // Pays (défaut: "Belgique")
  ice?: string;                        // Contact urgence (In Case of Emergency)
  photoURL?: string;                   // Photo de profil

  // ========== MÉDICAL (PLONGEURS) ==========
  certificat_medical_date?: Date;
  certificat_medical_validite?: Date;

  // ========== PLONGÉE ==========
  niveau_plongee?: string;             // Niveau plongeur (P1, P2, P3, etc.)
  niveau_plongeur?: string;            // DEPRECATED - Utiliser niveau_plongee
  date_adhesion?: Date;                // Date adhésion club
  isDebutant?: boolean;                // Calculé automatiquement (< 1 an ancienneté)
  anciennete?: number;                 // Années depuis adhésion (calculé)

  // ========== ACCÈS APPLICATION ==========
  has_app_access: boolean;             // NOUVEAU - Peut se connecter à CalyCompta
  app_role?: UserRole;                 // NOUVEAU - Rôle si accès app ('superadmin' | 'admin' | 'validateur' | 'user')
  app_status?: UserStatus;             // NOUVEAU - Statut app ('pending' | 'active' | 'inactive' | 'suspended' | 'deleted')
  lastLogin?: Date;                    // Dernière connexion app
  requirePasswordChange?: boolean;     // Force changement mot de passe
  customPermissions?: Permission[];    // Permissions personnalisées

  // ========== STATUT MEMBRE CLUB ==========
  member_status: MemberStatus;         // NOUVEAU - 'active' | 'inactive' | 'archived'
  is_diver: boolean;                   // NOUVEAU - Est plongeur actif (pour filtres)
  has_lifras: boolean;                 // NOUVEAU - A une licence LIFRAS (pour filtres)

  // ========== PERMISSIONS & PRÉFÉRENCES ==========
  can_approve_expenses?: boolean;      // Permission approuver dépenses (legacy)
  newsletter?: boolean;                // Opt-in newsletter
  preferences?: {
    language?: 'fr' | 'nl' | 'en';
    notifications?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  };

  // ========== MÉTADONNÉES ==========
  createdAt: Date;
  updatedAt: Date;
  date_inscription?: Date;             // Date inscription club (alias de date_adhesion)
  metadata?: {
    createdBy?: string;
    activatedBy?: string;
    activatedAt?: Date;
    deactivatedBy?: string;
    deactivatedAt?: Date;
    suspendedBy?: string;
    suspendedAt?: Date;
    suspendedReason?: string;
  };

  // ========== LEGACY FIELDS (backward compatibility) ==========
  // Ces champs sont gardés pour compatibilité mais DEPRECATED
  isActive?: boolean;                  // DEPRECATED - Utiliser member_status === 'active'
  actif?: boolean;                     // DEPRECATED - Utiliser member_status === 'active'
  role?: Role;                         // DEPRECATED - Utiliser app_role
  status?: UserStatus;                 // DEPRECATED - Utiliser app_status
  clubId?: string;                     // DEPRECATED - Implicite via path collection
  created_at?: Date;                   // DEPRECATED - Utiliser createdAt
  updated_at?: Date;                   // DEPRECATED - Utiliser updatedAt
}

// Nouveaux types pour structure unifiée
export type MemberStatus = 'active' | 'inactive' | 'archived';

export interface TransactionBancaire {
  id: string;
  numero_sequence: string;
  date_execution: Date;
  date_valeur: Date;
  montant: number;
  devise: string;
  numero_compte: string;
  type_transaction: string;
  contrepartie_iban: string;
  contrepartie_nom: string;
  communication: string;
  details?: string;
  statut: 'accepte' | 'refuse' | 'en_attente';
  motif_refus?: string;

  // Champs ajoutés pour la gestion
  categorie?: string;
  code_comptable?: string; // Code comptable belge (ex: "730-00-712")

  // Liaison opérations
  operation_id?: string;          // NOUVEAU - Lien vers opération (événement, cotisation, don, etc.)
  membre_lifras_id?: string;      // NOUVEAU - Pour cotisations directes (lien membre par LifrasID)

  // Liaison inventaire
  linked_to_loan_id?: string;             // NOUVEAU - Lien vers prêt matériel (paiement/remboursement caution)
  linked_to_inventory_item_id?: string;   // NOUVEAU - Lien vers achat matériel unitaire
  linked_to_sale_id?: string;             // NOUVEAU - Lien vers vente produit stock
  linked_to_order_id?: string;            // NOUVEAU - Lien vers commande fournisseur (achat stock)

  // Legacy (deprecated)
  evenement_id?: string;          // DEPRECATED - Utiliser operation_id

  reconcilie: boolean;
  statut_reconciliation?: 'non_verifie' | 'pas_trouve' | 'reconcilie'; // Statut de vérification manuel
  hash_dedup: string;
  import_batch_id?: string;

  // Système parent-enfant pour ventilation (remplace is_split/split_count)
  is_parent?: boolean;           // Indique que c'est une transaction mère ventilée (NON UTILISABLE)
  parent_transaction_id?: string; // ID de la transaction mère (pour les enfants)
  child_count?: number;           // Nombre d'enfants (pour la mère)
  child_index?: number;           // Index de cet enfant (1, 2, 3...)

  // Ancien système (déprécié, gardé pour compatibilité migration)
  is_split?: boolean;  // DÉPRÉCIÉ - Utiliser is_parent
  split_count?: number; // DÉPRÉCIÉ - Utiliser child_count

  // Champs de réconciliation avancée
  type?: 'income' | 'expense'; // Type calculé depuis le montant
  expense_claim_id?: string; // Lien vers demande de remboursement
  vp_dive_import_id?: string; // Lien vers import VP Dive
  matched_entities?: MatchedEntity[]; // Entités liées

  // Champ commentaire
  commentaire?: string; // Commentaire libre sur la transaction

  // Documents justificatifs (receipts, invoices, etc.)
  urls_justificatifs?: string[]; // URLs des documents stockés dans Firebase Storage (LEGACY - use documents_justificatifs)
  documents_justificatifs?: DocumentJustificatif[]; // Documents avec métadonnées complètes

  created_at: Date;
  updated_at: Date;
}

export interface MatchedEntity {
  entity_type: 'participant' | 'expense' | 'event' | 'member' | 'demand' | 'inscription'; // 'demand' is legacy, use 'expense' for new code
  entity_id: string;
  entity_name?: string; // Nom pour affichage rapide
  confidence: number; // Score de confiance 0-100
  matched_at: Date;
  matched_by: 'auto' | 'manual';
  notes?: string;
}

export interface TransactionSplit {
  id: string;
  bank_transaction_id: string;  // Référence à la transaction parent
  description: string;           // Description de cette ligne (ex: "Cotisation Jean Dupont")
  amount: number;               // Montant de cette ligne (positif)
  categorie?: string;           // Catégorie pour cette ligne
  code_comptable?: string;      // Code comptable belge pour cette ligne

  // Liaison opérations
  operation_id?: string;        // NOUVEAU - Lien vers opération
  evenement_id?: string;        // DEPRECATED - Utiliser operation_id

  membre_id?: string;           // Lien vers un membre si applicable
  expense_claim_id?: string;    // Lien vers une demande de remboursement
  registration_id?: string;     // Lien vers une inscription événement
  reconcilie?: boolean;         // État de réconciliation pour cette ligne
  notes?: string;              // Notes additionnelles
  created_at: Date;
  created_by: string;
  updated_at: Date;
}

// ============================================================
// Type d'opération (système multi-types remplaçant Evenement)
// ============================================================
export type TypeOperation =
  | 'evenement'      // Plongées, sorties, formations
  | 'cotisation'     // Cotisations annuelles membres
  | 'caution'        // Cautions pour prêt de matériel
  | 'vente'          // Vente matériel
  | 'subvention'     // ADEPS, subsides fédération
  | 'autre';         // Divers

/**
 * Interface Operation - Remplace Evenement avec système multi-types
 * Supporte: événements, cotisations, cautions, ventes, subventions
 */
export interface Operation {
  // Identification
  id: string;
  type: TypeOperation;

  // Source & Synchronization
  source?: 'vpdive' | 'caly';     // 'vpdive' | 'caly' | null (default: caly)
  vpdiveId?: string;              // Original VPdive reference
  isEditable?: boolean;           // Can modify in Caly
  lastSyncedAt?: Date;            // Last VPdive sync
  syncStatus?: 'synced' | 'pending' | 'error';

  // Champs communs (TOUS types)
  titre: string;
  description?: string;
  montant_prevu: number;          // Budget prévisionnel (remplace budget_prevu_revenus)
  statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule';

  // Organisateur/responsable
  organisateur_id: string;
  organisateur_nom?: string;

  // Documents justificatifs (TOUS types)
  documents_justificatifs?: DocumentJustificatif[];

  // Catégorisation comptable (optionnel)
  categorie?: string;           // Catégorie comptable (ex: 'activites_club')
  code_comptable?: string;      // Code comptable belge (ex: '730-00-712')

  // ---- Champs spécifiques ÉVÉNEMENTS (optionnels pour autres types) ----
  date_debut?: Date;              // Date début événement
  date_fin?: Date;                // Date fin événement
  lieu?: string;                  // Lieu événement
  capacite_max?: number;          // Capacité maximale participants
  prix_membre?: number;           // Prix membre
  prix_non_membre?: number;       // Prix non-membre
  vp_dive_source_hash?: string;   // Hash déduplication VP Dive

  // ---- Champs spécifiques COTISATIONS (optionnels pour autres types) ----
  periode_debut?: Date;           // Début période cotisation (ex: 01/01/2025)
  periode_fin?: Date;             // Fin période cotisation (ex: 31/01/2026)
  tarifs?: Record<string, number>; // Tarifs différenciés (ex: {plongeur: 130, apneiste: 80})

  // ---- Champs spécifiques DONS/VENTES/SUBVENTIONS ----
  // (utilisent seulement champs communs + documents)

  // Métadonnées
  created_at: Date;
  updated_at: Date;
}

/**
 * Interface Evenement - DEPRECATED - Utiliser Operation avec type='evenement'
 * Gardée pour compatibilité migration uniquement
 */
export interface Evenement {
  id: string;
  titre: string;
  description?: string;
  date_debut: Date;
  date_fin: Date;
  lieu?: string;
  organisateur_id: string;
  organisateur_nom?: string;
  budget_prevu_revenus: number;
  budget_prevu_depenses: number;
  statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule';
  prix_membre: number;
  prix_non_membre?: number;
  capacite_max?: number;
  vp_dive_source_hash?: string; // Hash pour détecter les doublons d'imports VP Dive
  created_at: Date;
  updated_at: Date;
}

export interface InscriptionEvenement {
  id: string;
  evenement_id: string;
  evenement_titre?: string;
  membre_id: string;
  membre_nom?: string;
  membre_prenom?: string;
  prix: number;
  paye: boolean;
  date_paiement?: Date;
  date_inscription: Date;
  notes?: string;

  // Transaction linking (one-to-one relationship)
  transaction_id?: string;           // ID of linked transaction (bank payment)
  transaction_montant?: number;      // Amount from linked transaction

  // Payment method tracking
  mode_paiement?: 'bank' | 'cash' | 'other' | null;  // How payment was received

  // Comments field for additional information
  commentaire?: string;              // Free text notes (e.g., "Payé sur place en espèces")

  // Legacy field (deprecated - use transaction_id)
  transaction_bancaire_id?: string;  // DEPRECATED - use transaction_id instead

  // Metadata
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Interface ParticipantOperation - Remplace InscriptionEvenement
 * Générique pour tous types d'opérations (événements, cotisations, etc.)
 */
export interface ParticipantOperation {
  // Identification
  id: string;
  operation_id: string;           // Remplace evenement_id
  operation_titre?: string;
  operation_type?: TypeOperation; // Pour filtrage rapide (événement, cotisation, etc.)

  // Membre
  membre_id: string;
  membre_nom?: string;
  membre_prenom?: string;
  lifras_id?: string;             // Pour cotisations et recherche rapide

  // Paiement
  prix: number;
  paye: boolean;
  date_paiement?: Date;
  date_inscription: Date;

  // Transaction liée (one-to-one)
  transaction_id?: string;         // ID transaction bancaire
  transaction_montant?: number;    // Montant transaction liée
  mode_paiement?: 'bank' | 'cash' | 'other' | null;

  // Commentaires
  commentaire?: string;            // Texte libre
  notes?: string;

  // Legacy (deprecated)
  transaction_bancaire_id?: string; // DEPRECATED - use transaction_id

  // Métadonnées
  created_at?: Date;
  updated_at?: Date;
}

// Document justificatif avec métadonnées complètes
export interface DocumentJustificatif {
  url: string;                // URL Firebase Storage
  nom_original: string;       // Nom du fichier lors de l'upload
  nom_affichage: string;      // Nom modifiable par l'utilisateur
  type: string;               // MIME type (application/pdf, image/jpeg, etc.)
  taille: number;             // Taille en bytes
  date_upload: Date;          // Date de téléversement
  uploaded_by?: string;       // ID de l'utilisateur qui a uploadé
  uploaded_by_nom?: string;   // Nom de l'utilisateur
  file_hash?: string;         // Hash SHA-256 du contenu (pour déduplication)
}

export interface DemandeRemboursement {
  id: string;
  club_id: string;  // Required for multi-tenancy

  // Liaison opération
  operation_id?: string;          // NOUVEAU - Lien vers opération (événement, cotisation, etc.)
  evenement_id?: string;          // DEPRECATED - Utiliser operation_id
  evenement_titre?: string;       // DEPRECATED - Utiliser operation_titre
  operation_titre?: string;       // NOUVEAU - Titre opération liée
  demandeur_id: string;
  demandeur_nom?: string;
  demandeur_prenom?: string;
  titre?: string;
  montant: number;
  description: string;
  categorie?: string;
  statut: 'soumis' | 'en_attente_validation' | 'approuve' | 'rembourse' | 'refuse' | 'brouillon';
  pieces_jointes?: string[];  // File names from import
  urls_justificatifs?: string[];  // Firebase Storage URLs (LEGACY - use documents_justificatifs)
  documents_justificatifs?: DocumentJustificatif[];  // Documents avec métadonnées complètes
  date_demande: Date;
  date_depense?: Date;
  date_soumission?: Date;

  // Premier approbateur
  date_approbation?: Date;
  approuve_par?: string;
  approuve_par_nom?: string;

  // Deuxième approbateur (pour montants > seuil)
  date_approbation_2?: Date;
  approuve_par_2?: string;
  approuve_par_2_nom?: string;
  requires_double_approval?: boolean; // Indique si double approbation requise

  date_remboursement?: Date;
  transaction_id?: string;
  motif_refus?: string;
  refuse_par?: string;
  refuse_par_nom?: string;
  date_refus?: Date;

  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface Categorie {
  id: string;
  nom: string;
  label_court?: string; // Nom court pour affichage dans badges (ex: "Cotis", "Sorties")
  type: 'revenu' | 'depense';
  couleur: string;
  icone?: string;
  description?: string;
  compte_comptable?: string; // Pour mapping avec plan comptable belge
  isFrequent?: boolean; // Indique si la catégorie est fréquemment utilisée (favori)
}

export interface AccountCode {
  code: string;  // Ex: "730-00-712"
  label: string; // Ex: "Cotisations des membres plongeurs (V)"
  type: 'revenue' | 'expense' | 'asset' | 'liability';
  category?: string; // Catégorie associée
  isFrequent?: boolean; // Indique si le code est fréquemment utilisé
}

export interface ClubSettings {
  id: string;
  nom: string;
  adresse: string;
  iban: string;
  bic: string;
  numero_entreprise?: string;
  email_contact: string;
  telephone?: string;
  logo_url?: string;
  annee_fiscale_courante: number; // DEPRECATED - Use current_fiscal_year_id
  current_fiscal_year_id?: string; // Reference to active FiscalYear
  categories: Categorie[];

  // Paramètres d'approbation
  approval_threshold?: number; // Montant au-dessus duquel double approbation requise (défaut: 100)
  enable_double_approval?: boolean; // Active/désactive la double approbation (défaut: true)
}

// Année fiscale avec gestion des soldes annuels
export interface FiscalYear {
  id: string;                      // Format: "FY2025" ou UUID
  year: number;                    // Année principale (ex: 2025)
  start_date: Date;                // Date de début complète (jour/mois/année)
  end_date: Date;                  // Date de fin complète (jour/mois/année)
  status: 'open' | 'closed' | 'permanently_closed';

  // Soldes de début d'année (sauvegardés manuellement ou reportés)
  opening_balances: {
    bank_current: number;          // Solde début compte courant
    bank_savings: number;          // Solde début compte épargne
  };

  // Soldes de fin d'année (calculés et sauvegardés à la clôture)
  closing_balances: {
    bank_current: number;          // Solde fin compte courant
    bank_savings: number;          // Solde fin compte épargne
  };

  // Numéros de compte pour filtrage des transactions
  account_numbers?: {
    bank_current?: string;         // IBAN ou numéro du compte courant
    bank_savings?: string;         // IBAN ou numéro du compte épargne
  };

  // Audit et métadonnées
  created_at: Date;
  updated_at: Date;
  closed_at?: Date;                // Date de clôture effective
  closed_by?: string;              // ID de l'utilisateur qui a clôturé
  notes?: string;                  // Notes ou remarques sur l'année fiscale
}

// Types pour les statistiques du tableau de bord
export interface DashboardStats {
  solde_bancaire: number;
  total_revenus_mois: number;
  total_depenses_mois: number;
  nombre_demandes_attente: number;
  nombre_transactions_non_reconciliees: number;
  prochains_evenements: Evenement[];
  dernieres_transactions: TransactionBancaire[];
  demandes_recentes: DemandeRemboursement[];
}

// Type pour l'import CSV
export interface ImportCSVResult {
  success: boolean;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  errors?: string[];
  batch_id: string;
}

// Formats de CSV bancaires supportés
export type BankFormat = 'bnp' | 'kbc' | 'ing' | 'belfius';

export interface CSVMapping {
  bank: BankFormat;
  delimiter: string;
  encoding: string;
  columns: {
    numero_sequence?: string;
    date_execution: string;
    date_valeur?: string;
    montant: string;
    devise?: string;
    numero_compte?: string;
    type_transaction?: string;
    contrepartie_iban?: string;
    contrepartie_nom?: string;
    communication?: string;
    details?: string;
    statut?: string;
    motif_refus?: string;
  };
  date_format: string;
  decimal_separator: string;
}

// Type pour les imports VP Dive
export interface VPDiveImport {
  id: string;
  event_id: string;
  event_name: string;
  file_name: string;
  imported_at: Date;
  imported_by: string;
  participants_count: number;
  matched_transactions_count: number;
  unmatched_participants_count: number;
  total_expected_amount: number;
  total_matched_amount: number;
  reconciliation_status: 'pending' | 'partial' | 'complete';
  participants_data?: any; // Données brutes des participants
}

// Type pour le résultat de réconciliation
export interface ReconciliationResult {
  transaction_id: string;
  matched_with: {
    type: 'participant' | 'expense_claim' | 'member' | 'event';
    id: string;
    name?: string;
    confidence: number; // 0-100
  };
  suggested_action?: 'auto_reconcile' | 'manual_review' | 'split_transaction';
  suggested_splits?: Omit<TransactionSplit, 'id' | 'created_at' | 'updated_at' | 'created_by'>[];
}

// Type pour les notifications
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  titre: string;
  message: string;
  lu: boolean;
  date: Date;
  action_url?: string;
  destinataire_id: string;
}

// Type pour les correspondances AI entre transactions et demandes de remboursement
export interface AIExpenseMatch {
  id: string;
  club_id: string;
  transaction_id: string;
  demande_id: string;
  confidence: number; // Score de confiance 0-100
  reasoning: string; // Explication de l'IA
  statut: 'pending' | 'validated' | 'rejected';
  validated_by?: string; // ID de l'utilisateur qui a validé/rejeté
  validated_at?: Date;
  created_at: Date;
  created_by: string;
}

// ============================================================
// Types pour le système de rapports PDF
// ============================================================

// Type de rapport disponible
export type ReportType = 'synthese' | 'category' | 'account_code' | 'activity' | 'treasury' | 'events';

// Type de période
export type PeriodType = 'year' | 'quarter' | 'month' | 'custom';

// Période du rapport
export interface ReportPeriod {
  start_date: Date;
  end_date: Date;
  fiscal_year: number;
  label: string;
  type: PeriodType;
}

// Total par catégorie
export interface CategoryTotal {
  categorie: string;
  categorie_label: string;
  total: number;
  transaction_count: number;
  percentage: number; // Pourcentage du total
}

// Total par code comptable
export interface AccountTotal {
  code: string;
  label: string;
  total: number;
  transaction_count: number;
  percentage: number;
}

// Données mensuelles pour évolution
export interface MonthlyData {
  month: string; // Format: "2025-01" ou "Janvier 2025"
  month_number: number; // 1-12
  year: number;
  revenue: number;
  expense: number;
  net: number;
  cumulative_net: number; // Cumul net depuis début période
}

// Données mensuelles pour événements
export interface EventMonthlyData {
  month: string; // Format: "Janvier 2025"
  month_number: number; // 1-12
  year: number;
  event_count: number; // Nombre d'événements ce mois
  registration_count: number; // Nombre d'inscriptions ce mois
}

// Statistiques par participant
export interface ParticipantStats {
  membre_id: string;
  membre_nom: string;
  registration_count: number; // Nombre d'inscriptions
  percentage: number; // Pourcentage du total
}

// Statistiques complètes d'événements
export interface EventStatistics {
  period: ReportPeriod;
  total_events: number; // Total événements sur période
  total_registrations: number; // Total inscriptions
  average_registrations_per_event: number; // Moyenne inscriptions/événement
  payment_rate: number; // Taux de paiement (%)
  monthly_data: EventMonthlyData[]; // Données mensuelles
  top_participants: ParticipantStats[]; // Top 10 participants
  events_by_status: Record<string, number>; // Événements par statut
  events: Evenement[]; // Liste complète des événements (DEPRECATED - use operations)
  registrations: InscriptionEvenement[]; // Liste complète des inscriptions (DEPRECATED - use participants)

  // NOUVEAU - Support Operation
  operations?: Operation[]; // Liste complète des opérations (type='evenement')
  participants?: ParticipantOperation[]; // Liste complète des participants
}

// Données financières événement/opération
export interface EventFinancial {
  evenement_id: string;       // DEPRECATED - use operation_id
  operation_id?: string;      // NOUVEAU - ID opération
  titre: string;
  date_debut: Date;
  date_fin: Date;
  participant_count: number;
  total_revenue: number; // Total revenus liés
  total_expense: number; // Total dépenses liées
  net_result: number; // Résultat net
  revenue_per_participant: number; // Moyenne revenus/participant
  transactions: TransactionBancaire[]; // Transactions liées
  expense_claims: DemandeRemboursement[]; // Demandes liées
}

// Synthèse financière complète
export interface FinancialSummary {
  period: ReportPeriod;

  // Soldes bancaires
  opening_balance: number; // Solde de début
  closing_balance: number; // Solde de fin

  // Totaux généraux
  total_revenue: number;
  total_expense: number;
  net_result: number; // Résultat net (revenus - dépenses)

  // Agrégations par catégorie
  revenue_by_category: CategoryTotal[];
  expense_by_category: CategoryTotal[];

  // Agrégations par code comptable
  revenue_by_account: AccountTotal[];
  expense_by_account: AccountTotal[];

  // Évolution dans le temps
  monthly_evolution: MonthlyData[];

  // Événements
  events: EventFinancial[];

  // Alertes et données non-réconciliées
  unreconciled_transactions: TransactionBancaire[];
  pending_expense_claims: DemandeRemboursement[];

  // Statistiques générales
  transaction_count: number;
  reconciliation_rate: number; // Pourcentage de transactions réconciliées
}

// Métadonnées pour un rapport généré
export interface ReportMetadata {
  type: ReportType;
  period: ReportPeriod;
  generated_at: Date;
  generated_by: string;
  generated_by_name?: string;
  club_id: string;
  club_name?: string;
  fiscal_year: number;
}

// Rapport PDF complet prêt pour export
export interface PDFReport {
  metadata: ReportMetadata;
  data: FinancialSummary;
}

// ============================================================================
// CATEGORY CODE SELECTOR MODAL
// ============================================================================

/**
 * Context pour générer des suggestions de catégorisation
 */
export interface AccountCodeSuggestionContext {
  montant?: number;
  contrepartie?: string;
  communication?: string;
  linkedEvent?: Operation;
  linkedDemand?: DemandeRemboursement;
  historicalTransactions?: TransactionBancaire[];
}

/**
 * Une suggestion de code comptable (sans catégorie)
 */
export interface AccountCodeSuggestion {
  code: string;               // Code comptable
  codeLabel: string;          // Label du code
  confidence: number;         // Score de confiance 0-100
  reasons: string[];          // Raisons de la suggestion
  source: 'linked_entity' | 'counterparty' | 'history' | 'keyword' | 'amount';
}