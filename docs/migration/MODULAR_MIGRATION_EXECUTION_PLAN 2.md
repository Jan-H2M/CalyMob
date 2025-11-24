# Plan d'Exécution Détaillé : Migration Modulaire Complète

## 📋 Vue d'Ensemble
- **Objectif** : Transformer CalyCompta en architecture 100% modulaire
- **Durée estimée** : 15-20 jours
- **Approche** : Migration progressive avec rétrocompatibilité
- **Priorité** : Stabilité et non-régression

---

## PHASE 1 : INFRASTRUCTURE DE BASE (3 jours)

### 📁 Phase 1.1 : Types et Interfaces TypeScript

#### Étape 1.1.1 : Créer le fichier de types modulaires
**Fichier** : `src/types/module.types.ts`

```typescript
// Types de base pour l'architecture modulaire
export interface ModuleDefinition {
  // Identification
  id: string;                          // Identifiant unique du module
  name: string;                        // Nom affiché
  description: string;                 // Description détaillée
  icon: string;                        // Icône Lucide React
  version: string;                     // Version du module

  // Classification
  category: 'core' | 'finance' | 'operations' | 'communication' | 'admin' | 'extension';
  isCore: boolean;                     // Module système non désactivable
  isActive: boolean;                   // État d'activation

  // Dépendances
  dependencies?: string[];              // Modules requis
  incompatibleWith?: string[];         // Modules incompatibles

  // Métadonnées
  author?: string;
  createdAt: Date;
  updatedAt?: Date;
  installedAt?: Date;
  installedBy?: string;
}

export interface ModuleSettings {
  [category: string]: {
    [key: string]: SettingDefinition;
  };
}

export interface SettingDefinition {
  key: string;
  label: string;
  description?: string;
  type: 'boolean' | 'number' | 'string' | 'select' | 'multiselect' | 'json' | 'date' | 'color';
  defaultValue: any;
  required?: boolean;
  validation?: SettingValidation;
  options?: Array<{ value: any; label: string }>;  // Pour select/multiselect
  dependsOn?: string;                              // Dépendance conditionnelle
  category?: string;                               // Groupe de paramètres
  advanced?: boolean;                              // Paramètre avancé
}

export interface SettingValidation {
  min?: number;
  max?: number;
  pattern?: string;
  custom?: (value: any) => boolean | string;
}

export interface ModulePermission {
  id: string;                          // permission.id unique dans le module
  label: string;                       // Nom affiché
  description: string;                 // Description détaillée
  category: 'view' | 'create' | 'update' | 'delete' | 'manage' | 'admin';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresCondition?: string;          // Condition supplémentaire
  impliedPermissions?: string[];       // Permissions incluses
}

export interface ModulePermissions {
  [category: string]: ModulePermission[];
}

export interface ModuleConfig {
  // Routes
  routes: ModuleRoute[];

  // Navigation
  menuItems: ModuleMenuItem[];

  // Widgets dashboard
  widgets?: ModuleWidget[];

  // Hooks et événements
  hooks?: ModuleHooks;

  // API endpoints
  apiEndpoints?: ModuleApiEndpoint[];

  // Tâches planifiées
  scheduledTasks?: ModuleScheduledTask[];
}

export interface ModuleRoute {
  path: string;
  component: string;
  permission?: string;
  exact?: boolean;
  props?: Record<string, any>;
}

export interface ModuleMenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  permission?: string;
  badge?: { type: 'count' | 'new' | 'alert'; value?: number | string };
  subItems?: ModuleMenuItem[];
  position?: number;
}

export interface ModuleWidget {
  id: string;
  component: string;
  position: 'dashboard' | 'sidebar' | 'header';
  permission?: string;
  defaultSize?: { w: number; h: number };
  resizable?: boolean;
}

export interface ModuleHooks {
  onInstall?: string;         // Fonction à exécuter à l'installation
  onUninstall?: string;       // Fonction à exécuter à la désinstallation
  onEnable?: string;          // Fonction à exécuter à l'activation
  onDisable?: string;         // Fonction à exécuter à la désactivation
  onUpdate?: string;          // Fonction à exécuter à la mise à jour
}

export interface ModuleApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: string;
  permission?: string;
  rateLimit?: number;
}

export interface ModuleScheduledTask {
  id: string;
  name: string;
  schedule: string;           // Cron expression
  handler: string;
  enabled: boolean;
}

// Instance d'un module pour un club
export interface ModuleInstance {
  moduleId: string;
  clubId: string;
  settings: Record<string, any>;
  permissions: Record<string, string[]>;  // roleId -> permissions[]
  isActive: boolean;
  installedAt: Date;
  installedBy: string;
  lastUpdated?: Date;
  lastUpdatedBy?: string;
  customData?: Record<string, any>;
}

// Rôle avec permissions modulaires
export interface ModularRole {
  id: string;
  clubId: string;
  name: string;
  description: string;
  level: number;
  color: string;
  icon: string;
  isSystem: boolean;
  isActive: boolean;

  // Permissions par module
  modulePermissions: {
    [moduleId: string]: string[];  // Liste des permissions pour ce module
  };

  // Hiérarchie
  canManage: string[];              // Rôles que ce rôle peut gérer

  // Métadonnées
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
}

// Export pour compatibilité
export type ModuleId = string;
export type PermissionId = string;
export type RoleId = string;
```

#### Étape 1.1.2 : Créer les types de migration
**Fichier** : `src/types/migration.types.ts`

```typescript
export interface MigrationStep {
  id: string;
  name: string;
  description: string;
  execute: () => Promise<void>;
  rollback?: () => Promise<void>;
  validate?: () => Promise<boolean>;
  estimatedDuration?: number;  // en secondes
}

export interface MigrationPlan {
  id: string;
  version: string;
  steps: MigrationStep[];
  beforeMigration?: () => Promise<void>;
  afterMigration?: () => Promise<void>;
  rollbackPlan?: () => Promise<void>;
}

export interface MigrationStatus {
  planId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  currentStep?: string;
  progress: number;  // 0-100
  startedAt?: Date;
  completedAt?: Date;
  errors?: string[];
  logs: MigrationLog[];
}

export interface MigrationLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
}
```

### 📦 Phase 1.2 : Service Principal des Modules

#### Étape 1.2.1 : Créer le ModuleService
**Fichier** : `src/services/core/moduleService.ts`

```typescript
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  ModuleDefinition,
  ModuleInstance,
  ModuleSettings,
  ModulePermissions,
  ModularRole
} from '@/types/module.types';

export class ModuleService {
  private static instance: ModuleService;
  private modules: Map<string, ModuleDefinition> = new Map();
  private moduleInstances: Map<string, ModuleInstance> = new Map();
  private roles: Map<string, ModularRole> = new Map();
  private currentClubId?: string;

  private constructor() {}

  static getInstance(): ModuleService {
    if (!ModuleService.instance) {
      ModuleService.instance = new ModuleService();
    }
    return ModuleService.instance;
  }

  // ========== Initialisation ==========

  async initialize(clubId: string): Promise<void> {
    this.currentClubId = clubId;

    try {
      // Charger les définitions de modules
      await this.loadModuleDefinitions();

      // Charger les instances de modules pour ce club
      await this.loadModuleInstances(clubId);

      // Charger les rôles modulaires
      await this.loadModularRoles(clubId);

      // Vérifier les mises à jour
      await this.checkForUpdates();

      console.log(`ModuleService initialized for club ${clubId}`);
    } catch (error) {
      console.error('Failed to initialize ModuleService:', error);
      throw error;
    }
  }

  // ========== Gestion des Modules ==========

  async loadModuleDefinitions(): Promise<void> {
    // Charger depuis la collection globale des modules
    const modulesRef = collection(db, 'module_definitions');
    const snapshot = await getDocs(modulesRef);

    this.modules.clear();
    snapshot.forEach((doc) => {
      const module = { id: doc.id, ...doc.data() } as ModuleDefinition;
      this.modules.set(module.id, module);
    });
  }

  async loadModuleInstances(clubId: string): Promise<void> {
    const instancesRef = collection(db, `clubs/${clubId}/modules`);
    const snapshot = await getDocs(instancesRef);

    this.moduleInstances.clear();
    snapshot.forEach((doc) => {
      const instance = { moduleId: doc.id, ...doc.data() } as ModuleInstance;
      this.moduleInstances.set(instance.moduleId, instance);
    });
  }

  async installModule(
    clubId: string,
    moduleId: string,
    initialSettings?: Record<string, any>
  ): Promise<void> {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    // Vérifier les dépendances
    if (module.dependencies) {
      for (const depId of module.dependencies) {
        if (!this.isModuleInstalled(depId)) {
          throw new Error(`Dependency ${depId} must be installed first`);
        }
      }
    }

    // Vérifier les incompatibilités
    if (module.incompatibleWith) {
      for (const incompId of module.incompatibleWith) {
        if (this.isModuleInstalled(incompId)) {
          throw new Error(`Module ${incompId} is incompatible with ${moduleId}`);
        }
      }
    }

    // Créer l'instance du module
    const instance: ModuleInstance = {
      moduleId,
      clubId,
      settings: initialSettings || this.getDefaultSettings(module),
      permissions: this.getDefaultPermissions(module),
      isActive: true,
      installedAt: new Date(),
      installedBy: this.getCurrentUserId(),
    };

    // Sauvegarder dans Firebase
    const batch = writeBatch(db);

    // Instance du module
    const instanceRef = doc(db, `clubs/${clubId}/modules/${moduleId}`);
    batch.set(instanceRef, {
      ...instance,
      installedAt: serverTimestamp(),
    });

    // Créer les collections de données du module
    await this.createModuleDataStructure(clubId, moduleId);

    // Exécuter le hook d'installation si présent
    if (module.config?.hooks?.onInstall) {
      await this.executeHook(module.config.hooks.onInstall, { clubId, moduleId });
    }

    await batch.commit();

    // Mettre à jour le cache local
    this.moduleInstances.set(moduleId, instance);

    console.log(`Module ${moduleId} installed successfully for club ${clubId}`);
  }

  async uninstallModule(clubId: string, moduleId: string): Promise<void> {
    const module = this.modules.get(moduleId);
    const instance = this.moduleInstances.get(moduleId);

    if (!module || !instance) {
      throw new Error(`Module ${moduleId} is not installed`);
    }

    if (module.isCore) {
      throw new Error(`Core module ${moduleId} cannot be uninstalled`);
    }

    // Vérifier si d'autres modules en dépendent
    for (const [otherId, otherModule] of this.modules) {
      if (otherModule.dependencies?.includes(moduleId) &&
          this.isModuleInstalled(otherId)) {
        throw new Error(`Module ${otherId} depends on ${moduleId}`);
      }
    }

    // Exécuter le hook de désinstallation
    if (module.config?.hooks?.onUninstall) {
      await this.executeHook(module.config.hooks.onUninstall, { clubId, moduleId });
    }

    // Supprimer l'instance
    await deleteDoc(doc(db, `clubs/${clubId}/modules/${moduleId}`));

    // Optionnel : archiver les données au lieu de les supprimer
    await this.archiveModuleData(clubId, moduleId);

    this.moduleInstances.delete(moduleId);

    console.log(`Module ${moduleId} uninstalled from club ${clubId}`);
  }

  async enableModule(clubId: string, moduleId: string): Promise<void> {
    const instance = this.moduleInstances.get(moduleId);
    if (!instance) {
      throw new Error(`Module ${moduleId} is not installed`);
    }

    if (instance.isActive) {
      return; // Déjà actif
    }

    const module = this.modules.get(moduleId);

    // Exécuter le hook d'activation
    if (module?.config?.hooks?.onEnable) {
      await this.executeHook(module.config.hooks.onEnable, { clubId, moduleId });
    }

    await updateDoc(doc(db, `clubs/${clubId}/modules/${moduleId}`), {
      isActive: true,
      lastUpdated: serverTimestamp(),
      lastUpdatedBy: this.getCurrentUserId(),
    });

    instance.isActive = true;

    console.log(`Module ${moduleId} enabled for club ${clubId}`);
  }

  async disableModule(clubId: string, moduleId: string): Promise<void> {
    const instance = this.moduleInstances.get(moduleId);
    const module = this.modules.get(moduleId);

    if (!instance || !module) {
      throw new Error(`Module ${moduleId} is not installed`);
    }

    if (module.isCore) {
      throw new Error(`Core module ${moduleId} cannot be disabled`);
    }

    if (!instance.isActive) {
      return; // Déjà inactif
    }

    // Exécuter le hook de désactivation
    if (module.config?.hooks?.onDisable) {
      await this.executeHook(module.config.hooks.onDisable, { clubId, moduleId });
    }

    await updateDoc(doc(db, `clubs/${clubId}/modules/${moduleId}`), {
      isActive: false,
      lastUpdated: serverTimestamp(),
      lastUpdatedBy: this.getCurrentUserId(),
    });

    instance.isActive = false;

    console.log(`Module ${moduleId} disabled for club ${clubId}`);
  }

  // ========== Gestion des Paramètres ==========

  async getModuleSettings(moduleId: string): Promise<Record<string, any>> {
    const instance = this.moduleInstances.get(moduleId);
    if (!instance) {
      throw new Error(`Module ${moduleId} is not installed`);
    }
    return instance.settings;
  }

  async updateModuleSettings(
    clubId: string,
    moduleId: string,
    settings: Record<string, any>
  ): Promise<void> {
    const instance = this.moduleInstances.get(moduleId);
    const module = this.modules.get(moduleId);

    if (!instance || !module) {
      throw new Error(`Module ${moduleId} is not installed`);
    }

    // Valider les paramètres
    this.validateSettings(module, settings);

    await updateDoc(doc(db, `clubs/${clubId}/modules/${moduleId}`), {
      settings,
      lastUpdated: serverTimestamp(),
      lastUpdatedBy: this.getCurrentUserId(),
    });

    instance.settings = settings;

    console.log(`Settings updated for module ${moduleId}`);
  }

  private validateSettings(
    module: ModuleDefinition,
    settings: Record<string, any>
  ): void {
    // Parcourir toutes les définitions de paramètres
    if (!module.settings) return;

    for (const category of Object.keys(module.settings)) {
      for (const setting of Object.values(module.settings[category])) {
        const value = settings[setting.key];

        // Vérifier les champs requis
        if (setting.required && value === undefined) {
          throw new Error(`Setting ${setting.key} is required`);
        }

        // Valider selon le type
        if (value !== undefined && setting.validation) {
          const validation = setting.validation;

          if (validation.min !== undefined && value < validation.min) {
            throw new Error(`${setting.key} must be at least ${validation.min}`);
          }

          if (validation.max !== undefined && value > validation.max) {
            throw new Error(`${setting.key} must be at most ${validation.max}`);
          }

          if (validation.pattern) {
            const regex = new RegExp(validation.pattern);
            if (!regex.test(value)) {
              throw new Error(`${setting.key} format is invalid`);
            }
          }

          if (validation.custom) {
            const result = validation.custom(value);
            if (result !== true) {
              throw new Error(typeof result === 'string' ? result : `${setting.key} validation failed`);
            }
          }
        }
      }
    }
  }

  // ========== Gestion des Permissions ==========

  async hasModulePermission(
    userId: string,
    moduleId: string,
    permissionId: string
  ): Promise<boolean> {
    // Récupérer le rôle de l'utilisateur
    const userRole = await this.getUserRole(userId);
    if (!userRole) return false;

    // Vérifier si le module est actif
    const instance = this.moduleInstances.get(moduleId);
    if (!instance?.isActive) return false;

    // Vérifier les permissions du rôle pour ce module
    const modulePermissions = userRole.modulePermissions[moduleId] || [];
    return modulePermissions.includes(permissionId);
  }

  async grantModulePermission(
    clubId: string,
    roleId: string,
    moduleId: string,
    permissionId: string
  ): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not found`);
    }

    // Vérifier que la permission existe dans le module
    const permissionExists = this.moduleHasPermission(module, permissionId);
    if (!permissionExists) {
      throw new Error(`Permission ${permissionId} not found in module ${moduleId}`);
    }

    // Ajouter la permission
    if (!role.modulePermissions[moduleId]) {
      role.modulePermissions[moduleId] = [];
    }

    if (!role.modulePermissions[moduleId].includes(permissionId)) {
      role.modulePermissions[moduleId].push(permissionId);

      await updateDoc(doc(db, `clubs/${clubId}/roles/${roleId}`), {
        [`modulePermissions.${moduleId}`]: role.modulePermissions[moduleId],
        updatedAt: serverTimestamp(),
        updatedBy: this.getCurrentUserId(),
      });
    }
  }

  async revokeModulePermission(
    clubId: string,
    roleId: string,
    moduleId: string,
    permissionId: string
  ): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (!role.modulePermissions[moduleId]) {
      return; // Aucune permission pour ce module
    }

    const index = role.modulePermissions[moduleId].indexOf(permissionId);
    if (index > -1) {
      role.modulePermissions[moduleId].splice(index, 1);

      await updateDoc(doc(db, `clubs/${clubId}/roles/${roleId}`), {
        [`modulePermissions.${moduleId}`]: role.modulePermissions[moduleId],
        updatedAt: serverTimestamp(),
        updatedBy: this.getCurrentUserId(),
      });
    }
  }

  // ========== Gestion des Rôles Modulaires ==========

  async loadModularRoles(clubId: string): Promise<void> {
    const rolesRef = collection(db, `clubs/${clubId}/roles`);
    const snapshot = await getDocs(rolesRef);

    this.roles.clear();
    snapshot.forEach((doc) => {
      const role = { id: doc.id, ...doc.data() } as ModularRole;
      this.roles.set(role.id, role);
    });
  }

  async createRole(
    clubId: string,
    role: Omit<ModularRole, 'id' | 'clubId' | 'createdAt' | 'createdBy'>
  ): Promise<string> {
    const roleId = this.generateId('role');

    const newRole: ModularRole = {
      ...role,
      id: roleId,
      clubId,
      createdAt: new Date(),
      createdBy: this.getCurrentUserId(),
    };

    await setDoc(doc(db, `clubs/${clubId}/roles/${roleId}`), {
      ...newRole,
      createdAt: serverTimestamp(),
    });

    this.roles.set(roleId, newRole);

    return roleId;
  }

  async updateRole(
    clubId: string,
    roleId: string,
    updates: Partial<ModularRole>
  ): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (role.isSystem) {
      // Limiter les modifications sur les rôles système
      const allowedUpdates = ['description', 'color', 'icon'];
      for (const key of Object.keys(updates)) {
        if (!allowedUpdates.includes(key)) {
          throw new Error(`Cannot modify ${key} of system role`);
        }
      }
    }

    await updateDoc(doc(db, `clubs/${clubId}/roles/${roleId}`), {
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: this.getCurrentUserId(),
    });

    Object.assign(role, updates);
  }

  async deleteRole(clubId: string, roleId: string): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (role.isSystem) {
      throw new Error('Cannot delete system role');
    }

    // Vérifier qu'aucun utilisateur n'a ce rôle
    const usersWithRole = await this.getUsersWithRole(clubId, roleId);
    if (usersWithRole.length > 0) {
      throw new Error(`Cannot delete role: ${usersWithRole.length} users have this role`);
    }

    await deleteDoc(doc(db, `clubs/${clubId}/roles/${roleId}`));
    this.roles.delete(roleId);
  }

  // ========== Méthodes Utilitaires ==========

  getModule(moduleId: string): ModuleDefinition | undefined {
    return this.modules.get(moduleId);
  }

  getInstalledModules(): ModuleInstance[] {
    return Array.from(this.moduleInstances.values());
  }

  getActiveModules(): ModuleInstance[] {
    return this.getInstalledModules().filter(m => m.isActive);
  }

  isModuleInstalled(moduleId: string): boolean {
    return this.moduleInstances.has(moduleId);
  }

  isModuleActive(moduleId: string): boolean {
    return this.moduleInstances.get(moduleId)?.isActive || false;
  }

  getAllRoles(): ModularRole[] {
    return Array.from(this.roles.values());
  }

  getRole(roleId: string): ModularRole | undefined {
    return this.roles.get(roleId);
  }

  private async createModuleDataStructure(
    clubId: string,
    moduleId: string
  ): Promise<void> {
    // Créer les collections spécifiques au module
    const batch = writeBatch(db);

    // Structure de base pour chaque module
    const dataPath = `clubs/${clubId}/module_data/${moduleId}`;

    // Document de métadonnées
    batch.set(doc(db, `${dataPath}/metadata`), {
      createdAt: serverTimestamp(),
      version: '1.0.0',
      schemaVersion: 1,
    });

    await batch.commit();
  }

  private async archiveModuleData(
    clubId: string,
    moduleId: string
  ): Promise<void> {
    // Archiver les données au lieu de les supprimer
    const sourcePath = `clubs/${clubId}/module_data/${moduleId}`;
    const archivePath = `clubs/${clubId}/archived_modules/${moduleId}`;

    // TODO: Implémenter la copie récursive des données
    console.log(`Archiving data from ${sourcePath} to ${archivePath}`);
  }

  private getDefaultSettings(module: ModuleDefinition): Record<string, any> {
    const settings: Record<string, any> = {};

    if (!module.settings) return settings;

    for (const category of Object.values(module.settings)) {
      for (const setting of Object.values(category)) {
        settings[setting.key] = setting.defaultValue;
      }
    }

    return settings;
  }

  private getDefaultPermissions(module: ModuleDefinition): Record<string, string[]> {
    // Permissions par défaut pour les rôles système
    return {
      superadmin: this.getAllModulePermissions(module),
      admin: this.getAdminModulePermissions(module),
      validateur: this.getValidateurModulePermissions(module),
      user: this.getUserModulePermissions(module),
    };
  }

  private getAllModulePermissions(module: ModuleDefinition): string[] {
    const permissions: string[] = [];

    if (!module.permissions) return permissions;

    for (const category of Object.values(module.permissions)) {
      for (const permission of category) {
        permissions.push(permission.id);
      }
    }

    return permissions;
  }

  private getAdminModulePermissions(module: ModuleDefinition): string[] {
    const permissions: string[] = [];

    if (!module.permissions) return permissions;

    for (const category of Object.values(module.permissions)) {
      for (const permission of category) {
        // Admin a tout sauf les permissions critiques
        if (permission.riskLevel !== 'critical') {
          permissions.push(permission.id);
        }
      }
    }

    return permissions;
  }

  private getValidateurModulePermissions(module: ModuleDefinition): string[] {
    const permissions: string[] = [];

    if (!module.permissions) return permissions;

    for (const category of Object.values(module.permissions)) {
      for (const permission of category) {
        // Validateur a les permissions opérationnelles
        if (permission.category !== 'admin' && permission.riskLevel !== 'high') {
          permissions.push(permission.id);
        }
      }
    }

    return permissions;
  }

  private getUserModulePermissions(module: ModuleDefinition): string[] {
    const permissions: string[] = [];

    if (!module.permissions) return permissions;

    for (const category of Object.values(module.permissions)) {
      for (const permission of category) {
        // User a uniquement les permissions de base
        if (permission.category === 'view' || permission.riskLevel === 'low') {
          permissions.push(permission.id);
        }
      }
    }

    return permissions;
  }

  private moduleHasPermission(
    module: ModuleDefinition,
    permissionId: string
  ): boolean {
    if (!module.permissions) return false;

    for (const category of Object.values(module.permissions)) {
      if (category.some(p => p.id === permissionId)) {
        return true;
      }
    }

    return false;
  }

  private async getUserRole(userId: string): Promise<ModularRole | undefined> {
    // TODO: Implémenter la récupération du rôle de l'utilisateur
    const memberDoc = await getDoc(
      doc(db, `clubs/${this.currentClubId}/members/${userId}`)
    );

    if (!memberDoc.exists()) return undefined;

    const roleId = memberDoc.data().roleId;
    return this.roles.get(roleId);
  }

  private async getUsersWithRole(
    clubId: string,
    roleId: string
  ): Promise<string[]> {
    const membersRef = collection(db, `clubs/${clubId}/members`);
    const q = query(membersRef, where('roleId', '==', roleId));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.id);
  }

  private async executeHook(
    hookName: string,
    context: Record<string, any>
  ): Promise<void> {
    // TODO: Implémenter l'exécution des hooks
    console.log(`Executing hook: ${hookName}`, context);
  }

  private async checkForUpdates(): Promise<void> {
    // TODO: Vérifier les mises à jour des modules
    console.log('Checking for module updates...');
  }

  private getCurrentUserId(): string {
    // TODO: Récupérer l'ID de l'utilisateur actuel
    return 'current-user-id';
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton
export const moduleService = ModuleService.getInstance();
```

### 🔥 Phase 1.3 : Configuration Firebase

#### Étape 1.3.1 : Créer les définitions de modules core
**Fichier** : `src/config/modules/coreModules.ts`

```typescript
import type { ModuleDefinition } from '@/types/module.types';

export const CORE_MODULES: ModuleDefinition[] = [
  {
    id: 'transactions',
    name: 'Transactions Bancaires',
    description: 'Gestion des transactions bancaires et réconciliation',
    icon: 'CreditCard',
    version: '1.0.0',
    category: 'finance',
    isCore: true,
    isActive: true,

    settings: {
      download: {
        autoRenameFiles: {
          key: 'download.autoRenameFiles',
          label: 'Renommer automatiquement les fichiers',
          type: 'boolean',
          defaultValue: false,
          description: 'Active le renommage automatique lors du téléchargement'
        },
        filenamePattern: {
          key: 'download.filenamePattern',
          label: 'Format du nom de fichier',
          type: 'string',
          defaultValue: '{ANNÉE}_{MOIS}_{NUMÉRO}_{DESCRIPTION}',
          description: 'Variables: {ANNÉE}, {MOIS}, {JOUR}, {NUMÉRO}, {DESCRIPTION}',
          validation: {
            pattern: '^[^<>:"/\\|?*]+$'
          }
        },
        useTransactionNumber: {
          key: 'download.useTransactionNumber',
          label: 'Utiliser le numéro de transaction',
          type: 'boolean',
          defaultValue: true
        }
      },
      categorization: {
        enableAI: {
          key: 'categorization.enableAI',
          label: 'Activer les suggestions IA',
          type: 'boolean',
          defaultValue: false,
          description: 'Utilise l\'IA pour suggérer des catégories'
        },
        autoSuggest: {
          key: 'categorization.autoSuggest',
          label: 'Suggestions automatiques',
          type: 'boolean',
          defaultValue: true,
          dependsOn: 'categorization.enableAI'
        },
        requireCategory: {
          key: 'categorization.requireCategory',
          label: 'Catégorie obligatoire',
          type: 'boolean',
          defaultValue: false,
          description: 'Empêche la validation sans catégorie'
        }
      },
      validation: {
        requireDoubleSignature: {
          key: 'validation.requireDoubleSignature',
          label: 'Double signature requise',
          type: 'boolean',
          defaultValue: false
        },
        signatureThreshold: {
          key: 'validation.signatureThreshold',
          label: 'Seuil de double signature (€)',
          type: 'number',
          defaultValue: 100,
          dependsOn: 'validation.requireDoubleSignature',
          validation: {
            min: 0,
            max: 10000
          }
        },
        allowBackdating: {
          key: 'validation.allowBackdating',
          label: 'Autoriser l\'antidatage',
          type: 'boolean',
          defaultValue: false,
          advanced: true
        },
        maxBackdatingDays: {
          key: 'validation.maxBackdatingDays',
          label: 'Jours maximum d\'antidatage',
          type: 'number',
          defaultValue: 30,
          dependsOn: 'validation.allowBackdating',
          validation: {
            min: 1,
            max: 365
          }
        }
      }
    },

    permissions: {
      basic: [
        {
          id: 'view',
          label: 'Voir les transactions',
          description: 'Accès en lecture aux transactions',
          category: 'view',
          riskLevel: 'low'
        },
        {
          id: 'export',
          label: 'Exporter les données',
          description: 'Télécharger les transactions en CSV/Excel',
          category: 'view',
          riskLevel: 'low'
        }
      ],
      management: [
        {
          id: 'create',
          label: 'Créer des transactions',
          description: 'Ajouter de nouvelles transactions',
          category: 'create',
          riskLevel: 'medium'
        },
        {
          id: 'update',
          label: 'Modifier les transactions',
          description: 'Éditer les transactions existantes',
          category: 'update',
          riskLevel: 'medium'
        },
        {
          id: 'delete',
          label: 'Supprimer les transactions',
          description: 'Effacer définitivement les transactions',
          category: 'delete',
          riskLevel: 'high'
        },
        {
          id: 'categorize',
          label: 'Catégoriser',
          description: 'Assigner et modifier les catégories',
          category: 'update',
          riskLevel: 'low'
        }
      ],
      advanced: [
        {
          id: 'sign',
          label: 'Signer numériquement',
          description: 'Apposer une signature numérique',
          category: 'manage',
          riskLevel: 'medium'
        },
        {
          id: 'reconcile',
          label: 'Réconcilier',
          description: 'Pointer et réconcilier avec les relevés bancaires',
          category: 'manage',
          riskLevel: 'medium'
        },
        {
          id: 'link',
          label: 'Lier aux documents',
          description: 'Associer des factures et justificatifs',
          category: 'update',
          riskLevel: 'low'
        }
      ],
      admin: [
        {
          id: 'configure',
          label: 'Configurer le module',
          description: 'Modifier les paramètres du module',
          category: 'admin',
          riskLevel: 'high'
        },
        {
          id: 'audit',
          label: 'Audit complet',
          description: 'Accès à l\'historique et aux logs',
          category: 'admin',
          riskLevel: 'medium'
        }
      ]
    },

    config: {
      routes: [
        {
          path: '/transactions',
          component: 'TransactionList',
          permission: 'view'
        },
        {
          path: '/transactions/import',
          component: 'TransactionImport',
          permission: 'create'
        },
        {
          path: '/transactions/:id',
          component: 'TransactionDetail',
          permission: 'view'
        },
        {
          path: '/transactions/settings',
          component: 'TransactionSettings',
          permission: 'configure'
        }
      ],

      menuItems: [
        {
          id: 'transactions',
          label: 'Transactions',
          icon: 'CreditCard',
          path: '/transactions',
          permission: 'view',
          position: 2,
          subItems: [
            {
              id: 'transactions-list',
              label: 'Liste',
              path: '/transactions',
              permission: 'view'
            },
            {
              id: 'transactions-import',
              label: 'Importer',
              path: '/transactions/import',
              permission: 'create'
            },
            {
              id: 'transactions-settings',
              label: 'Paramètres',
              path: '/transactions/settings',
              permission: 'configure'
            }
          ]
        }
      ],

      widgets: [
        {
          id: 'transaction-summary',
          component: 'TransactionSummaryWidget',
          position: 'dashboard',
          permission: 'view',
          defaultSize: { w: 6, h: 4 }
        },
        {
          id: 'pending-signatures',
          component: 'PendingSignaturesWidget',
          position: 'dashboard',
          permission: 'sign',
          defaultSize: { w: 3, h: 3 }
        }
      ],

      hooks: {
        onInstall: 'createTransactionCategories',
        onEnable: 'activateTransactionSync',
        onDisable: 'pauseTransactionSync'
      }
    },

    createdAt: new Date('2024-01-01')
  },

  // Module Demandes/Dépenses
  {
    id: 'expenses',
    name: 'Demandes de Remboursement',
    description: 'Gestion des demandes de remboursement et notes de frais',
    icon: 'Receipt',
    version: '1.0.0',
    category: 'finance',
    isCore: true,
    isActive: true,

    settings: {
      workflow: {
        autoApprove: {
          key: 'workflow.autoApprove',
          label: 'Approbation automatique',
          type: 'boolean',
          defaultValue: false,
          description: 'Approuve automatiquement les petits montants'
        },
        autoApproveThreshold: {
          key: 'workflow.autoApproveThreshold',
          label: 'Seuil d\'approbation auto (€)',
          type: 'number',
          defaultValue: 50,
          dependsOn: 'workflow.autoApprove',
          validation: {
            min: 0,
            max: 500
          }
        },
        requireReceipts: {
          key: 'workflow.requireReceipts',
          label: 'Justificatifs obligatoires',
          type: 'boolean',
          defaultValue: true
        },
        receiptThreshold: {
          key: 'workflow.receiptThreshold',
          label: 'Seuil justificatif (€)',
          type: 'number',
          defaultValue: 20,
          dependsOn: 'workflow.requireReceipts',
          validation: {
            min: 0,
            max: 100
          }
        }
      },
      notifications: {
        notifyOnSubmission: {
          key: 'notifications.notifyOnSubmission',
          label: 'Notifier à la soumission',
          type: 'boolean',
          defaultValue: true
        },
        notifyOnApproval: {
          key: 'notifications.notifyOnApproval',
          label: 'Notifier à l\'approbation',
          type: 'boolean',
          defaultValue: true
        },
        notifyOnRejection: {
          key: 'notifications.notifyOnRejection',
          label: 'Notifier en cas de rejet',
          type: 'boolean',
          defaultValue: true
        },
        reminderDays: {
          key: 'notifications.reminderDays',
          label: 'Rappel après (jours)',
          type: 'number',
          defaultValue: 7,
          description: 'Envoie un rappel pour les demandes en attente',
          validation: {
            min: 1,
            max: 30
          }
        }
      },
      payment: {
        defaultPaymentMethod: {
          key: 'payment.defaultPaymentMethod',
          label: 'Méthode de paiement par défaut',
          type: 'select',
          defaultValue: 'transfer',
          options: [
            { value: 'transfer', label: 'Virement bancaire' },
            { value: 'cash', label: 'Espèces' },
            { value: 'check', label: 'Chèque' }
          ]
        },
        requireIBAN: {
          key: 'payment.requireIBAN',
          label: 'IBAN obligatoire',
          type: 'boolean',
          defaultValue: true,
          dependsOn: 'payment.defaultPaymentMethod=transfer'
        }
      }
    },

    permissions: {
      requester: [
        {
          id: 'view_own',
          label: 'Voir ses demandes',
          description: 'Accès à ses propres demandes uniquement',
          category: 'view',
          riskLevel: 'low'
        },
        {
          id: 'create',
          label: 'Créer une demande',
          description: 'Soumettre une nouvelle demande',
          category: 'create',
          riskLevel: 'low'
        },
        {
          id: 'update_own',
          label: 'Modifier ses demandes',
          description: 'Éditer ses demandes non approuvées',
          category: 'update',
          riskLevel: 'low',
          requiresCondition: 'status=draft'
        },
        {
          id: 'delete_own',
          label: 'Supprimer ses demandes',
          description: 'Supprimer ses demandes en brouillon',
          category: 'delete',
          riskLevel: 'low',
          requiresCondition: 'status=draft'
        }
      ],
      approver: [
        {
          id: 'view_all',
          label: 'Voir toutes les demandes',
          description: 'Accès à toutes les demandes du club',
          category: 'view',
          riskLevel: 'medium'
        },
        {
          id: 'approve',
          label: 'Approuver les demandes',
          description: 'Valider les demandes de remboursement',
          category: 'manage',
          riskLevel: 'high'
        },
        {
          id: 'reject',
          label: 'Rejeter les demandes',
          description: 'Refuser les demandes avec motif',
          category: 'manage',
          riskLevel: 'medium'
        },
        {
          id: 'comment',
          label: 'Commenter',
          description: 'Ajouter des commentaires aux demandes',
          category: 'update',
          riskLevel: 'low'
        }
      ],
      admin: [
        {
          id: 'update_all',
          label: 'Modifier toutes les demandes',
          description: 'Éditer n\'importe quelle demande',
          category: 'update',
          riskLevel: 'high'
        },
        {
          id: 'delete_all',
          label: 'Supprimer toutes les demandes',
          description: 'Effacer définitivement les demandes',
          category: 'delete',
          riskLevel: 'critical'
        },
        {
          id: 'export',
          label: 'Exporter les données',
          description: 'Télécharger l\'historique complet',
          category: 'view',
          riskLevel: 'medium'
        },
        {
          id: 'configure',
          label: 'Configurer le module',
          description: 'Modifier les paramètres du module',
          category: 'admin',
          riskLevel: 'high'
        }
      ]
    },

    config: {
      routes: [
        {
          path: '/expenses',
          component: 'ExpenseList',
          permission: 'view_own'
        },
        {
          path: '/expenses/new',
          component: 'ExpenseForm',
          permission: 'create'
        },
        {
          path: '/expenses/:id',
          component: 'ExpenseDetail',
          permission: 'view_own'
        },
        {
          path: '/expenses/settings',
          component: 'ExpenseSettings',
          permission: 'configure'
        }
      ],

      menuItems: [
        {
          id: 'expenses',
          label: 'Dépenses',
          icon: 'Receipt',
          path: '/expenses',
          permission: 'view_own',
          position: 3,
          badge: {
            type: 'count',
            value: 'pendingCount'
          }
        }
      ],

      widgets: [
        {
          id: 'expense-summary',
          component: 'ExpenseSummaryWidget',
          position: 'dashboard',
          permission: 'view_own',
          defaultSize: { w: 4, h: 3 }
        },
        {
          id: 'pending-approvals',
          component: 'PendingApprovalsWidget',
          position: 'dashboard',
          permission: 'approve',
          defaultSize: { w: 4, h: 4 }
        }
      ]
    },

    createdAt: new Date('2024-01-01')
  },

  // Module Événements
  {
    id: 'events',
    name: 'Événements & Activités',
    description: 'Organisation et gestion des événements du club',
    icon: 'Calendar',
    version: '1.0.0',
    category: 'operations',
    isCore: true,
    isActive: true,
    dependencies: ['expenses'], // Les événements peuvent générer des dépenses

    settings: {
      general: {
        defaultEventType: {
          key: 'general.defaultEventType',
          label: 'Type d\'événement par défaut',
          type: 'select',
          defaultValue: 'sortie',
          options: [
            { value: 'sortie', label: 'Sortie plongée' },
            { value: 'formation', label: 'Formation' },
            { value: 'reunion', label: 'Réunion' },
            { value: 'social', label: 'Événement social' }
          ]
        },
        allowGuestRegistration: {
          key: 'general.allowGuestRegistration',
          label: 'Autoriser les invités',
          type: 'boolean',
          defaultValue: true
        },
        maxGuestsPerMember: {
          key: 'general.maxGuestsPerMember',
          label: 'Invités max par membre',
          type: 'number',
          defaultValue: 2,
          dependsOn: 'general.allowGuestRegistration',
          validation: {
            min: 0,
            max: 10
          }
        }
      },
      registration: {
        requirePaymentUpfront: {
          key: 'registration.requirePaymentUpfront',
          label: 'Paiement à l\'inscription',
          type: 'boolean',
          defaultValue: false
        },
        registrationDeadlineDays: {
          key: 'registration.registrationDeadlineDays',
          label: 'Délai d\'inscription (jours avant)',
          type: 'number',
          defaultValue: 3,
          validation: {
            min: 0,
            max: 30
          }
        },
        waitingListEnabled: {
          key: 'registration.waitingListEnabled',
          label: 'Activer la liste d\'attente',
          type: 'boolean',
          defaultValue: true
        }
      },
      communication: {
        sendConfirmation: {
          key: 'communication.sendConfirmation',
          label: 'Email de confirmation',
          type: 'boolean',
          defaultValue: true
        },
        sendReminder: {
          key: 'communication.sendReminder',
          label: 'Email de rappel',
          type: 'boolean',
          defaultValue: true
        },
        reminderDaysBefore: {
          key: 'communication.reminderDaysBefore',
          label: 'Rappel (jours avant)',
          type: 'number',
          defaultValue: 2,
          dependsOn: 'communication.sendReminder',
          validation: {
            min: 1,
            max: 7
          }
        }
      }
    },

    permissions: {
      participant: [
        {
          id: 'view',
          label: 'Voir les événements',
          description: 'Consulter la liste des événements',
          category: 'view',
          riskLevel: 'low'
        },
        {
          id: 'register',
          label: 'S\'inscrire',
          description: 'S\'inscrire aux événements ouverts',
          category: 'create',
          riskLevel: 'low'
        },
        {
          id: 'cancel_registration',
          label: 'Annuler son inscription',
          description: 'Se désinscrire d\'un événement',
          category: 'delete',
          riskLevel: 'low'
        }
      ],
      organizer: [
        {
          id: 'create',
          label: 'Créer des événements',
          description: 'Organiser de nouveaux événements',
          category: 'create',
          riskLevel: 'medium'
        },
        {
          id: 'update_own',
          label: 'Modifier ses événements',
          description: 'Éditer les événements qu\'on organise',
          category: 'update',
          riskLevel: 'medium'
        },
        {
          id: 'manage_participants',
          label: 'Gérer les participants',
          description: 'Valider/refuser les inscriptions',
          category: 'manage',
          riskLevel: 'medium'
        },
        {
          id: 'send_messages',
          label: 'Envoyer des messages',
          description: 'Communiquer avec les participants',
          category: 'manage',
          riskLevel: 'low'
        }
      ],
      admin: [
        {
          id: 'update_all',
          label: 'Modifier tous les événements',
          description: 'Éditer n\'importe quel événement',
          category: 'update',
          riskLevel: 'high'
        },
        {
          id: 'delete',
          label: 'Supprimer des événements',
          description: 'Annuler définitivement des événements',
          category: 'delete',
          riskLevel: 'high'
        },
        {
          id: 'financial_report',
          label: 'Rapports financiers',
          description: 'Voir les bilans financiers des événements',
          category: 'admin',
          riskLevel: 'medium'
        },
        {
          id: 'configure',
          label: 'Configurer le module',
          description: 'Modifier les paramètres du module',
          category: 'admin',
          riskLevel: 'high'
        }
      ]
    },

    config: {
      routes: [
        {
          path: '/events',
          component: 'EventList',
          permission: 'view'
        },
        {
          path: '/events/calendar',
          component: 'EventCalendar',
          permission: 'view'
        },
        {
          path: '/events/new',
          component: 'EventForm',
          permission: 'create'
        },
        {
          path: '/events/:id',
          component: 'EventDetail',
          permission: 'view'
        }
      ],

      menuItems: [
        {
          id: 'events',
          label: 'Événements',
          icon: 'Calendar',
          path: '/events',
          permission: 'view',
          position: 4
        }
      ],

      widgets: [
        {
          id: 'upcoming-events',
          component: 'UpcomingEventsWidget',
          position: 'dashboard',
          permission: 'view',
          defaultSize: { w: 6, h: 4 }
        }
      ]
    },

    createdAt: new Date('2024-01-01')
  }
];

// Modules additionnels (non-core)
export const OPTIONAL_MODULES: ModuleDefinition[] = [
  {
    id: 'inventory',
    name: 'Gestion d\'Inventaire',
    description: 'Suivi du matériel, stocks et prêts',
    icon: 'Package',
    version: '1.0.0',
    category: 'operations',
    isCore: false,
    isActive: false,

    settings: {
      general: {
        enableBarcodes: {
          key: 'general.enableBarcodes',
          label: 'Activer les codes-barres',
          type: 'boolean',
          defaultValue: false,
          description: 'Permet le scan de codes-barres pour l\'inventaire'
        },
        autoGenerateReferences: {
          key: 'general.autoGenerateReferences',
          label: 'Références automatiques',
          type: 'boolean',
          defaultValue: true
        },
        referencePrefix: {
          key: 'general.referencePrefix',
          label: 'Préfixe des références',
          type: 'string',
          defaultValue: 'INV',
          dependsOn: 'general.autoGenerateReferences'
        }
      },
      alerts: {
        lowStockWarning: {
          key: 'alerts.lowStockWarning',
          label: 'Alerte stock bas',
          type: 'boolean',
          defaultValue: true
        },
        lowStockThreshold: {
          key: 'alerts.lowStockThreshold',
          label: 'Seuil d\'alerte',
          type: 'number',
          defaultValue: 5,
          dependsOn: 'alerts.lowStockWarning',
          validation: {
            min: 1,
            max: 100
          }
        },
        maintenanceReminders: {
          key: 'alerts.maintenanceReminders',
          label: 'Rappels de maintenance',
          type: 'boolean',
          defaultValue: true
        },
        maintenanceFrequencyDays: {
          key: 'alerts.maintenanceFrequencyDays',
          label: 'Fréquence maintenance (jours)',
          type: 'number',
          defaultValue: 180,
          dependsOn: 'alerts.maintenanceReminders',
          validation: {
            min: 30,
            max: 365
          }
        }
      },
      loans: {
        requireApproval: {
          key: 'loans.requireApproval',
          label: 'Approbation requise',
          type: 'boolean',
          defaultValue: false,
          description: 'Les prêts doivent être approuvés'
        },
        requireCaution: {
          key: 'loans.requireCaution',
          label: 'Caution obligatoire',
          type: 'boolean',
          defaultValue: true
        },
        defaultCautionAmount: {
          key: 'loans.defaultCautionAmount',
          label: 'Montant caution par défaut (€)',
          type: 'number',
          defaultValue: 50,
          dependsOn: 'loans.requireCaution',
          validation: {
            min: 0,
            max: 500
          }
        },
        maxLoanDurationDays: {
          key: 'loans.maxLoanDurationDays',
          label: 'Durée max de prêt (jours)',
          type: 'number',
          defaultValue: 30,
          validation: {
            min: 1,
            max: 365
          }
        },
        sendReturnReminder: {
          key: 'loans.sendReturnReminder',
          label: 'Rappel de retour',
          type: 'boolean',
          defaultValue: true
        },
        reminderDaysBefore: {
          key: 'loans.reminderDaysBefore',
          label: 'Rappel (jours avant)',
          type: 'number',
          defaultValue: 3,
          dependsOn: 'loans.sendReturnReminder',
          validation: {
            min: 1,
            max: 7
          }
        }
      }
    },

    permissions: {
      viewer: [
        {
          id: 'view',
          label: 'Consulter l\'inventaire',
          description: 'Voir la liste du matériel',
          category: 'view',
          riskLevel: 'low'
        },
        {
          id: 'search',
          label: 'Rechercher',
          description: 'Rechercher dans l\'inventaire',
          category: 'view',
          riskLevel: 'low'
        }
      ],
      operator: [
        {
          id: 'add_items',
          label: 'Ajouter du matériel',
          description: 'Créer de nouveaux articles',
          category: 'create',
          riskLevel: 'medium'
        },
        {
          id: 'edit_items',
          label: 'Modifier le matériel',
          description: 'Éditer les informations',
          category: 'update',
          riskLevel: 'medium'
        },
        {
          id: 'move_items',
          label: 'Déplacer le matériel',
          description: 'Changer l\'emplacement',
          category: 'update',
          riskLevel: 'low'
        },
        {
          id: 'create_loan',
          label: 'Créer un prêt',
          description: 'Enregistrer un nouveau prêt',
          category: 'create',
          riskLevel: 'medium'
        },
        {
          id: 'return_item',
          label: 'Enregistrer un retour',
          description: 'Valider le retour du matériel',
          category: 'update',
          riskLevel: 'medium'
        }
      ],
      manager: [
        {
          id: 'delete_items',
          label: 'Supprimer du matériel',
          description: 'Retirer de l\'inventaire',
          category: 'delete',
          riskLevel: 'high'
        },
        {
          id: 'approve_loans',
          label: 'Approuver les prêts',
          description: 'Valider les demandes de prêt',
          category: 'manage',
          riskLevel: 'medium'
        },
        {
          id: 'manage_cautions',
          label: 'Gérer les cautions',
          description: 'Encaisser/rembourser les cautions',
          category: 'manage',
          riskLevel: 'high'
        },
        {
          id: 'maintenance',
          label: 'Gérer la maintenance',
          description: 'Planifier et suivre la maintenance',
          category: 'manage',
          riskLevel: 'medium'
        }
      ],
      admin: [
        {
          id: 'configure',
          label: 'Configurer le module',
          description: 'Modifier les paramètres',
          category: 'admin',
          riskLevel: 'high'
        },
        {
          id: 'manage_types',
          label: 'Gérer les types',
          description: 'Créer/modifier les types d\'articles',
          category: 'admin',
          riskLevel: 'medium'
        },
        {
          id: 'manage_locations',
          label: 'Gérer les emplacements',
          description: 'Définir les lieux de stockage',
          category: 'admin',
          riskLevel: 'medium'
        },
        {
          id: 'export',
          label: 'Exporter les données',
          description: 'Télécharger l\'inventaire complet',
          category: 'admin',
          riskLevel: 'low'
        },
        {
          id: 'audit',
          label: 'Audit complet',
          description: 'Voir l\'historique des mouvements',
          category: 'admin',
          riskLevel: 'medium'
        }
      ]
    },

    config: {
      routes: [
        {
          path: '/inventory',
          component: 'InventoryDashboard',
          permission: 'view'
        },
        {
          path: '/inventory/items',
          component: 'ItemList',
          permission: 'view'
        },
        {
          path: '/inventory/items/new',
          component: 'ItemForm',
          permission: 'add_items'
        },
        {
          path: '/inventory/items/:id',
          component: 'ItemDetail',
          permission: 'view'
        },
        {
          path: '/inventory/loans',
          component: 'LoanList',
          permission: 'view'
        },
        {
          path: '/inventory/loans/new',
          component: 'LoanForm',
          permission: 'create_loan'
        },
        {
          path: '/inventory/maintenance',
          component: 'MaintenanceSchedule',
          permission: 'maintenance'
        },
        {
          path: '/inventory/settings',
          component: 'InventorySettings',
          permission: 'configure'
        }
      ],

      menuItems: [
        {
          id: 'inventory',
          label: 'Inventaire',
          icon: 'Package',
          path: '/inventory',
          permission: 'view',
          position: 5,
          subItems: [
            {
              id: 'inventory-items',
              label: 'Matériel',
              path: '/inventory/items',
              permission: 'view'
            },
            {
              id: 'inventory-loans',
              label: 'Prêts',
              path: '/inventory/loans',
              permission: 'view',
              badge: {
                type: 'count',
                value: 'activeLoanCount'
              }
            },
            {
              id: 'inventory-maintenance',
              label: 'Maintenance',
              path: '/inventory/maintenance',
              permission: 'maintenance'
            }
          ]
        }
      ],

      widgets: [
        {
          id: 'inventory-status',
          component: 'InventoryStatusWidget',
          position: 'dashboard',
          permission: 'view',
          defaultSize: { w: 4, h: 3 }
        },
        {
          id: 'active-loans',
          component: 'ActiveLoansWidget',
          position: 'dashboard',
          permission: 'view',
          defaultSize: { w: 4, h: 4 }
        },
        {
          id: 'maintenance-alerts',
          component: 'MaintenanceAlertsWidget',
          position: 'sidebar',
          permission: 'maintenance',
          defaultSize: { w: 3, h: 3 }
        }
      ],

      hooks: {
        onInstall: 'createDefaultItemTypes',
        onEnable: 'startMaintenanceScheduler',
        onDisable: 'stopMaintenanceScheduler'
      },

      scheduledTasks: [
        {
          id: 'maintenance-check',
          name: 'Vérification maintenance',
          schedule: '0 9 * * *', // Tous les jours à 9h
          handler: 'checkMaintenanceDue',
          enabled: true
        },
        {
          id: 'loan-reminder',
          name: 'Rappel de retour',
          schedule: '0 10 * * *', // Tous les jours à 10h
          handler: 'sendLoanReturnReminders',
          enabled: true
        }
      ]
    },

    createdAt: new Date('2024-01-01')
  },

  {
    id: 'excursions',
    name: 'Excursions & Voyages',
    description: 'Organisation d\'excursions et voyages plongée',
    icon: 'MapPin',
    version: '1.0.0',
    category: 'operations',
    isCore: false,
    isActive: false,
    dependencies: ['events', 'expenses'],

    settings: {
      // Paramètres similaires mais spécifiques aux excursions
      booking: {
        requireAdvancePayment: {
          key: 'booking.requireAdvancePayment',
          label: 'Acompte obligatoire',
          type: 'boolean',
          defaultValue: true
        },
        advancePaymentPercent: {
          key: 'booking.advancePaymentPercent',
          label: 'Pourcentage d\'acompte',
          type: 'number',
          defaultValue: 30,
          dependsOn: 'booking.requireAdvancePayment',
          validation: {
            min: 10,
            max: 100
          }
        },
        paymentDeadlineDays: {
          key: 'booking.paymentDeadlineDays',
          label: 'Délai de paiement (jours avant)',
          type: 'number',
          defaultValue: 14,
          validation: {
            min: 1,
            max: 60
          }
        }
      },
      pricing: {
        memberDiscount: {
          key: 'pricing.memberDiscount',
          label: 'Réduction membre (%)',
          type: 'number',
          defaultValue: 10,
          validation: {
            min: 0,
            max: 50
          }
        },
        earlyBirdDiscount: {
          key: 'pricing.earlyBirdDiscount',
          label: 'Réduction early bird (%)',
          type: 'number',
          defaultValue: 5,
          validation: {
            min: 0,
            max: 30
          }
        },
        earlyBirdDaysBefore: {
          key: 'pricing.earlyBirdDaysBefore',
          label: 'Délai early bird (jours)',
          type: 'number',
          defaultValue: 30,
          validation: {
            min: 7,
            max: 90
          }
        }
      },
      cancellation: {
        allowCancellation: {
          key: 'cancellation.allowCancellation',
          label: 'Autoriser les annulations',
          type: 'boolean',
          defaultValue: true
        },
        cancellationDeadlineDays: {
          key: 'cancellation.cancellationDeadlineDays',
          label: 'Délai d\'annulation (jours)',
          type: 'number',
          defaultValue: 7,
          dependsOn: 'cancellation.allowCancellation',
          validation: {
            min: 1,
            max: 30
          }
        },
        refundPolicy: {
          key: 'cancellation.refundPolicy',
          label: 'Politique de remboursement',
          type: 'select',
          defaultValue: 'partial',
          dependsOn: 'cancellation.allowCancellation',
          options: [
            { value: 'full', label: 'Remboursement total' },
            { value: 'partial', label: 'Remboursement partiel' },
            { value: 'none', label: 'Aucun remboursement' },
            { value: 'credit', label: 'Avoir uniquement' }
          ]
        },
        partialRefundPercent: {
          key: 'cancellation.partialRefundPercent',
          label: 'Pourcentage remboursé',
          type: 'number',
          defaultValue: 70,
          dependsOn: 'cancellation.refundPolicy=partial',
          validation: {
            min: 0,
            max: 100
          }
        }
      }
    },

    permissions: {
      // Permissions similaires au module events mais adaptées
      traveler: [
        {
          id: 'view',
          label: 'Voir les excursions',
          description: 'Consulter les excursions disponibles',
          category: 'view',
          riskLevel: 'low'
        },
        {
          id: 'book',
          label: 'Réserver',
          description: 'S\'inscrire aux excursions',
          category: 'create',
          riskLevel: 'low'
        },
        {
          id: 'cancel_own',
          label: 'Annuler sa réservation',
          description: 'Annuler sa propre participation',
          category: 'delete',
          riskLevel: 'low'
        }
      ],
      organizer: [
        {
          id: 'create',
          label: 'Créer des excursions',
          description: 'Organiser de nouvelles excursions',
          category: 'create',
          riskLevel: 'medium'
        },
        {
          id: 'manage_bookings',
          label: 'Gérer les réservations',
          description: 'Valider et gérer les inscriptions',
          category: 'manage',
          riskLevel: 'medium'
        },
        {
          id: 'manage_payments',
          label: 'Gérer les paiements',
          description: 'Suivre les acomptes et soldes',
          category: 'manage',
          riskLevel: 'high'
        }
      ],
      admin: [
        {
          id: 'financial_report',
          label: 'Rapports financiers',
          description: 'Bilans détaillés des excursions',
          category: 'admin',
          riskLevel: 'medium'
        },
        {
          id: 'configure',
          label: 'Configurer le module',
          description: 'Paramètres des excursions',
          category: 'admin',
          riskLevel: 'high'
        }
      ]
    },

    config: {
      routes: [
        {
          path: '/excursions',
          component: 'ExcursionList',
          permission: 'view'
        },
        {
          path: '/excursions/new',
          component: 'ExcursionForm',
          permission: 'create'
        },
        {
          path: '/excursions/:id',
          component: 'ExcursionDetail',
          permission: 'view'
        },
        {
          path: '/excursions/:id/bookings',
          component: 'BookingManagement',
          permission: 'manage_bookings'
        }
      ],

      menuItems: [
        {
          id: 'excursions',
          label: 'Excursions',
          icon: 'MapPin',
          path: '/excursions',
          permission: 'view',
          position: 6
        }
      ],

      widgets: [
        {
          id: 'upcoming-excursions',
          component: 'UpcomingExcursionsWidget',
          position: 'dashboard',
          permission: 'view',
          defaultSize: { w: 6, h: 4 }
        }
      ]
    },

    createdAt: new Date('2024-01-01')
  }
];

export const ALL_MODULES = [...CORE_MODULES, ...OPTIONAL_MODULES];
```

---

## PHASE 2 : MIGRATION DES MODULES EXISTANTS (5 jours)

### Phase 2.1 : Script de Migration

#### Étape 2.1.1 : Créer le service de migration
**Fichier** : `src/services/migration/modularMigrationService.ts`

```typescript
import { writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ALL_MODULES } from '@/config/modules/coreModules';
import type { MigrationPlan, MigrationStatus } from '@/types/migration.types';

// [Le code continue avec la migration détaillée de chaque module]
```

---

## Suite du plan dans MODULAR_MIGRATION_EXECUTION_PLAN_PART2.md

Le plan est trop long pour un seul fichier. Je vais continuer avec :
- Phase 3 : Interface d'Administration
- Phase 4 : Security Rules
- Phase 5 : Tests et Documentation
- Checklist complète d'exécution