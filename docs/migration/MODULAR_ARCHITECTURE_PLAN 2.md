# Architecture Modulaire : Paramètres + Permissions Compartimentés

## 🎯 Vision : Une Architecture Vraiment Modulaire

Votre observation est excellente ! Au lieu d'avoir des permissions et paramètres séparés, nous devrions avoir des **modules autonomes** avec leurs propres paramètres ET permissions intégrés.

## 📊 Problème Actuel

### Situation Actuelle (Fragmentée)
```
Permissions ────────────┐
                        ├──> Complexité
Paramètres  ────────────┤    (tout est mélangé)
                        │
Code métier ────────────┘
```

**Problèmes identifiés :**
- Les paramètres sont partiellement centralisés dans `FirebaseSettingsService` (740 lignes!)
- Les permissions sont hardcodées séparément
- Pas de lien clair entre paramètres et permissions d'un module
- Difficile de savoir quels paramètres affectent quelle partie

## 🏗️ Nouvelle Architecture Proposée : Modules Autonomes

### Concept : Chaque Module = Unité Complète

```typescript
interface ModuleDefinition {
  // Identification
  id: string;                          // 'transactions', 'inventory', 'excursions'
  name: string;                        // Nom affiché
  description: string;
  icon: string;

  // Paramètres du module
  settings: ModuleSettings;

  // Permissions du module
  permissions: ModulePermissions;

  // Configuration
  config: ModuleConfig;

  // Métadonnées
  version: string;
  isCore: boolean;                     // Module système ou extension
  dependencies?: string[];              // Autres modules requis
}
```

## 📦 Exemples Concrets de Modules

### 1. Module Transactions Bancaires

```typescript
const transactionsModule: ModuleDefinition = {
  id: 'transactions',
  name: 'Transactions Bancaires',
  description: 'Gestion des transactions et réconciliation bancaire',
  icon: 'CreditCard',

  settings: {
    // Paramètres de téléchargement
    download: {
      autoRenameFiles: boolean,
      filenamePattern: string,
      useTransactionNumber: boolean
    },

    // Paramètres de catégorisation
    categorization: {
      enableAI: boolean,
      autoSuggest: boolean,
      requireCategory: boolean,
      categories: Category[]
    },

    // Paramètres de validation
    validation: {
      requireDoubleSignature: boolean,
      signatureThreshold: number,
      allowBackdating: boolean,
      maxBackdatingDays: number
    },

    // Paramètres d'import
    import: {
      supportedFormats: ['CSV', 'OFX', 'MT940'],
      dateFormat: string,
      decimalSeparator: string,
      columnMapping: Record<string, string>
    }
  },

  permissions: {
    // Permissions de base
    basic: [
      { id: 'view', label: 'Voir les transactions', description: 'Accès en lecture' },
      { id: 'export', label: 'Exporter', description: 'Exporter les données' }
    ],

    // Permissions de gestion
    management: [
      { id: 'create', label: 'Créer', description: 'Ajouter des transactions' },
      { id: 'update', label: 'Modifier', description: 'Éditer les transactions' },
      { id: 'delete', label: 'Supprimer', description: 'Effacer les transactions' },
      { id: 'categorize', label: 'Catégoriser', description: 'Assigner des catégories' }
    ],

    // Permissions avancées
    advanced: [
      { id: 'sign', label: 'Signer', description: 'Signer numériquement' },
      { id: 'reconcile', label: 'Réconcilier', description: 'Pointer les transactions' },
      { id: 'link', label: 'Lier', description: 'Associer aux factures' }
    ],

    // Permissions d'administration
    admin: [
      { id: 'configure', label: 'Configurer', description: 'Modifier les paramètres' },
      { id: 'audit', label: 'Auditer', description: 'Voir l\'historique complet' }
    ]
  },

  config: {
    routes: [
      { path: '/transactions', component: 'TransactionList', permission: 'transactions.view' },
      { path: '/transactions/import', component: 'TransactionImport', permission: 'transactions.create' },
      { path: '/transactions/settings', component: 'TransactionSettings', permission: 'transactions.configure' }
    ],

    menuItems: [
      {
        label: 'Transactions',
        icon: 'CreditCard',
        permission: 'transactions.view',
        subItems: [
          { label: 'Liste', path: '/transactions' },
          { label: 'Import', path: '/transactions/import' },
          { label: 'Paramètres', path: '/transactions/settings' }
        ]
      }
    ],

    widgets: [
      { id: 'transaction-summary', position: 'dashboard', permission: 'transactions.view' },
      { id: 'pending-signatures', position: 'sidebar', permission: 'transactions.sign' }
    ]
  }
};
```

### 2. Module Inventaire

```typescript
const inventoryModule: ModuleDefinition = {
  id: 'inventory',
  name: 'Gestion d\'Inventaire',
  description: 'Suivi du matériel et des stocks',
  icon: 'Package',

  settings: {
    // Paramètres généraux
    general: {
      enableBarcodes: boolean,
      defaultLocation: string,
      autoGenerateReferences: boolean
    },

    // Paramètres d'alertes
    alerts: {
      lowStockWarning: boolean,
      lowStockThreshold: number,
      maintenanceReminders: boolean,
      maintenanceFrequencyDays: number,
      loanReturnReminders: boolean,
      reminderDaysBefore: number
    },

    // Paramètres de prêt
    loans: {
      requireCaution: boolean,
      defaultCautionAmount: number,
      maxLoanDurationDays: number,
      requireApproval: boolean,
      autoSendConfirmation: boolean
    },

    // Types d'articles personnalisés
    itemTypes: [
      { id: string, label: string, prefix: string, customFields: Field[] }
    ],

    // Emplacements
    locations: [
      { id: string, name: string, building: string, room: string }
    ]
  },

  permissions: {
    basic: [
      { id: 'view', label: 'Consulter l\'inventaire' },
      { id: 'search', label: 'Rechercher des articles' }
    ],

    management: [
      { id: 'add_items', label: 'Ajouter des articles' },
      { id: 'edit_items', label: 'Modifier des articles' },
      { id: 'delete_items', label: 'Supprimer des articles' },
      { id: 'move_items', label: 'Déplacer des articles' }
    ],

    loans: [
      { id: 'create_loan', label: 'Créer un prêt' },
      { id: 'approve_loan', label: 'Approuver les prêts' },
      { id: 'return_item', label: 'Enregistrer les retours' },
      { id: 'manage_cautions', label: 'Gérer les cautions' }
    ],

    admin: [
      { id: 'configure', label: 'Configurer le module' },
      { id: 'manage_types', label: 'Gérer les types d\'articles' },
      { id: 'manage_locations', label: 'Gérer les emplacements' },
      { id: 'view_history', label: 'Voir l\'historique complet' }
    ]
  },

  config: {
    // Configuration similaire...
  }
};
```

### 3. Module Excursions

```typescript
const excursionsModule: ModuleDefinition = {
  id: 'excursions',
  name: 'Excursions & Événements',
  description: 'Organisation d\'excursions et événements',
  icon: 'MapPin',

  settings: {
    booking: {
      requireAdvancePayment: boolean,
      paymentDeadlineDays: number,
      allowGuestBookings: boolean,
      maxGuestsPerMember: number
    },

    pricing: {
      memberDiscount: number,
      earlyBirdDiscount: number,
      earlyBirdDaysBefore: number,
      childDiscount: number
    },

    communication: {
      sendConfirmationEmail: boolean,
      sendReminderEmail: boolean,
      reminderDaysBefore: number,
      includeCalendarInvite: boolean
    },

    cancellation: {
      allowCancellation: boolean,
      cancellationDeadlineDays: number,
      refundPolicy: 'full' | 'partial' | 'none',
      partialRefundPercent: number
    }
  },

  permissions: {
    participant: [
      { id: 'view_public', label: 'Voir les excursions publiques' },
      { id: 'register', label: 'S\'inscrire aux excursions' },
      { id: 'cancel_own', label: 'Annuler ses inscriptions' }
    ],

    organizer: [
      { id: 'create', label: 'Créer des excursions' },
      { id: 'edit_own', label: 'Modifier ses excursions' },
      { id: 'manage_participants', label: 'Gérer les participants' },
      { id: 'send_communications', label: 'Envoyer des communications' }
    ],

    admin: [
      { id: 'manage_all', label: 'Gérer toutes les excursions' },
      { id: 'configure', label: 'Configurer le module' },
      { id: 'financial_reports', label: 'Rapports financiers' }
    ]
  }
};
```

## 🏛️ Architecture Technique

### 1. Structure Firebase Réorganisée

```
/clubs/{clubId}/
├── modules/                           # Configuration des modules
│   ├── {moduleId}/
│   │   ├── definition                 # ModuleDefinition complète
│   │   ├── settings                   # Paramètres actuels du module
│   │   ├── permissions                # Configuration des permissions
│   │   └── metadata                   # Version, activation, etc.
│   │
│   ├── transactions/
│   ├── inventory/
│   ├── excursions/
│   └── ...
│
├── module_data/                       # Données des modules
│   ├── transactions/
│   │   └── {data...}
│   ├── inventory/
│   │   ├── items/
│   │   ├── loans/
│   │   └── movements/
│   └── excursions/
│       ├── events/
│       └── bookings/
│
├── roles/                             # Rôles dynamiques
│   └── {roleId}/
│       ├── name
│       ├── description
│       └── modulePermissions: {       # Permissions par module
│           transactions: ['view', 'create'],
│           inventory: ['view'],
│           excursions: ['view', 'register']
│       }
│
└── members/
    └── {memberId}/
        ├── roleId
        └── customPermissions: {       # Surcharge par module
            inventory: ['manage_loans']
        }
```

### 2. Service de Gestion Modulaire

```typescript
// services/moduleService.ts
export class ModuleService {
  private modules: Map<string, ModuleDefinition> = new Map();
  private moduleSettings: Map<string, any> = new Map();
  private modulePermissions: Map<string, ModulePermissions> = new Map();

  // Chargement d'un module
  async loadModule(clubId: string, moduleId: string): Promise<ModuleDefinition> {
    const modulePath = `clubs/${clubId}/modules/${moduleId}`;
    const moduleDoc = await getDoc(doc(db, modulePath, 'definition'));

    if (!moduleDoc.exists()) {
      throw new Error(`Module ${moduleId} not found`);
    }

    const module = moduleDoc.data() as ModuleDefinition;

    // Charger les paramètres actuels
    const settingsDoc = await getDoc(doc(db, modulePath, 'settings'));
    if (settingsDoc.exists()) {
      this.moduleSettings.set(moduleId, settingsDoc.data());
    }

    // Charger la configuration des permissions
    const permissionsDoc = await getDoc(doc(db, modulePath, 'permissions'));
    if (permissionsDoc.exists()) {
      this.modulePermissions.set(moduleId, permissionsDoc.data());
    }

    this.modules.set(moduleId, module);
    return module;
  }

  // Vérifier une permission dans un module
  hasModulePermission(
    user: Membre,
    moduleId: string,
    permissionId: string
  ): boolean {
    // Vérifier si le module est actif
    const module = this.modules.get(moduleId);
    if (!module) return false;

    // Récupérer les permissions du rôle pour ce module
    const userRole = this.getRoleById(user.roleId);
    const modulePerms = userRole?.modulePermissions?.[moduleId] || [];

    // Vérifier permission du rôle
    if (modulePerms.includes(permissionId)) return true;

    // Vérifier permissions custom
    const customPerms = user.customPermissions?.[moduleId] || [];
    if (customPerms.includes(permissionId)) return true;

    return false;
  }

  // Obtenir les paramètres d'un module
  getModuleSettings(moduleId: string): any {
    return this.moduleSettings.get(moduleId) || {};
  }

  // Sauvegarder les paramètres d'un module
  async saveModuleSettings(
    clubId: string,
    moduleId: string,
    settings: any
  ): Promise<void> {
    const modulePath = `clubs/${clubId}/modules/${moduleId}`;

    // Valider les paramètres selon le schéma du module
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module ${moduleId} not loaded`);
    }

    // Validation (à implémenter selon le schéma)
    this.validateModuleSettings(module, settings);

    // Sauvegarder
    await setDoc(doc(db, modulePath, 'settings'), {
      ...settings,
      updatedAt: serverTimestamp(),
      updatedBy: getCurrentUserId()
    });

    this.moduleSettings.set(moduleId, settings);
  }

  // Activer/Désactiver un module
  async toggleModule(
    clubId: string,
    moduleId: string,
    enabled: boolean
  ): Promise<void> {
    const modulePath = `clubs/${clubId}/modules/${moduleId}`;

    await updateDoc(doc(db, modulePath, 'metadata'), {
      isActive: enabled,
      updatedAt: serverTimestamp(),
      updatedBy: getCurrentUserId()
    });

    // Déclencher les hooks d'activation/désactivation
    if (enabled) {
      await this.onModuleEnabled(clubId, moduleId);
    } else {
      await this.onModuleDisabled(clubId, moduleId);
    }
  }

  // Installer un nouveau module
  async installModule(
    clubId: string,
    moduleDefinition: ModuleDefinition
  ): Promise<void> {
    const modulePath = `clubs/${clubId}/modules/${moduleDefinition.id}`;

    // Créer la structure du module
    const batch = writeBatch(db);

    // Definition
    batch.set(doc(db, modulePath, 'definition'), moduleDefinition);

    // Settings par défaut
    batch.set(doc(db, modulePath, 'settings'), {
      ...moduleDefinition.settings,
      createdAt: serverTimestamp(),
      createdBy: getCurrentUserId()
    });

    // Permissions par défaut
    batch.set(doc(db, modulePath, 'permissions'), {
      ...moduleDefinition.permissions,
      createdAt: serverTimestamp()
    });

    // Metadata
    batch.set(doc(db, modulePath, 'metadata'), {
      isActive: true,
      version: moduleDefinition.version,
      installedAt: serverTimestamp(),
      installedBy: getCurrentUserId()
    });

    await batch.commit();

    // Créer les collections de données si nécessaire
    await this.createModuleDataStructure(clubId, moduleDefinition.id);
  }
}
```

### 3. Interface d'Administration Unifiée

```tsx
// components/admin/ModuleManager.tsx
export const ModuleManager: React.FC = () => {
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Liste des modules */}
      <div className="col-span-3">
        <ModuleList
          modules={modules}
          onSelect={setSelectedModule}
          onToggle={handleToggleModule}
        />
      </div>

      {/* Détails du module sélectionné */}
      <div className="col-span-9">
        {selectedModule && (
          <ModuleDetails moduleId={selectedModule}>
            {/* Onglets */}
            <Tabs>
              <TabPanel label="Paramètres">
                <ModuleSettings
                  moduleId={selectedModule}
                  settings={moduleSettings}
                  onChange={handleSettingsChange}
                />
              </TabPanel>

              <TabPanel label="Permissions">
                <ModulePermissions
                  moduleId={selectedModule}
                  permissions={modulePermissions}
                  roles={roles}
                  onChange={handlePermissionChange}
                />
              </TabPanel>

              <TabPanel label="Données">
                <ModuleDataManager
                  moduleId={selectedModule}
                  stats={moduleStats}
                />
              </TabPanel>

              <TabPanel label="Historique">
                <ModuleAuditLog
                  moduleId={selectedModule}
                  entries={auditEntries}
                />
              </TabPanel>
            </Tabs>
          </ModuleDetails>
        )}
      </div>
    </div>
  );
};
```

### 4. Composant de Configuration par Module

```tsx
// components/modules/ModuleSettingsPanel.tsx
interface ModuleSettingsPanelProps {
  module: ModuleDefinition;
  settings: any;
  permissions: string[];
  onSettingsChange: (settings: any) => void;
  onPermissionsChange: (permissions: string[]) => void;
}

export const ModuleSettingsPanel: React.FC<ModuleSettingsPanelProps> = ({
  module,
  settings,
  permissions,
  onSettingsChange,
  onPermissionsChange
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-6">
        <Icon name={module.icon} className="w-8 h-8 mr-3" />
        <div>
          <h2 className="text-xl font-bold">{module.name}</h2>
          <p className="text-gray-600">{module.description}</p>
        </div>
      </div>

      {/* Paramètres du module */}
      <div className="space-y-6">
        <SettingsSection title="Configuration">
          {renderModuleSettings(module.settings, settings, onSettingsChange)}
        </SettingsSection>

        {/* Permissions du module */}
        <SettingsSection title="Permissions">
          <PermissionCheckboxes
            available={module.permissions}
            selected={permissions}
            onChange={onPermissionsChange}
          />
        </SettingsSection>

        {/* Actions du module */}
        <SettingsSection title="Actions">
          <div className="flex gap-3">
            <button className="btn-primary">
              Sauvegarder
            </button>
            <button className="btn-secondary">
              Réinitialiser
            </button>
            <button className="btn-danger">
              Désactiver le module
            </button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
};
```

## 🎯 Avantages de cette Architecture

### 1. **Clarté et Organisation**
- Chaque module est une unité complète et autonome
- Les paramètres et permissions sont groupés logiquement
- Facile de comprendre ce qui affecte quoi

### 2. **Évolutivité**
- Ajouter un nouveau module = ajouter une définition
- Pas besoin de modifier le code core
- Les modules peuvent évoluer indépendamment

### 3. **Maintenance Simplifiée**
- Un problème dans un module n'affecte pas les autres
- Tests isolés par module
- Documentation automatique depuis la définition

### 4. **Expérience Utilisateur**
- Interface d'admin cohérente pour tous les modules
- Paramètres et permissions au même endroit
- Activation/désactivation simple des fonctionnalités

### 5. **Sécurité Renforcée**
- Isolation des données par module
- Permissions granulaires par module
- Audit trail par module

## 📋 Plan de Migration

### Phase 1 : Infrastructure (3-4 jours)
1. Créer les types TypeScript pour `ModuleDefinition`
2. Implémenter `ModuleService`
3. Créer la structure Firebase
4. Migrer un premier module (Inventaire)

### Phase 2 : Migration des Modules Core (5-7 jours)
1. Module Transactions
2. Module Demandes/Dépenses
3. Module Événements
4. Module Communication
5. Module Rapports

### Phase 3 : Interface d'Administration (3-4 jours)
1. Créer `ModuleManager` component
2. Créer les interfaces de configuration par module
3. Intégrer dans le dashboard des paramètres
4. Tests d'intégration

### Phase 4 : Documentation et Tests (2-3 jours)
1. Documentation développeur
2. Guide administrateur
3. Tests unitaires et d'intégration
4. Migration des clubs pilotes

## 🚀 Impact sur le Système Actuel

### Ce qui change :
- Architecture des paramètres (de centralisé à modulaire)
- Structure Firebase (nouvelle organisation)
- Interface d'administration (unifiée)

### Ce qui reste compatible :
- Les données existantes (migration automatique)
- L'API actuelle (wrapper de compatibilité)
- Les permissions existantes (mappées aux nouveaux modules)

## 💡 Recommandation Finale

Cette architecture modulaire résout élégamment les problèmes identifiés :

1. **Plus de clarté** : Paramètres et permissions groupés par module
2. **Plus de flexibilité** : Modules activables/désactivables
3. **Plus maintenable** : Code organisé par domaine fonctionnel
4. **Plus évolutif** : Nouveaux modules sans toucher au core

**Effort estimé** : 13-18 jours pour une migration complète

**ROI** : Très élevé - simplification majeure de l'architecture et de la maintenance future

Cette approche est **LA** solution pour transformer CalyCompta en une plateforme vraiment modulaire et extensible.