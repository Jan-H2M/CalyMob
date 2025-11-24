# Plan de Migration vers un Système de Permissions Dynamique

## 📋 Analyse de l'État Actuel

### Situation Actuelle
Le système actuel de CalyCompta utilise des rôles et permissions **partiellement dynamiques** :

#### Points Forts ✅
1. **Permissions personnalisables** : Les permissions peuvent déjà être modifiées via Firebase
2. **Interface de gestion** : UI existante pour configurer les permissions par rôle
3. **Service centralisé** : `PermissionService` gère déjà le chargement depuis Firebase
4. **Validation en place** : Système de validation des permissions avant sauvegarde

#### Limitations Actuelles ❌
1. **Rôles hardcodés** : Les 5 rôles sont définis en dur dans `UserRole` type
2. **Permissions hardcodées** : Liste fixe de ~40 permissions dans le type `Permission`
3. **Hiérarchie fixe** : Niveaux de rôles (0-3) codés en dur
4. **Labels français statiques** : "Utilisateur", "Validateur", etc. non modifiables
5. **Règles Firestore statiques** : Security rules référencent des rôles spécifiques
6. **Types TypeScript rigides** : Union types empêchent l'ajout dynamique

## 🎯 Objectifs de la Migration

### Cas d'Usage Demandés
1. **Module Inventaire** → Nouveau rôle "Logistique" avec accès uniquement à l'inventaire
2. **Module Excursions** → Rôle "Organisateur Excursions" avec accès limité aux événements
3. **Modules Futurs** → Possibilité d'ajouter de nouveaux modules avec leurs propres rôles

### Exigences Techniques
- ✅ Création dynamique de rôles
- ✅ Création dynamique de permissions
- ✅ Hiérarchie de rôles flexible
- ✅ Isolation des données par module
- ✅ Rétrocompatibilité avec le système existant

## 🚦 Évaluation de Faisabilité

### Complexité : **MOYENNE-ÉLEVÉE** (7/10)

**Pourquoi c'est faisable :**
- Infrastructure Firebase déjà en place
- Service de permissions déjà partiellement dynamique
- UI de gestion des permissions existante

**Défis principaux :**
1. Migration des types TypeScript vers une approche runtime
2. Refactoring des security rules Firestore
3. Migration des données existantes
4. Tests de régression sur toutes les fonctionnalités

## 📐 Architecture Proposée

### 1. Structure de Données Dynamique

```typescript
// Nouveau modèle de rôle dynamique
interface DynamicRole {
  id: string;                    // 'logistique', 'excursion_manager', etc.
  label: string;                  // Nom affiché
  description: string;
  level: number;                  // Hiérarchie (peut être décimal: 1.5)
  color: string;
  icon: string;
  module?: string;                // 'inventory', 'excursions', 'core'
  canManage: string[];            // IDs des rôles manageable
  permissions: string[];          // IDs des permissions
  isSystem: boolean;              // true pour les rôles de base
  isActive: boolean;              // Permet de désactiver sans supprimer
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

// Nouveau modèle de permission dynamique
interface DynamicPermission {
  id: string;                     // 'inventory.view', 'excursions.manage'
  module: string;                 // 'inventory', 'excursions', 'core'
  resource: string;               // 'items', 'events', 'users'
  action: string;                 // 'view', 'create', 'update', 'delete'
  label: string;                  // Nom affiché en français
  description: string;
  isSystem: boolean;              // Permissions de base non supprimables
  requiresCondition?: string;     // Expression pour conditions spéciales
  createdAt: Timestamp;
  createdBy: string;
}

// Nouveau modèle de module
interface Module {
  id: string;                     // 'inventory', 'excursions'
  name: string;                   // Nom affiché
  description: string;
  icon: string;
  isActive: boolean;
  permissions: string[];          // Permissions associées au module
  defaultRoles?: string[];        // Rôles par défaut du module
  routes: string[];               // Routes associées
  menuItems: MenuItem[];          // Items de menu
  createdAt: Timestamp;
  createdBy: string;
}
```

### 2. Structure Firebase

```
/clubs/{clubId}/
  ├── system/
  │   ├── roles/
  │   │   ├── {roleId}           # Documents de rôles dynamiques
  │   │   └── ...
  │   ├── permissions/
  │   │   ├── {permissionId}     # Documents de permissions dynamiques
  │   │   └── ...
  │   └── modules/
  │       ├── {moduleId}          # Documents de modules
  │       └── ...
  ├── members/
  │   └── {memberId}
  │       └── roleId: string      # Référence au rôle dynamique
  └── settings/
      └── permissionConfig         # Configuration globale
```

### 3. Migration des Types TypeScript

```typescript
// Avant (rigide)
export type UserRole = 'membre' | 'user' | 'validateur' | 'admin' | 'superadmin';
export type Permission = 'users.view' | 'users.create' | ...;

// Après (flexible)
export type UserRole = string;     // N'importe quel ID de rôle
export type Permission = string;   // N'importe quel ID de permission

// Validation runtime au lieu de compile-time
class RoleValidator {
  static isValidRole(roleId: string, availableRoles: DynamicRole[]): boolean {
    return availableRoles.some(r => r.id === roleId && r.isActive);
  }

  static validatePermission(permissionId: string, availablePermissions: DynamicPermission[]): boolean {
    return availablePermissions.some(p => p.id === permissionId);
  }
}
```

## 🛠️ Plan de Mise en Œuvre

### Phase 1 : Préparation (2-3 jours)

#### 1.1 Création de la structure de données
- [ ] Créer les nouvelles interfaces TypeScript
- [ ] Créer les collections Firebase pour roles/permissions/modules
- [ ] Migrer les rôles existants vers la nouvelle structure
- [ ] Migrer les permissions existantes

#### 1.2 Service de gestion dynamique
```typescript
// services/dynamicPermissionService.ts
export class DynamicPermissionService {
  private roles: Map<string, DynamicRole> = new Map();
  private permissions: Map<string, DynamicPermission> = new Map();
  private modules: Map<string, Module> = new Map();

  async loadSystemConfiguration(clubId: string) {
    // Charger roles, permissions, modules depuis Firebase
  }

  async createRole(clubId: string, role: Omit<DynamicRole, 'id' | 'createdAt' | 'createdBy'>): Promise<string> {
    // Créer un nouveau rôle
  }

  async createPermission(clubId: string, permission: Omit<DynamicPermission, 'id' | 'createdAt' | 'createdBy'>): Promise<string> {
    // Créer une nouvelle permission
  }

  async createModule(clubId: string, module: Omit<Module, 'id' | 'createdAt' | 'createdBy'>): Promise<string> {
    // Créer un nouveau module avec ses permissions et rôles
  }

  hasPermission(user: Membre, permissionId: string): boolean {
    const userRole = this.roles.get(user.role);
    if (!userRole) return false;

    // Vérifier permissions du rôle + permissions custom
    const allPermissions = [
      ...userRole.permissions,
      ...(user.customPermissions || [])
    ];

    return allPermissions.includes(permissionId);
  }

  canAccessModule(user: Membre, moduleId: string): boolean {
    const module = this.modules.get(moduleId);
    if (!module || !module.isActive) return false;

    // Vérifier si l'utilisateur a au moins une permission du module
    return module.permissions.some(p => this.hasPermission(user, p));
  }
}
```

### Phase 2 : Migration Progressive (3-4 jours)

#### 2.1 Adapter le PermissionService existant
```typescript
// services/permissionService.ts - Version hybride
export class PermissionService {
  private static dynamicService: DynamicPermissionService;

  static async initialize(clubId: string): Promise<void> {
    // Charger configuration dynamique
    this.dynamicService = new DynamicPermissionService();
    await this.dynamicService.loadSystemConfiguration(clubId);

    // Fallback sur l'ancien système si nécessaire
    if (!this.dynamicService.hasRoles()) {
      await this.loadLegacyConfiguration(clubId);
    }
  }

  static hasPermission(user: Membre, permission: string): boolean {
    // Utiliser le système dynamique en priorité
    if (this.dynamicService) {
      return this.dynamicService.hasPermission(user, permission);
    }
    // Fallback sur l'ancien système
    return this.legacyHasPermission(user, permission);
  }
}
```

#### 2.2 Interface d'administration des rôles
```tsx
// components/settings/RoleManagement.tsx
export const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [modules, setModules] = useState<Module[]>([]);

  return (
    <div className="space-y-6">
      {/* Liste des rôles existants */}
      <RoleList
        roles={roles}
        onEdit={handleEditRole}
        onDelete={handleDeleteRole}
      />

      {/* Création de nouveau rôle */}
      <CreateRoleForm
        modules={modules}
        availablePermissions={permissions}
        onCreate={handleCreateRole}
      />

      {/* Matrice des permissions par rôle */}
      <DynamicPermissionMatrix
        roles={roles}
        permissions={permissions}
        modules={modules}
        onChange={handlePermissionChange}
      />
    </div>
  );
};
```

### Phase 3 : Security Rules Dynamiques (2-3 jours)

#### 3.1 Refactoring des Security Rules
```javascript
// firestore.rules - Version dynamique
service cloud.firestore {
  match /databases/{database}/documents {
    // Helpers dynamiques
    function getUserRole(clubId) {
      return get(/databases/$(database)/documents/clubs/$(clubId)/members/$(request.auth.uid)).data.roleId;
    }

    function getRoleData(clubId, roleId) {
      return get(/databases/$(database)/documents/clubs/$(clubId)/system/roles/$(roleId)).data;
    }

    function hasPermission(clubId, permission) {
      let roleId = getUserRole(clubId);
      let role = getRoleData(clubId, roleId);
      return permission in role.permissions;
    }

    function hasModuleAccess(clubId, moduleId) {
      let roleId = getUserRole(clubId);
      let role = getRoleData(clubId, roleId);
      let module = get(/databases/$(database)/documents/clubs/$(clubId)/system/modules/$(moduleId)).data;
      return role.permissions.hasAny(module.permissions);
    }

    // Règles par module
    match /clubs/{clubId}/inventory_{document=**} {
      allow read: if hasModuleAccess(clubId, 'inventory');
      allow write: if hasPermission(clubId, 'inventory.manage');
    }

    match /clubs/{clubId}/excursions/{excursionId} {
      allow read: if hasModuleAccess(clubId, 'excursions') ||
                     resource.data.organisateur_id == request.auth.uid;
      allow write: if hasPermission(clubId, 'excursions.manage') ||
                      (hasPermission(clubId, 'excursions.create') &&
                       resource.data.organisateur_id == request.auth.uid);
    }
  }
}
```

### Phase 4 : Modules Dynamiques (3-4 jours)

#### 4.1 Système de modules extensible
```typescript
// services/moduleService.ts
export class ModuleService {
  static async registerModule(clubId: string, moduleConfig: {
    id: string;
    name: string;
    permissions: Array<{
      action: string;
      label: string;
      description: string;
    }>;
    defaultRoles?: Array<{
      id: string;
      label: string;
      permissions: string[];
    }>;
    routes: RouteConfig[];
    menuItems: MenuItem[];
  }): Promise<void> {
    // Créer le module
    const module = await this.createModule(clubId, moduleConfig);

    // Créer les permissions du module
    for (const perm of moduleConfig.permissions) {
      await this.createModulePermission(clubId, module.id, perm);
    }

    // Créer les rôles par défaut si spécifiés
    if (moduleConfig.defaultRoles) {
      for (const role of moduleConfig.defaultRoles) {
        await this.createModuleRole(clubId, module.id, role);
      }
    }

    // Enregistrer les routes
    await this.registerRoutes(module.id, moduleConfig.routes);

    // Ajouter les items de menu
    await this.registerMenuItems(module.id, moduleConfig.menuItems);
  }
}
```

#### 4.2 Exemple : Module Inventaire
```typescript
// modules/inventory/config.ts
export const inventoryModule = {
  id: 'inventory',
  name: 'Gestion d\'Inventaire',
  permissions: [
    { action: 'view', label: 'Voir l\'inventaire', description: 'Accès en lecture' },
    { action: 'manage', label: 'Gérer l\'inventaire', description: 'Ajouter, modifier, supprimer' },
    { action: 'export', label: 'Exporter', description: 'Exporter les données' },
    { action: 'audit', label: 'Audit', description: 'Voir l\'historique des modifications' }
  ],
  defaultRoles: [
    {
      id: 'logistique',
      label: 'Responsable Logistique',
      permissions: ['inventory.view', 'inventory.manage', 'inventory.export']
    },
    {
      id: 'logistique_viewer',
      label: 'Consultation Logistique',
      permissions: ['inventory.view']
    }
  ],
  routes: [
    { path: '/inventory', component: 'InventoryDashboard', permission: 'inventory.view' },
    { path: '/inventory/items', component: 'ItemList', permission: 'inventory.view' },
    { path: '/inventory/movements', component: 'MovementHistory', permission: 'inventory.view' }
  ],
  menuItems: [
    {
      label: 'Inventaire',
      icon: 'Package',
      path: '/inventory',
      permission: 'inventory.view',
      subItems: [
        { label: 'Articles', path: '/inventory/items', permission: 'inventory.view' },
        { label: 'Mouvements', path: '/inventory/movements', permission: 'inventory.view' }
      ]
    }
  ]
};
```

### Phase 5 : Tests et Migration (2-3 jours)

#### 5.1 Tests unitaires
```typescript
// __tests__/dynamicPermissions.test.ts
describe('Dynamic Permission System', () => {
  it('should create new role', async () => {
    const roleId = await dynamicService.createRole(clubId, {
      label: 'Test Role',
      permissions: ['test.view', 'test.create'],
      level: 1.5,
      module: 'test'
    });

    expect(roleId).toBeDefined();
    const role = await dynamicService.getRole(clubId, roleId);
    expect(role.permissions).toContain('test.view');
  });

  it('should check module access correctly', async () => {
    const user = { role: 'logistique', customPermissions: [] };
    const hasAccess = await dynamicService.canAccessModule(user, 'inventory');
    expect(hasAccess).toBe(true);
  });

  it('should handle legacy roles', async () => {
    const user = { role: 'admin' }; // Ancien rôle
    const hasPermission = await service.hasPermission(user, 'users.view');
    expect(hasPermission).toBe(true);
  });
});
```

#### 5.2 Script de migration
```typescript
// scripts/migratePermissions.ts
async function migrateToaDynamicSystem(clubId: string) {
  console.log('🚀 Début de la migration...');

  // 1. Créer les rôles système
  const systemRoles = ['membre', 'user', 'validateur', 'admin', 'superadmin'];
  for (const roleId of systemRoles) {
    const legacyConfig = getDefaultRoleConfig(roleId);
    await createDynamicRole(clubId, {
      id: roleId,
      ...legacyConfig,
      isSystem: true,
      module: 'core'
    });
  }

  // 2. Créer les permissions système
  const systemPermissions = getAllLegacyPermissions();
  for (const permId of systemPermissions) {
    await createDynamicPermission(clubId, {
      id: permId,
      module: extractModule(permId), // 'users', 'transactions', etc.
      resource: extractResource(permId),
      action: extractAction(permId),
      isSystem: true
    });
  }

  // 3. Migrer les configurations custom existantes
  const existingConfig = await loadExistingPermissionSettings(clubId);
  if (existingConfig) {
    await migrateCustomSettings(clubId, existingConfig);
  }

  // 4. Activer le nouveau système
  await setSystemFlag(clubId, 'dynamicPermissions', true);

  console.log('✅ Migration terminée avec succès');
}
```

## 📊 Estimation des Efforts

| Phase | Durée | Complexité | Risque |
|-------|--------|------------|---------|
| Phase 1 : Préparation | 2-3 jours | Moyenne | Faible |
| Phase 2 : Migration Progressive | 3-4 jours | Élevée | Moyen |
| Phase 3 : Security Rules | 2-3 jours | Élevée | Élevé |
| Phase 4 : Modules | 3-4 jours | Moyenne | Moyen |
| Phase 5 : Tests | 2-3 jours | Moyenne | Faible |
| **TOTAL** | **12-17 jours** | **Élevée** | **Moyen** |

## ⚠️ Risques et Mitigation

### Risques Identifiés

1. **Régression de sécurité**
   - Impact : Critique
   - Mitigation : Tests exhaustifs, deployment progressif, rollback plan

2. **Performance dégradée**
   - Impact : Moyen
   - Mitigation : Caching agressif, index Firebase optimisés

3. **Complexité accrue**
   - Impact : Moyen
   - Mitigation : Documentation détaillée, interface admin intuitive

4. **Migration des données existantes**
   - Impact : Élevé
   - Mitigation : Script de migration testé, backup avant migration

## ✅ Avantages du Nouveau Système

1. **Flexibilité totale** : Créer des rôles/permissions sans modifier le code
2. **Modules indépendants** : Ajouter des fonctionnalités sans toucher au core
3. **Granularité fine** : Permissions par action et ressource
4. **Isolation des données** : Chaque module peut avoir ses propres règles
5. **Évolutivité** : Prêt pour de futures extensions
6. **Maintenance simplifiée** : Configuration via UI au lieu de code

## 🎯 Recommandations

### Option 1 : Migration Complète (Recommandée)
- **Durée** : 3-4 semaines
- **Avantage** : Solution complète et évolutive
- **Inconvénient** : Investissement temps important

### Option 2 : Migration Partielle
- **Durée** : 1-2 semaines
- **Focus** : Seulement les nouveaux modules (inventaire, excursions)
- **Avantage** : Plus rapide
- **Inconvénient** : Deux systèmes à maintenir

### Option 3 : Solution Hybride Simplifiée
- **Durée** : 3-5 jours
- **Approche** : Garder les rôles de base, permettre création de rôles custom
- **Avantage** : Compromis rapide
- **Inconvénient** : Moins flexible

## 🚀 Prochaines Étapes

Si vous décidez de procéder :

1. **Validation** : Revue et approbation du plan
2. **Prototype** : Créer un POC avec le module inventaire
3. **Tests** : Environnement de test séparé
4. **Documentation** : Guide d'administration
5. **Formation** : Session avec les super-admins
6. **Déploiement** : Migration progressive par club

## Conclusion

Le passage à un système de permissions entièrement dynamique est **techniquement faisable** et apportera une **flexibilité significative** à CalyCompta. L'investissement en temps (12-17 jours) est justifié par les bénéfices à long terme, notamment pour l'ajout de nouveaux modules comme l'inventaire et les excursions.

La complexité principale réside dans la migration des Security Rules Firestore et la garantie de rétrocompatibilité. Cependant, avec une approche progressive et des tests rigoureux, les risques peuvent être maîtrisés.

**Recommandation finale** : Procéder avec l'Option 1 (Migration Complète) en commençant par un prototype sur le module inventaire pour valider l'architecture.