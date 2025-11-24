import { UserRole, Permission, RoleConfig, RuleEnforcedPermission } from '@/types/user.types';
import { Membre } from '@/types';
import { PermissionSettingsService } from './permissionSettingsService';

/**
 * Rule-Enforced Permissions
 * Defines which permissions are enforced by Firestore security rules
 * These permissions have special restrictions that cannot be changed via UI
 */
export const RULE_ENFORCED_PERMISSIONS: RuleEnforcedPermission[] = [
  // Transactions - BLOCKED for 'user' role
  {
    permission: 'transactions.view',
    affectedRoles: ['user'],
    enforcementType: 'BLOCKED',
    reason: 'Les utilisateurs ne peuvent pas accéder aux transactions bancaires',
    firestoreRule: 'firestore.rules:108-115 (transactions_bancaires read rule)'
  },
  {
    permission: 'transactions.create',
    affectedRoles: ['user'],
    enforcementType: 'BLOCKED',
    reason: 'Les utilisateurs ne peuvent pas créer de transactions bancaires',
    firestoreRule: 'firestore.rules:111-114 (transactions_bancaires create rule)'
  },
  {
    permission: 'transactions.update',
    affectedRoles: ['user'],
    enforcementType: 'BLOCKED',
    reason: 'Les utilisateurs ne peuvent pas modifier les transactions bancaires',
    firestoreRule: 'firestore.rules:111-114 (transactions_bancaires update rule)'
  },
  {
    permission: 'transactions.delete',
    affectedRoles: ['user'],
    enforcementType: 'BLOCKED',
    reason: 'Les utilisateurs ne peuvent pas supprimer les transactions bancaires',
    firestoreRule: 'firestore.rules:115 (transactions_bancaires delete rule)'
  },
  {
    permission: 'transactions.sign',
    affectedRoles: ['user'],
    enforcementType: 'BLOCKED',
    reason: 'Les utilisateurs ne peuvent pas signer les transactions bancaires',
    firestoreRule: 'firestore.rules:108-115 (transactions_bancaires rules)'
  },
  {
    permission: 'transactions.link',
    affectedRoles: ['user'],
    enforcementType: 'BLOCKED',
    reason: 'Les utilisateurs ne peuvent pas lier les transactions bancaires',
    firestoreRule: 'firestore.rules:108-115 (transactions_bancaires rules)'
  },

  // Demands - SCOPED for 'user' role (own demands only)
  {
    permission: 'demands.view',
    affectedRoles: ['user'],
    enforcementType: 'SCOPED',
    reason: 'Les utilisateurs ne peuvent voir que leurs propres demandes (filtrées par demandeur_id)',
    firestoreRule: 'firestore.rules:130-135 (demandes_remboursement read rule with demandeur_id check)'
  },
  {
    permission: 'demands.update',
    affectedRoles: ['user'],
    enforcementType: 'SCOPED',
    reason: 'Les utilisateurs ne peuvent modifier que leurs propres demandes non approuvées',
    firestoreRule: 'firestore.rules:144-154 (demandes_remboursement update rule with demandeur_id check)'
  },

  // Events - SCOPED for 'user' role (own events only, type 'evenement' only)
  {
    permission: 'events.view',
    affectedRoles: ['user'],
    enforcementType: 'SCOPED',
    reason: 'Les utilisateurs ne peuvent voir que leurs propres événements (filtrés par organisateur_id)',
    firestoreRule: 'firestore.rules:171-176 (operations read rule with organisateur_id check)'
  },
  {
    permission: 'events.create',
    affectedRoles: ['user'],
    enforcementType: 'SCOPED',
    reason: 'Les utilisateurs ne peuvent créer que des événements (type "evenement" uniquement)',
    firestoreRule: 'firestore.rules:179-186 (operations create rule with type check)'
  },
  {
    permission: 'events.manage',
    affectedRoles: ['user'],
    enforcementType: 'SCOPED',
    reason: 'Les utilisateurs ne peuvent gérer que leurs propres événements (type "evenement" uniquement)',
    firestoreRule: 'firestore.rules:189-199 (operations update rule with organisateur_id + type check)'
  },
  {
    permission: 'events.delete',
    affectedRoles: ['user'],
    enforcementType: 'SCOPED',
    reason: 'Les utilisateurs ne peuvent supprimer que leurs propres événements',
    firestoreRule: 'firestore.rules:202-207 (operations delete rule with organisateur_id check)'
  }
];

/**
 * Permission Service
 * Manages roles and permissions with dynamic loading from Firebase
 * Falls back to hardcoded defaults if Firebase unavailable
 */
export class PermissionService {
  // Role configurations with permissions (loaded dynamically)
  private static roleConfigs: Record<UserRole, RoleConfig> = {};
  private static isInitialized = false;
  private static initializationPromise: Promise<void> | null = null;

  /**
   * Initialize permissions from Firebase
   * Should be called once at app startup or user login
   */
  static async initialize(clubId: string): Promise<void> {
    // If already initializing, return existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // If already initialized, skip
    if (this.isInitialized) {
      return Promise.resolve();
    }

    this.initializationPromise = (async () => {
      try {
        console.log('🔄 Initializing permissions from Firebase...');
        const settings = await PermissionSettingsService.loadPermissionSettings(clubId);
        this.roleConfigs = settings.roles;
        this.isInitialized = true;
        console.log('✅ Permissions initialized from Firebase');
      } catch (error) {
        console.error('❌ Failed to initialize permissions from Firebase, using defaults:', error);
        this.roleConfigs = this.getDefaultRoleConfigs();
        this.isInitialized = true;
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Force reload permissions from Firebase
   * Useful after permission settings have been updated
   */
  static async reload(clubId: string): Promise<void> {
    this.isInitialized = false;
    this.initializationPromise = null;
    await this.initialize(clubId);
  }

  /**
   * Get default role configurations (hardcoded fallback)
   * This serves as a fallback if Firebase is unavailable
   */
  private static getDefaultRoleConfigs(): Record<UserRole, RoleConfig> {
    return {
    membre: {
      role: 'membre',
      label: 'Membre',
      description: 'Membre du club (sans accès application)',
      level: -1,
      color: '#64748B', // slate-500
      icon: 'Users',
      canManage: [],
      permissions: [] // Aucune permission - juste membership
    },
    user: {
      role: 'user',
      label: 'Utilisateur',
      description: 'Membre standard - accès limité à ses propres activités et dépenses',
      level: 0,
      color: '#6B7280', // gray-500
      icon: 'User',
      canManage: [],
      permissions: [
        // ❌ REMOVED: 'transactions.view' - users cannot see bank transactions
        'demands.view',        // ✅ But scoped to own demands only (via Firestore rules)
        'demands.create',      // ✅ Can create own demands
        'demands.update',      // ✅ But only own demands (via Firestore rules)
        'events.view',         // ✅ But scoped to own events only (via Firestore rules)
        'events.create',       // ✅ Can create own events (type 'evenement' only)
        'events.manage'        // ✅ But only own events (via Firestore rules)
      ]
    },
    validateur: {
      role: 'validateur',
      label: 'Validateur',
      description: 'Accès complet aux opérations (sauf gestion utilisateurs et paramètres)',
      level: 1,
      color: '#3B82F6', // blue-500
      icon: 'Shield',
      canManage: [],
      permissions: [
        // Dashboard
        'dashboard.view',
        // Transactions
        'transactions.view',
        'transactions.create',
        'transactions.update',
        'transactions.sign',
        'transactions.link',
        'transactions.delete',
        // Demands
        'demands.view',
        'demands.create',
        'demands.update',
        'demands.approve',
        'demands.reject',
        'demands.delete',
        'demands.addDocument',
        'demands.deleteDocument',
        // Events
        'events.view',
        'events.create',
        'events.manage',
        'events.delete',
        // Reports
        'reports.view',
        'reports.export',
        'reports.create'
        // NO settings access
      ]
    },
    admin: {
      role: 'admin',
      label: 'Administrateur',
      description: 'Administrateur avec gestion des utilisateurs',
      level: 2,
      color: '#F97316', // orange-500
      icon: 'Shield',
      canManage: ['membre', 'user', 'validateur'],
      permissions: [
        // All permissions except superadmin specific
        'users.view',
        'users.create',
        'users.update',
        'users.activate',
        'users.assignRole',
        'dashboard.view',
        'transactions.view',
        'transactions.create',
        'transactions.update',
        'transactions.sign',
        'transactions.link',
        'transactions.delete',
        'demands.view',
        'demands.create',
        'demands.update',
        'demands.approve',
        'demands.reject',
        'demands.delete',
        'demands.addDocument',
        'demands.deleteDocument',
        'events.view',
        'events.create',
        'events.manage',
        'events.delete',
        'audit.view',
        'reports.view',
        'reports.export',
        'reports.create',
        'settings.view',
        'settings.manage'
      ]
    },
    superadmin: {
      role: 'superadmin',
      label: 'Super Administrateur',
      description: 'Accès complet au système',
      level: 3,
      color: '#9333EA', // purple-600
      icon: 'Crown',
      canManage: ['membre', 'user', 'validateur', 'admin', 'superadmin'],
      permissions: [
        // All permissions
        'users.view',
        'users.create',
        'users.update',
        'users.delete',
        'users.activate',
        'users.assignRole',
        'dashboard.view',
        'transactions.view',
        'transactions.create',
        'transactions.update',
        'transactions.sign',
        'transactions.link',
        'transactions.delete',
        'demands.view',
        'demands.create',
        'demands.update',
        'demands.approve',
        'demands.reject',
        'demands.delete',
        'demands.addDocument',
        'demands.deleteDocument',
        'events.view',
        'events.create',
        'events.manage',
        'events.delete',
        'audit.view',
        'reports.view',
        'reports.export',
        'reports.create',
        'settings.view',
        'settings.manage'
      ]
    }
    };
  }

  /**
   * Get role configuration
   */
  static getRoleConfig(role: UserRole): RoleConfig {
    if (!this.isInitialized) {
      console.warn('⚠️ Permissions not initialized, using defaults');
      this.roleConfigs = this.getDefaultRoleConfigs();
      this.isInitialized = true;
    }
    return this.roleConfigs[role];
  }

  /**
   * Check if permissions are initialized
   */
  static isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get all role configurations
   * Ensures permissions are initialized before returning
   */
  static getAllRoleConfigs(): RoleConfig[] {
    if (!this.isInitialized) {
      console.warn('⚠️ Permissions not initialized, using defaults');
      this.roleConfigs = this.getDefaultRoleConfigs();
      this.isInitialized = true;
    }
    return Object.values(this.roleConfigs);
  }

  /**
   * Check if a user has a specific permission
   */
  static hasPermission(user: Membre | null, permission: Permission): boolean {
    if (!user) return false;

    // Check if user is active (support both old and new field names)
    const isActive = user.member_status === 'active' || user.app_status === 'active' || user.isActive === true;
    if (!isActive) return false;

    // Get role (support both old and new field names)
    const userRole = user.app_role || user.role;
    if (!userRole) return false;

    const roleConfig = this.getRoleConfig(userRole);

    // Check role permissions
    if (roleConfig.permissions.includes(permission)) {
      return true;
    }

    // Check custom permissions if any
    if (user.customPermissions?.includes(permission)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a user has any of the specified permissions
   */
  static hasAnyPermission(user: Membre | null, permissions: Permission[]): boolean {
    if (!user) return false;

    return permissions.some(permission => this.hasPermission(user, permission));
  }

  /**
   * Check if a user has all of the specified permissions
   */
  static hasAllPermissions(user: Membre | null, permissions: Permission[]): boolean {
    if (!user) return false;

    return permissions.every(permission => this.hasPermission(user, permission));
  }

  /**
   * Get all permissions for a role
   */
  static getRolePermissions(role: UserRole): Permission[] {
    return this.roleConfigs[role].permissions;
  }

  /**
   * Get all permissions for a user (including custom)
   */
  static getUserPermissions(user: Membre): Permission[] {
    // Support both new (app_role) and legacy (role) fields
    const userRole = user.app_role || user.role || 'user';
    const rolePermissions = this.getRolePermissions(userRole);
    const customPermissions = user.customPermissions || [];

    // Combine and deduplicate
    return [...new Set([...rolePermissions, ...customPermissions])];
  }

  /**
   * Check if a user can manage another user based on role hierarchy
   */
  static canManageUser(actor: Membre | null, targetRole: UserRole): boolean {
    if (!actor || (!actor.isActive && !actor.actif)) return false;
    
    // SuperAdmin can manage anyone
    const actorRole = actor.app_role || actor.role || 'user';
    if (actorRole === 'superadmin') return true;

    const actorConfig = this.getRoleConfig(actorRole);
    return actorConfig.canManage.includes(targetRole);
  }

  /**
   * Check if a user can assign a specific role
   */
  static canAssignRole(actor: Membre | null, roleToAssign: UserRole): boolean {
    if (!actor || (!actor.isActive && !actor.actif)) return false;
    
    // Only admins and superadmins can assign roles
    if (!this.hasPermission(actor, 'users.assignRole')) return false;
    
    // Check if actor can manage this role
    return this.canManageUser(actor, roleToAssign);
  }

  /**
   * Check if a user can perform an action on a target user
   */
  static canPerformAction(
    actor: User | null, 
    target: User, 
    action: 'activate' | 'deactivate' | 'edit' | 'delete' | 'assignRole'
  ): boolean {
    if (!actor || !actor.isActive) return false;
    
    // User cannot perform actions on themselves (except edit)
    if (actor.id === target.id && action !== 'edit') return false;
    
    // Check specific permissions
    switch (action) {
      case 'activate':
      case 'deactivate':
        return this.hasPermission(actor, 'users.activate') && 
               this.canManageUser(actor, target.role);
      
      case 'edit':
        // Users can edit their own profile
        if (actor.id === target.id) return true;
        return this.hasPermission(actor, 'users.update') && 
               this.canManageUser(actor, target.role);
      
      case 'delete':
        return this.hasPermission(actor, 'users.delete') && 
               this.canManageUser(actor, target.role);
      
      case 'assignRole':
        return this.hasPermission(actor, 'users.assignRole') && 
               this.canManageUser(actor, target.role);
      
      default:
        return false;
    }
  }

  /**
   * Get the role hierarchy level
   */
  static getRoleLevel(role: UserRole): number {
    return this.roleConfigs[role].level;
  }

  /**
   * Compare two roles by hierarchy
   */
  static compareRoles(role1: UserRole, role2: UserRole): number {
    return this.getRoleLevel(role1) - this.getRoleLevel(role2);
  }

  /**
   * Check if a role is higher than another
   */
  static isRoleHigher(role1: UserRole, role2: UserRole): boolean {
    return this.getRoleLevel(role1) > this.getRoleLevel(role2);
  }

  /**
   * Get roles that a user can assign
   */
  static getAssignableRoles(user: Membre | null): UserRole[] {
    if (!user || !user.isActive) return [];
    
    const userConfig = this.getRoleConfig(user.role);
    return userConfig.canManage;
  }

  /**
   * Filter permissions by category
   */
  static getPermissionsByCategory(category: 'users' | 'transactions' | 'demands' | 'events' | 'audit' | 'settings' | 'reports'): Permission[] {
    const allPermissions: Permission[] = [
      'users.view', 'users.create', 'users.update', 'users.delete', 'users.activate', 'users.assignRole',
      'transactions.view', 'transactions.create', 'transactions.update', 'transactions.sign', 'transactions.link', 'transactions.delete',
      'demands.view', 'demands.create', 'demands.update', 'demands.approve', 'demands.reject', 'demands.delete', 'demands.addDocument', 'demands.deleteDocument',
      'events.view', 'events.create', 'events.manage', 'events.delete',
      'audit.view',
      'settings.view', 'settings.manage',
      'reports.view', 'reports.export', 'reports.create'
    ];

    return allPermissions.filter(p => p.startsWith(category + '.'));
  }

  /**
   * Get a user-friendly label for a permission
   */
  static getPermissionLabel(permission: Permission): string {
    const labels: Record<Permission, string> = {
      'users.view': 'Voir les utilisateurs',
      'users.create': 'Créer des utilisateurs',
      'users.update': 'Modifier les utilisateurs',
      'users.delete': 'Supprimer des utilisateurs',
      'users.activate': 'Activer/Désactiver des utilisateurs',
      'users.assignRole': 'Attribuer des rôles',
      'transactions.view': 'Voir les transactions',
      'transactions.create': 'Créer des transactions',
      'transactions.update': 'Modifier des transactions',
      'transactions.sign': 'Signer des transactions',
      'transactions.link': 'Lier des transactions',
      'transactions.delete': 'Supprimer des transactions',
      'demands.view': 'Voir les demandes',
      'demands.create': 'Créer des demandes',
      'demands.update': 'Modifier les demandes',
      'demands.approve': 'Approuver les demandes',
      'demands.reject': 'Rejeter les demandes',
      'demands.delete': 'Supprimer des demandes',
      'demands.addDocument': 'Ajouter des documents',
      'demands.deleteDocument': 'Supprimer des documents',
      'events.view': 'Voir les événements',
      'events.create': 'Créer des événements',
      'events.manage': 'Gérer les événements',
      'events.delete': 'Supprimer des événements',
      'audit.view': 'Voir les journaux d\'audit',
      'settings.view': 'Voir les paramètres',
      'settings.manage': 'Gérer les paramètres',
      'reports.view': 'Voir les rapports',
      'reports.export': 'Exporter les rapports',
      'reports.create': 'Créer des rapports'
    };

    return labels[permission] || permission;
  }

  /**
   * Check if a user needs double approval for transactions
   */
  static requiresDoubleApproval(user: Membre, amount: number, threshold: number = 100): boolean {
    // Only applies to non-admin roles
    if (user.role === 'admin' || user.role === 'superadmin') {
      return false;
    }

    return Math.abs(amount) > threshold;
  }

  /**
   * Get rule enforcement info for a permission and role
   * Returns null if permission is not rule-enforced
   */
  static getRuleEnforcement(permission: Permission, role: UserRole): RuleEnforcedPermission | null {
    return RULE_ENFORCED_PERMISSIONS.find(
      rp => rp.permission === permission && rp.affectedRoles.includes(role)
    ) || null;
  }

  /**
   * Check if a permission is rule-enforced for a role
   */
  static isRuleEnforced(permission: Permission, role: UserRole): boolean {
    return this.getRuleEnforcement(permission, role) !== null;
  }

  /**
   * Get all rule-enforced permissions for a role
   */
  static getRuleEnforcedPermissions(role: UserRole): RuleEnforcedPermission[] {
    return RULE_ENFORCED_PERMISSIONS.filter(rp => rp.affectedRoles.includes(role));
  }

  /**
   * Get badge color for role (Tailwind classes)
   */
  static getRoleBadgeClass(role: UserRole): string {
    const classes = {
      'user': 'bg-gray-100 text-gray-700',
      'validateur': 'bg-blue-100 text-blue-700',
      'admin': 'bg-orange-100 text-orange-700',
      'superadmin': 'bg-purple-100 text-purple-700'
    };

    return classes[role] || 'bg-gray-100 text-gray-700';
  }

  /**
   * Get status badge color (Tailwind classes)
   */
  static getStatusBadgeClass(isActive: boolean): string {
    return isActive 
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700';
  }
}