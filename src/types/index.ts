// Types pour l'application CalyCompta

export type Role = 'membre' | 'organisateur' | 'validateur' | 'admin';

// Export user types
export * from './user.types';

// Export piscine types
export * from './piscine.types';

// Export palanquée types
export * from './palanquee.types';
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
  /**
   * @deprecated Utiliser getLastName() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getLastName}
   */
  nom: string;                         // Nom de famille (OBLIGATOIRE)
  /**
   * @deprecated Utiliser getFirstName() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getFirstName}
   */
  prenom: string;                      // Prénom (OBLIGATOIRE)
  email: string;                       // Email (OBLIGATOIRE - unique)
  displayName?: string;                // Nom d'affichage (calculé: "Prénom Nom" si absent)
  date_naissance?: Date;               // Date de naissance
  sexe?: 'M' | 'F';                   // Sexe (M/F, depuis Organon)

  // ========== CONTACT ==========
  /**
   * @deprecated Utiliser getPhone() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getPhone}
   */
  telephone?: string;                  // GSM principal (renommé de gsm pour cohérence)
  phoneNumber?: string;                // Alias de telephone (backward compatibility)
  /**
   * @deprecated Utiliser getPhone() du Field Mapper (@/utils/fieldMapper)
   */
  gsm?: string;                        // DEPRECATED - Utiliser telephone
  /**
   * @deprecated Utiliser getAddress() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getAddress}
   */
  adresse?: string;                    // Adresse complète
  /**
   * @deprecated Utiliser getPostalCode() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getPostalCode}
   */
  code_postal?: string;                // Code postal
  localite?: string;                   // Localité
  pays?: string;                       // Pays (défaut: "Belgique")
  ice?: string;                        // Contact urgence (In Case of Emergency)
  photoURL?: string;                   // Photo de profil

  // ========== BANCAIRE ==========
  iban?: string;                       // IBAN principal (le plus utilisé)
  ibans?: string[];                    // Tous les IBANs détectés
  iban_metadata?: {
    [iban: string]: {
      first_seen: Date;
      last_seen: Date;
      transaction_count: number;
      source: 'auto' | 'manual';
      confidence: number;              // 0-100
    };
  };

  // ========== MÉDICAL (PLONGEURS) ==========
  certificat_medical_date?: Date;
  certificat_medical_validite?: Date;
  has_pending_medical?: boolean;       // Flag for pending mobile medical certificates

  // ========== COTISATION ==========
  cotisation_validite?: Date; // Validité de la cotisation (replaces Dernière connexion functionality in main view)
  membership_category_code?: string;  // Code du type de membre selon les cotisations actives
  membership_period?: 'jan_dec' | 'sept_dec'; // Période tarifaire sélectionnée
  membership_season_id?: string;      // Saison de cotisation liée au type de membre

  // ========== PLONGÉE ==========
  niveau_plongee?: string;             // Niveau plongeur (P1, P2, P3, etc.) - DEPRECATED, use plongeur_niveau
  niveau_plongeur?: string;            // DEPRECATED - Utiliser plongeur_niveau
  plongeur_niveau?: string;            // Niveau plongeur (valeur brute: "Plongeur 1*", "Moniteur Club", etc.)
  plongeur_code?: string;              // Code standardisé calculé (1, 2, 3, 4, MC, MF, AM, etc.) - pour filtrage
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

  // ========== SECURITY METADATA ==========
  security?: {
    requirePasswordChange?: boolean;   // Force password change on next login
    lastPasswordChange?: Date;         // Timestamp of last password change
    passwordChangedBy?: string;        // Who changed the password (userId or 'self')
  };

  // ========== PUSH NOTIFICATIONS (CalyMob) ==========
  fcm_token?: string;                  // FCM token actuel (legacy, single device)
  fcm_tokens?: string[];               // FCM tokens pour multi-device support
  fcm_token_updated_at?: Date;         // Dernière mise à jour du token
  notifications_enabled?: boolean;     // Notifications push activées

  // ========== DIAGNOSTICS (CalyMob → Firestore → CalyCompta) ==========
  diag_biometric?: {                   // Statut biométrique (écrit par DiagnosticService)
    available: boolean;
    canCheck: boolean;
    deviceSupported: boolean;
    types: string;
    error?: string;
    updated_at?: Date;
  };
  diag_errors?: Array<{                // Dernières erreurs (max 10)
    domain: string;
    message: string;
    detail?: string;
    timestamp: string;
  }>;
  diag_last_error_at?: Date;
  diag_health?: {                      // App health snapshot
    notifications_ok: boolean;
    biometric_ok: boolean;
    app_version?: string;
    checked_at?: Date;
  };

  // ========== APP INSTALLATION TRACKING (CalyMob) ==========
  app_installed?: boolean;             // CalyMob est installée
  app_platform?: 'ios' | 'android';    // Plateforme mobile
  app_version?: string;                // Version app (ex: "1.0.6")
  app_build_number?: string;           // Numéro de build (ex: "22")
  device_model?: string;               // Modèle appareil (ex: "iPhone 14 Pro", "Pixel 7")
  device_os_version?: string;          // Version OS (ex: "iOS 17.1", "Android 14")
  app_last_opened?: Date;              // Dernière ouverture de l'app
  app_first_installed?: Date;          // Date première installation

  // ========== CALENDAR FEED ==========
  calendar_token?: string;             // UUID v4 for calendar feed access (unique, secret)
  calendar_token_created_at?: Date;    // When the token was generated

  // ========== STATUT MEMBRE CLUB ==========
  member_status: MemberStatus;         // NOUVEAU - 'active' | 'inactive' | 'archived'
  is_diver: boolean;                   // NOUVEAU - Est plongeur actif (pour filtres)
  has_lifras: boolean;                 // NOUVEAU - A une licence LIFRAS (pour filtres)

  // ========== FONCTION DANS LE CLUB ==========
  fonction_defaut?: string;            // Fonction par défaut (référence value list "fonction": "membre", "encadrant", "ca", etc.)
  clubStatuten?: string[];              // Fonctions multiples dans le club (["Membre", "Encadrants", "CA"])

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

  // ========== AUDIT TRAIL (Billing/Access) ==========
  billing_audit_history?: MemberFieldAudit[];  // Audit trail voor IBAN, role, access wijzigingen

  // ========== LEGACY FIELDS (backward compatibility) ==========
  // Ces champs sont gardés pour compatibilité mais DEPRECATED
  /**
   * @deprecated Utiliser isActive() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').isActive}
   */
  isActive?: boolean;                  // DEPRECATED - Utiliser member_status === 'active'
  /**
   * @deprecated Utiliser isActive() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').isActive}
   */
  actif?: boolean;                     // DEPRECATED - Utiliser member_status === 'active'
  /**
   * @deprecated Utiliser getRole() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getRole}
   */
  role?: Role;                         // DEPRECATED - Utiliser app_role
  /**
   * @deprecated Utiliser getStatus() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getStatus}
   */
  status?: UserStatus;                 // DEPRECATED - Utiliser app_status
  clubId?: string;                     // DEPRECATED - Implicite via path collection
  /**
   * @deprecated Utiliser getCreatedAt() du Field Mapper (@/utils/fieldMapper)
   */
  created_at?: Date;                   // DEPRECATED - Utiliser createdAt
  /**
   * @deprecated Utiliser getUpdatedAt() du Field Mapper (@/utils/fieldMapper)
   */
  updated_at?: Date;                   // DEPRECATED - Utiliser updatedAt
}

// Nouveaux types pour structure unifiée
export type MemberStatus = 'active' | 'inactive' | 'archived';

// Audit trail entry pour code comptable
export interface CodeComptableAudit {
  code_comptable: string;         // Le code qui a été assigné
  categorie?: string;             // Catégorie associée (optionnel)
  assigned_by: string;            // User ID de la personne qui a assigné
  assigned_by_name: string;       // Nom d'affichage de la personne
  assigned_at: Date;              // Date et heure de l'assignation
  previous_code?: string;         // Code comptable précédent (si modification)
  previous_categorie?: string;    // Catégorie précédente (si modification)
  source?: 'manual' | 'manual_delete' | 'auto' | 'bulk' | 'learned';  // Source de l'assignation
}

// Audit trail entry pour modification de montant
export interface MontantAudit {
  old_montant: number;            // Ancien montant
  new_montant: number;            // Nouveau montant
  changed_by: string;             // User ID de la personne qui a modifié
  changed_by_name: string;        // Nom d'affichage de la personne
  changed_at: Date;               // Date et heure de la modification
  justification?: string;         // Motif du changement (optionnel)
  // Approval reset tracking (when amount changes after approval)
  approval_reset?: boolean;       // True si la modification a reset l'approbation
  previous_statut?: string;       // Statut avant le reset (approuve, rembourse, etc.)
}

// Audit trail entry pour changement de statut demande
export interface StatusAudit {
  old_statut: string;             // Ancien statut
  new_statut: string;             // Nouveau statut
  changed_by: string;             // User ID
  changed_by_name: string;        // Nom d'affichage
  changed_at: Date;               // Date et heure
  reason?: string;                // Motif (pour refus)
  approval_type?: 'first' | 'second';  // Type d'approbation
}

// Audit trail entry pour modification de champ transaction
export interface TransactionFieldAudit {
  field: string;                  // Nom du champ modifié
  old_value: unknown;             // Ancienne valeur
  new_value: unknown;             // Nouvelle valeur
  changed_by: string;             // User ID
  changed_by_name: string;        // Nom d'affichage
  changed_at: Date;               // Date et heure
  justification?: string;         // Motif du changement
  was_reconciled?: boolean;       // True si transaction était réconciliée
}

// Audit trail entry pour modification de champ opération
export interface OperationFieldAudit {
  field: string;                  // 'montant_prevu' | 'date_debut' | 'statut' | etc.
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_by_name: string;
  changed_at: Date;
  justification?: string;
}

// Audit trail entry pour modification de données membre (billing)
export interface MemberFieldAudit {
  field: string;                  // 'iban' | 'ibans' | 'app_role' | 'has_app_access'
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_by_name: string;
  changed_at: Date;
}

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
  code_comptable_not_found?: boolean; // True si recherché mais aucun code approprié trouvé

  // Audit trail pour les codes comptables
  code_comptable_history?: CodeComptableAudit[];  // Historique de toutes les assignations/modifications

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
  matched_entities?: MatchedEntity[]; // Entités liées

  // Champ commentaire
  commentaire?: string; // Commentaire libre sur la transaction

  // Auto-catégorisation
  categorization_source?: 'manual' | 'rules' | 'ai' | 'learned'; // Source de la catégorisation
  categorization_confidence?: number; // Score de confiance 0-100
  needs_review?: boolean; // True si catégorisé par AI avec confiance < 60%
  categorization_batch_id?: string; // Timestamp ISO pour identifier un batch de traitement

  // Signalement manuel pour transactions problématiques
  flagged_problematic?: boolean;    // True si manuellement signalée comme problématique
  flagged_at?: Date;                // Quand signalée
  flagged_by?: string;              // User ID qui a signalé
  flagged_by_name?: string;         // Nom affiché de qui a signalé
  flagged_reason?: string;          // Raison/note expliquant le problème

  // Documents justificatifs (receipts, invoices, etc.)
  urls_justificatifs?: string[]; // URLs des documents stockés dans Firebase Storage (LEGACY - use documents_justificatifs)
  documents_justificatifs?: DocumentJustificatif[]; // Documents avec métadonnées complètes

  // Audit trail pour modifications de champs (hors code_comptable qui a son propre historique)
  field_history?: TransactionFieldAudit[];
  fields_modified?: boolean;     // Flag pour identifier transactions modifiées après import

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

// Catégorie d'événement (uniquement pour type='evenement')
export type EventCategory = 'plongee' | 'piscine' | 'sortie';

// Labels pour affichage des catégories d'événements
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  plongee: 'Plongée',
  piscine: 'Piscine',
  sortie: 'Sortie / Fête'
};

/**
 * Interface Operation - Remplace Evenement avec système multi-types
 * Supporte: événements, cotisations, cautions, ventes, subventions
 */
export interface Operation {
  // Identification
  id: string;
  type: TypeOperation;

  // Unique event number for bank reconciliation
  // Format: 2XXXXX for dive events, 3XXXXX for other events
  event_number?: string;

  // Source & edition
  source?: string;
  isEditable?: boolean;

  // Champs communs (TOUS types)
  titre: string;
  description?: string;
  info_document?: DocumentJustificatif;  // Document d'information lié à la description (affiché dans CalyMob)
  montant_prevu: number;          // Budget prévisionnel (remplace budget_prevu_revenus)
  statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule';
  budget_prevu_revenus?: number;  // Legacy fallback for migrated events
  budget_prevu_depenses?: number; // Legacy field still present on older events

  // Organisateur/responsable
  organisateur_id: string;
  organisateur_nom?: string;

  // Documents justificatifs (TOUS types)
  documents_justificatifs?: DocumentJustificatif[];

  // Catégorisation comptable (optionnel)
  categorie?: string;           // Catégorie comptable (ex: 'activites_club')
  code_comptable?: string;      // Code comptable belge (ex: '730-00-712')

  // ---- Champs spécifiques ÉVÉNEMENTS (optionnels pour autres types) ----
  event_category?: EventCategory; // Catégorie d'événement: 'plongee' ou 'sortie'
  date_debut?: Date;              // Date début événement
  date_fin?: Date;                // Date fin événement
  lieu?: string;                  // Lieu événement
  lieu_id?: string;               // Référence DiveLocation (si créé depuis un lieu)
  lieu_type?: import('../config/locationTypes').LocationType;  // Type de lieu (Carrière, Zélande, etc.)
  capacite_max?: number;          // Capacité maximale participants

  /**
   * @deprecated Utiliser tariffs[] pour tarification flexible par fonction.
   * Conservé pour compatibilité avec événements existants.
   */
  prix_membre?: number;           // Prix membre (DEPRECATED - utiliser tariffs)
  /**
   * @deprecated Utiliser tariffs[] pour tarification flexible par fonction.
   * Conservé pour compatibilité avec événements existants.
   */
  prix_non_membre?: number;       // Prix non-membre (DEPRECATED - utiliser tariffs)

  // Tarifs pour événements (copie depuis DiveLocation lors de la création)
  event_tariffs?: import('./tariff.types').Tariff[];  // Tarifs flexibles par fonction (membre, encadrant, etc.)

  /**
   * Allow members to register external guests (family / friends) for this
   * event from CalyMob. When true, members see an "Ajouter un invité" button
   * after registering, and pay a single aggregated QR for themselves + their
   * guests. The guest's price is taken from event_tariffs entries with
   * is_guest_tariff=true. Default false.
   */
  allow_guests?: boolean;

  // Suppléments optionnels pour événements (location combinaison, etc.)
  supplements?: import('./supplement.types').Supplement[];

  // ---- Champs spécifiques COTISATIONS (optionnels pour autres types) ----
  periode_debut?: Date;           // Début période cotisation (ex: 01/01/2025)
  periode_fin?: Date;             // Fin période cotisation (ex: 31/01/2026)
  tarifs?: Record<string, number>; // Tarifs différenciés cotisations (ex: {plongeur: 130, apneiste: 80})

  // ---- Champs spécifiques DONS/VENTES/SUBVENTIONS ----
  // (utilisent seulement champs communs + documents)

  // Audit trail voor veld wijzigingen
  field_history?: OperationFieldAudit[];
  fields_modified?: boolean;

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

  // Fonction/Role for this event (references value list "fonction")
  fonction?: string;                 // Member function for this event (e.g., "membre", "encadrant", "ca")

  // Transaction linking (one-to-one relationship)
  transaction_id?: string;           // ID of linked transaction (bank payment)
  transaction_montant?: number;      // Amount from linked transaction

  // Payment method tracking
  mode_paiement?: 'bank' | 'cash' | 'other' | null;  // How payment was received

  // Mollie payment tracking (CalyMob app payments)
  payment_provider?: 'mollie' | null;    // Payment provider used
  payment_status?: 'open' | 'pending' | 'paid' | 'failed' | 'canceled' | 'expired' | 'qr_email_sent' | 'qr_on_site' | 'cash' | null;  // Payment status
  payment_id?: string;                   // Internal payment ID
  mollie_payment_id?: string;            // Mollie's payment ID
  payment_initiated_at?: Date;           // When payment was initiated

  // Cash payment amount tracking
  montant_paye_especes?: number;         // Amount paid in cash (may differ from prix)

  // Comments field for additional information
  commentaire?: string;              // Free text notes (e.g., "Payé sur place en espèces")

  // Legacy field (deprecated - use transaction_id)
  transaction_bancaire_id?: string;  // DEPRECATED - use transaction_id instead

  // Guest (non-member) inscription
  is_guest?: boolean;                // True for non-member guests
  added_by?: string;                 // User ID who added the guest
  added_by_name?: string;            // Display name of user who added the guest
  /**
   * For guest inscriptions added by a member through CalyMob: ID of the
   * inviting member's own inscription. Used to aggregate payment (single QR
   * for member + their guests) and to cascade actions.
   */
  parent_inscription_id?: string;
  /**
   * ID of the Tariff entry from operation.event_tariffs[] used to compute
   * this inscription's price. Useful especially for guest inscriptions to
   * record which guest tariff was picked.
   */
  tariff_id?: string;

  // Exercices souhaités (LIFRAS exercise IDs selected by the student)
  exercices?: string[];              // Array of exercice_lifras document IDs

  // Suppléments sélectionnés (snapshot at registration time)
  selected_supplements?: import('./supplement.types').SelectedSupplement[];
  supplement_total?: number;         // Sum of selected supplement prices

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

  // Fonction/Role for this operation (references value list "fonction")
  fonction?: string;               // Member function for this operation (e.g., "membre", "encadrant", "ca")

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

  // Suppléments sélectionnés (snapshot at registration time)
  selected_supplements?: import('./supplement.types').SelectedSupplement[];
  supplement_total?: number;       // Sum of selected supplement prices

  // Guest (non-member) inscription
  is_guest?: boolean;                // True for non-member guests
  added_by?: string;                 // User ID who added the guest
  added_by_name?: string;            // Display name of user who added the guest
  /**
   * For guest inscriptions added by a member through CalyMob: ID of the
   * inviting member's own inscription. Used to aggregate payment (single QR
   * for member + their guests) and to cascade actions.
   */
  parent_inscription_id?: string;
  /**
   * ID of the Tariff entry from operation.event_tariffs[] used to compute
   * this inscription's price.
   */
  tariff_id?: string;

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
  statut: 'en_attente_validation' | 'approuve' | 'paiement_effectue' | 'rembourse' | 'refuse' | 'brouillon' | 'cree_banque_attente_validation';
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
  transaction_id?: string;  // Transaction qui a PAYÉ cette dépense

  // Transaction source (pour remboursements créés depuis une transaction)
  source_transaction_id?: string;    // ID de la transaction que cette dépense rembourse
  source_transaction_ref?: string;   // numero_sequence pour affichage (ex: "#2026-00131")

  motif_refus?: string;
  refuse_par?: string;
  refuse_par_nom?: string;
  date_refus?: Date;

  created_at: Date;
  updated_at: Date;
  created_by?: string;

  // Email notification tracking
  confirmation_email_sent?: boolean;  // True if confirmation email was sent to demandeur
  confirmation_email_sent_at?: Date;  // When the email was sent

  // Audit trail montant
  montant_history?: MontantAudit[];   // Historique des modifications de montant
  montant_modified?: boolean;         // Flag automatique si montant a été modifié après création

  // Audit trail statut
  status_history?: StatusAudit[];     // Historique des changements de statut

  // Bénéficiaire du remboursement (nieuw voor QR-code betalingen)
  beneficiaire_type?: 'demandeur' | 'fournisseur';  // Default: 'demandeur'
  fournisseur_id?: string;         // Alleen als beneficiaire_type = 'fournisseur'
  fournisseur_nom?: string;        // Gedenormaliseerd voor display

  // Paiement manuel (betaald via QR maar nog niet geboekt)
  paiement_manuel?: boolean;       // True als betaling handmatig gedaan (via QR) maar nog niet via transactie gekoppeld
  paiement_manuel_date?: Date;     // Datum van handmatige betaling
  paiement_manuel_par?: string;    // User ID die betaling heeft gemarkeerd

  // Communication pour QR Code de paiement (max 140 chars EPC standard)
  communication_qr?: string;       // Communication bancaire pour le QR code, défaut = description
}

export interface Categorie {
  id: string;
  nom: string;
  label_court?: string; // Nom court pour affichage dans badges (ex: "Cotis", "Sorties")
  type: 'revenu' | 'depense';
  couleur: string;
  icone?: string;
  description?: string;
  isFrequent?: boolean; // Indique si la catégorie est fréquemment utilisée (favori)
}

export interface AccountCode {
  code: string;  // Ex: "730-00-712"
  label: string; // Ex: "Cotisations des membres plongeurs (V)"
  type: 'revenue' | 'expense' | 'asset' | 'liability';
  categories?: string[]; // Catégories associées (peut appartenir à plusieurs catégories)
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

  // Données du Bilan (Balance Sheet) - saisie manuelle
  balance_sheet?: {
    // ACTIF - Actifs circulants (hors comptes bancaires déjà gérés)
    assets: {
      stock_cdc?: number;              // Stock C.D.C.
      stock_boutique?: number;         // Boutique
      stock_boutique_lifras?: number;  // Boutique LIFRAS
      obligations?: number;            // Obligations Dette Belge / Placements
      charges_reportees?: number;      // Charges à reporter (sorties année suivante)
      assurance_reportee?: number;     // Assurance matériel année suivante
    };

    // PASSIF - Fonds propres et provisions
    liabilities: {
      resultat_reporte?: number;       // Résultat reporté des exercices antérieurs
      fonds_affectes?: number;         // Fonds affectés
      resultat_exercice?: number;      // Résultat de l'exercice
      provision_entretien?: number;    // Provision pour entretien matériel
      provision_piscine?: number;      // Provision location piscine
      cotisations_reportees?: number;  // Cotisations plongeurs année suivante
      sorties_reportees?: number;      // Sorties club année suivante
      paiements_annee_suivante?: number; // Paiements N afférents à N+1
    };
  };

  // Suivi de l'assistant de clôture
  closing_wizard?: {
    version: number;
    current_step?: 'preparation' | 'banques' | 'stocks' | 'bilan' | 'validation';
    last_saved_at?: string;
    blocking_reasons?: string[];
    warning_messages?: string[];
    steps?: {
      preparation?: {
        status: 'todo' | 'in_progress' | 'done';
        updated_at?: string;
        completed_at?: string;
      };
      banques?: {
        status: 'todo' | 'in_progress' | 'done';
        updated_at?: string;
        completed_at?: string;
      };
      stocks?: {
        status: 'todo' | 'in_progress' | 'done';
        updated_at?: string;
        completed_at?: string;
      };
      bilan?: {
        status: 'todo' | 'in_progress' | 'done';
        updated_at?: string;
        completed_at?: string;
      };
      validation?: {
        status: 'todo' | 'in_progress' | 'done';
        updated_at?: string;
        completed_at?: string;
      };
    };
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
// Types pour les patterns de catégorisation appris
// ============================================================

export interface LearnedPattern {
  id: string;

  // Critères de matching (au moins un doit être présent)
  contrepartie_nom?: string;         // Ex: "PROXIMUS SA"
  contrepartie_normalized?: string;  // Ex: "proximus" (lowercase, sans accents)
  keywords?: string[];               // Ex: ["téléphone", "gsm"]

  // Résultat à appliquer
  code_comptable: string;
  categorie: string;

  // Métadonnées
  confidence: number;        // 90 pour patterns appris manuellement
  use_count: number;         // Incrémenté à chaque utilisation
  created_at: Date;
  created_by: string;        // userId
  source_transaction_id: string;

  // Pour audit et compréhension
  comment?: string;          // Commentaire libre de l'utilisateur
  original_wrong_code?: string; // Code qui était incorrect (optionnel)
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

/**
 * Groupe de rapport pour le Compte de Résultats
 * Permet de regrouper les codes comptables pour l'export Excel
 */
export interface ReportGroup {
  id: string;                 // Identifiant unique du groupe
  name: string;               // Nom affiché du groupe
  order: number;              // Ordre d'affichage (1, 2, 3...)
  accountCodes: string[];     // Liste des codes comptables dans ce groupe
}

/**
 * Code de Bilan pour la structure hiérarchique du bilan comptable
 * Ex: 02.01.01 = Stock Boutique (enfant de 02.01 Stock CDC)
 */
export interface BilanCode {
  id: string;                    // Identifiant unique (ex: "02.01")
  code: string;                  // Code hiérarchique (ex: "02.01")
  name: string;                  // Nom affiché (ex: "Stock CDC")
  section: 'actif' | 'passif';   // Section du bilan
  order: number;                 // Ordre d'affichage
  parentId?: string;             // ID du parent (ex: "02" pour "02.01")

  // Configuration du calcul
  calculationType:
    | 'sum_children'        // Somme des codes enfants
    | 'sum_transactions'    // Somme des transactions liées
    | 'manual'              // Saisie manuelle
    | 'calculated'          // Calcul spécial
    | 'inventory_value'     // Valeur actuelle de l'inventaire matériel
    | 'pl_result'           // Résultat du compte de résultats (P&L)
    | 'boutique_stock'      // Valeur du stock boutique
    | 'result_carryforward' // Résultat reporté: opening + résultat année précédente
    | 'bank_total';         // Solde bancaire: opening + somme de TOUTES les transactions
  accountCodes?: string[];       // Codes comptables liés (pour sum_transactions)

  // Configuration spéciale pour boutique_stock
  boutiqueType?: 'boutique' | 'boutique_lifras';

  // Logique Opening/Closing
  openingSource: 'manual' | 'previous_closing' | 'calculated' | 'zero';  // 'zero' = toujours 0 (pour résultat exercice)
  closingSource: 'manual' | 'opening_plus_movements' | 'calculated';
}

/**
 * Status van een snapshot voor bilan waarden
 * Geeft aan of de waarde bevroren is (locked) of nog kan wijzigen
 */
export interface BilanValueStatus {
  hasSnapshot: boolean;          // Is er een snapshot gemaakt?
  isLocked: boolean;             // Is de snapshot verrouillerd?
  source: 'snapshot_locked' | 'snapshot_provisional' | 'live_calculation' | 'manual';
}

/**
 * Valeurs du bilan pour une année fiscale
 * Stockées dans clubs/{clubId}/fiscal_years/{yearId}/bilan_values
 */
export interface BilanValues {
  bilanCodeId: string;           // Référence au BilanCode
  openingValue: number;          // Valeur d'ouverture
  closingValue: number;          // Valeur de clôture
  isManualOpening: boolean;      // True si opening saisi manuellement
  isManualClosing: boolean;      // True si closing saisi manuellement
  calculatedMovements?: number;  // Mouvements calculés (pour info)
  closingStatus?: BilanValueStatus;  // Status van de closing waarde (snapshot/live)
}

// ============================================================
// FOURNISSEURS (LEVERANCIERS)
// ============================================================

/**
 * Fournisseur - Leverancier voor terugbetalingen aan derden
 * Collection: /clubs/{clubId}/fournisseurs/{fournisseurId}
 */
export interface Fournisseur {
  id: string;
  nom: string;                    // Bedrijfsnaam (verplicht)
  iban: string;                   // IBAN (verplicht voor QR-code)
  adresse?: string;
  code_postal?: string;
  localite?: string;
  pays?: string;                  // Default: "Belgique"
  email?: string;
  telephone?: string;
  numero_tva?: string;            // BTW-nummer
  notes?: string;
  actif: boolean;                 // Default: true
  created_at: Date;
  updated_at: Date;
  created_by: string;
}
