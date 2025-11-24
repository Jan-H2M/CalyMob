import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserRole, Permission, RoleConfig } from '@/types/user.types';

/**
 * Structure des paramètres de permissions stockés dans Firebase
 */
export interface PermissionSettings {
  lastUpdated: Date;
  updatedBy?: string;
  roles: Record<UserRole, RoleConfig>;
}

/**
 * Service pour gérer les paramètres de permissions dans Firebase
 * Permet de rendre les permissions configurables dynamiquement
 */
export class PermissionSettingsService {
  private static readonly COLLECTION_PATH = 'settings';
  private static readonly DOCUMENT_ID = 'permissions';

  /**
   * Charger les paramètres de permissions depuis Firebase
   * Retourne la configuration par défaut si aucune n'existe dans Firebase
   */
  static async loadPermissionSettings(clubId: string): Promise<PermissionSettings> {
    try {
      const docRef = doc(db, 'clubs', clubId, this.COLLECTION_PATH, this.DOCUMENT_ID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          lastUpdated: data.lastUpdated?.toDate() || new Date(),
          updatedBy: data.updatedBy,
          roles: data.roles as Record<UserRole, RoleConfig>
        };
      }

      // Si aucune configuration n'existe, retourner et sauvegarder les valeurs par défaut
      const defaultSettings = this.getDefaultPermissions();
      await this.savePermissionSettings(clubId, defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.error('Erreur lors du chargement des permissions depuis Firebase:', error);
      // Fallback sur configuration par défaut
      return this.getDefaultPermissions();
    }
  }

  /**
   * Sauvegarder les paramètres de permissions dans Firebase
   */
  static async savePermissionSettings(
    clubId: string,
    settings: PermissionSettings,
    userId?: string
  ): Promise<void> {
    try {
      // Valider la configuration avant de sauvegarder
      this.validatePermissions(settings);

      const docRef = doc(db, 'clubs', clubId, this.COLLECTION_PATH, this.DOCUMENT_ID);
      await setDoc(docRef, {
        ...settings,
        lastUpdated: serverTimestamp(),
        updatedBy: userId || settings.updatedBy || 'system'
      });

      console.log('Permissions sauvegardées avec succès dans Firebase');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des permissions:', error);
      throw error;
    }
  }

  /**
   * Réinitialiser les permissions aux valeurs par défaut
   */
  static async resetToDefaults(clubId: string, userId?: string): Promise<void> {
    const defaultSettings = this.getDefaultPermissions();
    await this.savePermissionSettings(clubId, defaultSettings, userId);
  }

  /**
   * Obtenir la configuration par défaut des permissions
   * Cette configuration correspond à l'état actuel hardcodé
   */
  static getDefaultPermissions(): PermissionSettings {
    return {
      lastUpdated: new Date(),
      roles: {
        user: {
          role: 'user',
          label: 'Utilisateur',
          description: 'Membre standard - accès limité à ses propres activités et dépenses',
          level: 0,
          color: '#6B7280', // gray-500
          icon: 'User',
          canManage: [],
          permissions: [
            // ❌ REMOVED: 'transactions.view' - users cannot see bank transactions or dashboard
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
          ]
        },
        admin: {
          role: 'admin',
          label: 'Administrateur',
          description: 'Administrateur avec gestion des utilisateurs',
          level: 2,
          color: '#F97316', // orange-500
          icon: 'Shield',
          canManage: ['user', 'validateur'],
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
          canManage: ['user', 'validateur', 'admin', 'superadmin'],
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
      }
    };
  }

  /**
   * Valider la cohérence de la configuration des permissions
   * Lance une erreur si la configuration est invalide
   */
  static validatePermissions(settings: PermissionSettings): void {
    // Vérifier que tous les rôles sont présents
    const requiredRoles: MembreRole[] = ['user', 'validateur', 'admin', 'superadmin'];
    for (const role of requiredRoles) {
      if (!settings.roles[role]) {
        throw new Error(`Rôle manquant: ${role}`);
      }
    }

    // Vérifier que SuperAdmin a toujours toutes les permissions
    const superadminPerms = settings.roles.superadmin.permissions;
    const criticalPermissions: Permission[] = [
      'users.view',
      'users.assignRole',
      'settings.manage'
    ];

    for (const perm of criticalPermissions) {
      if (!superadminPerms.includes(perm)) {
        throw new Error(`SuperAdmin doit avoir la permission: ${perm}`);
      }
    }

    // Vérifier qu'au moins un rôle peut gérer les utilisateurs
    const hasUserManagement = Object.values(settings.roles).some(
      role => role.permissions.includes('users.view') && role.permissions.includes('users.assignRole')
    );

    if (!hasUserManagement) {
      throw new Error('Au moins un rôle doit pouvoir gérer les utilisateurs');
    }

    // Vérifier la hiérarchie des niveaux
    if (settings.roles.user.level !== 0) {
      throw new Error('Le rôle "user" doit avoir le niveau 0');
    }

    if (settings.roles.superadmin.level <= settings.roles.admin.level) {
      throw new Error('SuperAdmin doit avoir un niveau supérieur à Admin');
    }

    console.log('✅ Configuration des permissions validée avec succès');
  }

  /**
   * Obtenir une configuration prédéfinie (preset)
   */
  static getPreset(presetName: 'standard' | 'strict' | 'collaboratif' | 'ouvert'): PermissionSettings {
    const base = this.getDefaultPermissions();

    switch (presetName) {
      case 'strict':
        // User en lecture seule uniquement (propres données seulement)
        base.roles.user.permissions = [
          'demands.view',  // Own demands only
          'events.view'    // Own events only
        ];
        base.roles.user.description = 'Membre standard - lecture seule de ses propres données';
        break;

      case 'collaboratif':
        // User peut créer et gérer (propres données uniquement)
        base.roles.user.permissions = [
          'demands.view',        // Own demands only
          'demands.create',
          'demands.update',      // Own demands only
          'events.view',         // Own events only
          'events.create',
          'events.manage'        // Own events only
        ];
        base.roles.user.description = 'Membre standard - peut créer et gérer ses propres données';
        break;

      case 'ouvert':
        // Validateur a aussi accès settings (mais pas users)
        base.roles.validateur.permissions.push('settings.view');
        base.roles.validateur.description = 'Accès quasi-complet (sauf gestion utilisateurs)';
        break;

      case 'standard':
      default:
        // Configuration par défaut (déjà définie)
        break;
    }

    return base;
  }

  /**
   * Comparer deux configurations et retourner les différences
   */
  static comparePermissions(
    current: PermissionSettings,
    proposed: PermissionSettings
  ): {
    role: MembreRole;
    changes: { permission: Permission; action: 'added' | 'removed' }[];
  }[] {
    const differences: {
      role: MembreRole;
      changes: { permission: Permission; action: 'added' | 'removed' }[];
    }[] = [];

    for (const role of Object.keys(current.roles) as UserRole[]) {
      const currentPerms = new Set(current.roles[role].permissions);
      const proposedPerms = new Set(proposed.roles[role].permissions);

      const changes: { permission: Permission; action: 'added' | 'removed' }[] = [];

      // Permissions ajoutées
      for (const perm of proposedPerms) {
        if (!currentPerms.has(perm)) {
          changes.push({ permission: perm, action: 'added' });
        }
      }

      // Permissions retirées
      for (const perm of currentPerms) {
        if (!proposedPerms.has(perm)) {
          changes.push({ permission: perm, action: 'removed' });
        }
      }

      if (changes.length > 0) {
        differences.push({ role, changes });
      }
    }

    return differences;
  }
}
