import { Timestamp } from 'firebase/firestore';

// User roles hierarchy
export type UserRole = 'membre' | 'user' | 'validateur' | 'admin' | 'superadmin';

// Medical certificate status (for mobile app uploads)
export type CertificateStatus = 'pending' | 'approved' | 'rejected';

/**
 * Medical certificate uploaded via mobile app (CalyMob)
 * Stored in subcollection: clubs/{clubId}/members/{memberId}/medical_certificates
 */
export interface MobileMedicalCertificate {
  id: string;
  member_id: string;
  document_url: string;
  document_type: 'image' | 'pdf';
  file_name?: string;
  uploaded_at: Timestamp;
  status: CertificateStatus;
  valid_until?: Timestamp;
  reviewed_by?: string;
  reviewed_by_nom?: string;
  reviewed_at?: Timestamp;
  rejection_reason?: string;
}

// User status
export type UserStatus = 'pending' | 'active' | 'inactive' | 'suspended' | 'deleted';

// Permission types
export type Permission =
  | 'users.view'
  | 'users.create'
  | 'users.update'
  | 'users.delete'
  | 'users.activate'
  | 'users.assignRole'
  | 'dashboard.view'
  | 'transactions.view'
  | 'transactions.create'
  | 'transactions.update'
  | 'transactions.sign'
  | 'transactions.link'
  | 'transactions.delete'
  | 'demands.view'
  | 'demands.create'
  | 'demands.update'
  | 'demands.approve'
  | 'demands.reject'
  | 'demands.delete'
  | 'demands.addDocument'
  | 'demands.deleteDocument'
  | 'events.view'
  | 'events.create'
  | 'events.manage'
  | 'events.delete'
  | 'audit.view'
  | 'settings.view'
  | 'settings.manage'
  | 'reports.view'
  | 'reports.export'
  | 'reports.create';

// Rule enforcement types for permissions
export type RuleEnforcementType =
  | 'BLOCKED'      // Permission is completely blocked by Firestore rules
  | 'SCOPED'       // Permission is allowed but scoped to user's own data
  | 'NORMAL';      // Permission works normally without special restrictions

// Rule-enforced permission configuration
export interface RuleEnforcedPermission {
  permission: Permission;
  affectedRoles: UserRole[];
  enforcementType: RuleEnforcementType;
  reason: string;
  firestoreRule?: string; // Optional reference to the Firestore rule
}

// ============================================================
// DOCUMENTS MÉDICAUX ET GÉNÉRAUX (MEMBRE)
// ============================================================

/**
 * Action d'audit pour les documents
 */
export interface DocumentAuditEntry {
  action: 'upload' | 'modification' | 'suppression' | 'date_modified' | 'name_modified';
  par: string;                    // User ID
  par_nom: string;                // Display name
  date: Date | Timestamp;
  champ?: string;                 // Field modified (for 'modification')
  ancienne_valeur?: unknown;      // Previous value (for 'modification')
  nouvelle_valeur?: unknown;      // New value (for 'modification')
  details?: string;               // Human-readable description of the change
}

/**
 * Document médical (certificat médical)
 * Structure complète incluant les champs DocumentJustificatif + champs spécifiques médicaux
 */
export interface MedicalDocument {
  // Champs de base (comme DocumentJustificatif)
  url: string;                          // URL Firebase Storage
  nom_original: string;                 // Nom du fichier lors de l'upload
  nom_affichage: string;                // Nom modifiable par l'utilisateur
  type: string;                         // MIME type (application/pdf)
  taille: number;                       // Taille en bytes
  date_upload: Date | Timestamp;        // Date de téléversement
  uploaded_by?: string;                 // ID de l'utilisateur qui a uploadé
  uploaded_by_nom?: string;             // Nom de l'utilisateur
  file_hash?: string;                   // Hash SHA-256 du contenu (pour déduplication)

  // Champs spécifiques aux certificats médicaux
  date_validite: Date | Timestamp;      // Date jusqu'à laquelle le certificat est valide
  type_certificat?: string;             // Ex: "Certificat médical de non contre-indication"
  historique?: DocumentAuditEntry[];    // Audit trail
}

/**
 * Document général (assurance, diplôme, etc.)
 * Structure complète incluant les champs DocumentJustificatif + audit trail
 */
export interface GeneralDocument {
  // Champs de base (comme DocumentJustificatif)
  url: string;                          // URL Firebase Storage
  nom_original: string;                 // Nom du fichier lors de l'upload
  nom_affichage: string;                // Nom modifiable par l'utilisateur
  type: string;                         // MIME type (application/pdf, image/jpeg, etc.)
  taille: number;                       // Taille en bytes
  date_upload: Date | Timestamp;        // Date de téléversement
  uploaded_by?: string;                 // ID de l'utilisateur qui a uploadé
  uploaded_by_nom?: string;             // Nom de l'utilisateur
  file_hash?: string;                   // Hash SHA-256 du contenu (pour déduplication)

  // Audit trail
  historique?: DocumentAuditEntry[];
}

// User interface
export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  /**
   * @deprecated Utiliser getRole() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getRole}
   */
  role: UserRole;
  /**
   * @deprecated Utiliser getStatus() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').getStatus}
   */
  status: UserStatus;
  /**
   * @deprecated Utiliser isActive() du Field Mapper (@/utils/fieldMapper) au lieu d'accéder directement à ce champ
   * @see {@link import('@/utils/fieldMapper').isActive}
   */
  isActive: boolean;
  clubId: string;
  phoneNumber?: string;
  photoURL?: string;
  isCA?: boolean; // Member of Comité d'Administration (DEPRECATED - use clubStatuten)
  isEncadrant?: boolean; // Diving instructor/supervisor (DEPRECATED - use clubStatuten)
  clubStatuten?: string[]; // Array of club status values (e.g., ["ca", "encadrant"])
  has_app_access?: boolean; // Whether user has access to the application
  is_diver?: boolean; // Whether user is a diver
  has_lifras?: boolean; // Whether user has a LIFRAS ID
  lifras_id?: string; // LIFRAS ID number
  plongeur_niveau?: string; // Diver level (e.g., "Plongeur 1*", "Moniteur Club")
  plongeur_code?: string; // Standardized diver code (e.g., "1", "2", "MC", "MF")
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  lastLogin?: Date | Timestamp;
  metadata?: {
    createdBy?: string;
    activatedBy?: string;
    activatedAt?: Date | Timestamp;
    deactivatedBy?: string;
    deactivatedAt?: Date | Timestamp;
    suspendedBy?: string;
    suspendedAt?: Date | Timestamp;
    suspendedReason?: string;
    /**
     * @deprecated Field created by legacy code - will be removed after migration
     */
    pendingActivation?: boolean;
    deletedAt?: Date | Timestamp;
  };
  preferences?: {
    language?: 'fr' | 'nl' | 'en';
    notifications?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  };
  customPermissions?: Permission[];
  requirePasswordChange?: boolean; // Force user to change password on next login
  cotisation_validite?: Date | Timestamp; // Validité de la cotisation (added per user request)
  membership_category_code?: string; // Code du tarif de cotisation (e.g., "membre_1ere")
  membership_period?: 'jan_dec' | 'sept_dec'; // Période choisie
  membership_season_id?: string; // ID du tarif/saison actif
  certificat_medical_date?: Date | Timestamp; // Date d'édition du certificat médical
  certificat_medical_validite?: Date | Timestamp; // Validité du certificat médical
  documents_medicaux?: MedicalDocument[];         // Certificats médicaux (PDF avec date de validité)
  documents_generaux?: GeneralDocument[];         // Documents généraux (assurance, diplôme, etc.)
  member_status?: 'active' | 'inactive' | 'archived'; // Compatibility with Membre type
  nom?: string; // Compatibility with Membre type (deprecated)
  iban?: string; // IBAN principal
  ibans?: string[]; // Liste des IBANs connus
  has_pending_medical?: boolean; // Flag for pending mobile medical certificates
}

// Audit log types
export type AuditAction =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'USER_SUSPENDED'
  | 'ROLE_CHANGED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_REVOKED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'PASSWORD_RESET'
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_SIGNED'
  | 'TRANSACTION_LINKED'
  | 'TRANSACTION_DELETED'
  | 'DEMAND_CREATED'
  | 'DEMAND_APPROVED'
  | 'DEMAND_REJECTED'
  // Member management actions (membreService)
  | 'member_created'
  | 'member_updated'
  | 'member_deleted'
  | 'member_hard_deleted'
  | 'app_access_granted'
  | 'app_access_revoked'
  | 'app_access_activated'
  | 'app_access_deactivated'
  | 'app_role_changed'
  | 'member_status_changed'
  | 'login';

// Audit log interface
export interface AuditLog {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: AuditAction;
  targetId?: string;
  targetType?: 'user' | 'transaction' | 'demand' | 'event' | 'member';
  targetName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  details?: Record<string, unknown>;
  timestamp: Date | Timestamp;
  ipAddress?: string;
  userAgent?: string;
  clubId?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

// Transaction signature
export interface TransactionSignature {
  userId: string;
  userName: string;
  userRole: UserRole;
  signedAt: Date | Timestamp;
  comment?: string;
}

// Enhanced transaction interface
export interface EnhancedTransaction {
  id: string;
  ownerId: string;
  ownerName?: string;
  clubId: string;
  status: 'draft' | 'pending' | 'signed' | 'linked' | 'completed' | 'rejected';
  amount: number;
  currency: string;
  description: string;
  requiredSignatures: number;
  signatures: TransactionSignature[];
  linkedTo?: {
    type: 'account' | 'project' | 'event' | 'demand';
    id: string;
    name: string;
  };
  rejectedBy?: {
    userId: string;
    userName: string;
    reason: string;
    rejectedAt: Date | Timestamp;
  };
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  completedAt?: Date | Timestamp;
  metadata?: {
    createdBy: string;
    updatedBy?: string;
    completedBy?: string;
  };
}

// Role configuration
export interface RoleConfig {
  role: UserRole;
  label: string;
  description: string;
  level: number; // Hierarchy level (0 = lowest, higher = more permissions)
  permissions: Permission[];
  color: string; // For UI badges
  icon?: string; // Icon name for UI
  canManage: UserRole[]; // Which roles this role can manage
}

// Session information
export interface UserSession {
  user: User;
  token?: string;
  expiresAt?: Date;
  refreshToken?: string;
  permissions: Permission[];
  isEmulator?: boolean;
}

// User creation/update DTOs
export interface CreateUserDTO {
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  app_role?: UserRole;
  clubId: string;
  phoneNumber?: string;
  membership_category_code?: string | null;
  membership_period?: 'jan_dec' | 'sept_dec' | null;
  membership_season_id?: string | null;
  sendWelcomeEmail?: boolean;
  temporaryPassword?: string;
}

export interface UpdateUserDTO {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  photoURL?: string;
  email?: string;
  lifras_id?: string;
  cotisation_validite?: Date | Timestamp;
  certificat_medical_date?: Date | Timestamp;
  certificat_medical_validite?: Date | Timestamp;
  membership_category_code?: string | null;
  membership_period?: 'jan_dec' | 'sept_dec' | null;
  membership_season_id?: string | null;
  isCA?: boolean;
  isEncadrant?: boolean;
  clubStatuten?: string[];
  preferences?: User['preferences'];
}

export interface UpdateUserRoleDTO {
  userId: string;
  newRole: UserRole;
  reason?: string;
  effectiveDate?: Date;
}

export interface ActivateUserDTO {
  userId: string;
  activate: boolean;
  reason?: string;
  sendNotification?: boolean;
}

// Helper type guards
export function isUserActive(user: User): boolean {
  return user.isActive && user.status === 'active';
}

export function hasRole(user: User, role: UserRole | UserRole[]): boolean {
  if (Array.isArray(role)) {
    return role.includes(user.role);
  }
  return user.role === role;
}

export function canManageUser(actor: User, target: User): boolean {
  const hierarchy: Record<UserRole, number> = {
    'membre': -1,
    'user': 0,
    'validateur': 1,
    'admin': 2,
    'superadmin': 3
  };

  const targetLevel = hierarchy[target.role];

  // SuperAdmin can manage anyone
  if (actor.role === 'superadmin') return true;

  // Admin can manage users, membres, and validateurs
  if (actor.role === 'admin' && targetLevel < 2) return true;

  // Others cannot manage users
  return false;
}

// Role display helpers
export const roleLabels: Record<UserRole, string> = {
  'membre': 'Membre',
  'user': 'Utilisateur',
  'validateur': 'Validateur',
  'admin': 'Administrateur',
  'superadmin': 'Super Admin'
};

export const roleColors: Record<UserRole, string> = {
  'membre': 'slate',
  'user': 'gray',
  'validateur': 'blue',
  'admin': 'orange',
  'superadmin': 'purple'
};

export const statusLabels: Record<UserStatus, string> = {
  'pending': 'En attente',
  'active': 'Actif',
  'inactive': 'Inactif',
  'suspended': 'Suspendu',
  'deleted': 'Supprimé'
};

export const statusColors: Record<UserStatus, string> = {
  'pending': 'yellow',
  'active': 'green',
  'inactive': 'gray',
  'suspended': 'red',
  'deleted': 'gray'
};
