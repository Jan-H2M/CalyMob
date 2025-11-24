import { Timestamp } from 'firebase/firestore';

// User roles hierarchy
export type UserRole = 'membre' | 'user' | 'validateur' | 'admin' | 'superadmin';

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

// User interface
export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  clubId: string;
  phoneNumber?: string;
  photoURL?: string;
  isCA?: boolean; // Member of Comité d'Administration (DEPRECATED - use clubStatuten)
  isEncadrant?: boolean; // Diving instructor/supervisor (DEPRECATED - use clubStatuten)
  clubStatuten?: string[]; // Array of club status values (e.g., ["ca", "encadrant"])
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
  };
  preferences?: {
    language?: 'fr' | 'nl' | 'en';
    notifications?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  };
  customPermissions?: Permission[];
  requirePasswordChange?: boolean; // Force user to change password on next login
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
  | 'DEMAND_REJECTED';

// Audit log interface
export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  action: AuditAction;
  targetId?: string;
  targetType?: 'user' | 'transaction' | 'demand' | 'event' | 'member';
  targetName?: string;
  previousValue?: any;
  newValue?: any;
  details?: Record<string, any>;
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
  clubId: string;
  phoneNumber?: string;
  sendWelcomeEmail?: boolean;
  temporaryPassword?: string;
}

export interface UpdateUserDTO {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  photoURL?: string;
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

  const actorLevel = hierarchy[actor.role];
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