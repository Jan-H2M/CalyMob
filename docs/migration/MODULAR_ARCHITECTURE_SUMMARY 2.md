# Architecture Modulaire - Résumé Exécutif & Schémas

## 📊 Vue d'Ensemble

Ce document présente l'architecture complète du système modulaire de CalyCompta avec des schémas visuels et un résumé exécutif.

---

## 🎯 Résumé Exécutif

### Objectif
Transformer CalyCompta d'une architecture monolithique vers une architecture **100% modulaire** permettant :
- ✅ Ajout de nouveaux modules sans modification du code core
- ✅ Gestion dynamique des permissions par module
- ✅ Paramètres compartimentés par fonctionnalité
- ✅ Activation/désactivation à chaud des modules
- ✅ Extensibilité illimitée

### Durée Estimée
**15-20 jours** de développement + tests + déploiement

### ROI
- **Court terme** : Facilite l'ajout de modules Inventaire et Excursions
- **Moyen terme** : Réduit drastiquement le temps d'ajout de nouvelles fonctionnalités
- **Long terme** : Architecture évolutive pour 5+ années

---

## 🏗️ Architecture Technique

### Schéma Global

```
┌─────────────────────────────────────────────────────────────────┐
│                        CALLYCOMPTA                               │
│                    Architecture Modulaire                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         COUCHE UI                                │
├─────────────────────────────────────────────────────────────────┤
│  ModuleManager  │  ModuleDetails  │  ModuleSettings  │  Widgets │
└────────┬────────────────┬─────────────────┬────────────────┬────┘
         │                │                 │                │
         └────────────────┴─────────────────┴────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                    COUCHE SERVICES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ModuleService (Core)                        │  │
│  │  • loadModule()                                          │  │
│  │  • installModule()                                       │  │
│  │  • hasModulePermission()                                 │  │
│  │  • updateModuleSettings()                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Transaction  │  │   Expenses   │  │    Inventory       │   │
│  │   Service    │  │   Service    │  │    Service         │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
│                                                                  │
└────────┬──────────────────┬───────────────────┬─────────────────┘
         │                  │                   │
         └──────────────────┴───────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                   COUCHE DONNÉES (Firebase)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /module_definitions/              (Global)                     │
│    ├── transactions                                             │
│    ├── expenses                                                 │
│    ├── events                                                   │
│    ├── inventory                                                │
│    └── excursions                                               │
│                                                                  │
│  /clubs/{clubId}/                                               │
│    │                                                            │
│    ├── modules/                    (Instances)                 │
│    │   ├── transactions/                                       │
│    │   │   ├── settings                                        │
│    │   │   ├── permissions                                     │
│    │   │   └── metadata                                        │
│    │   └── ...                                                 │
│    │                                                            │
│    ├── roles/                      (Rôles modulaires)          │
│    │   ├── superadmin/                                         │
│    │   │   └── modulePermissions: {                            │
│    │   │       transactions: ['view', 'create', ...],          │
│    │   │       inventory: ['view', 'manage', ...]              │
│    │   │   }                                                   │
│    │   └── ...                                                 │
│    │                                                            │
│    └── module_data/                (Données)                   │
│        ├── transactions/                                       │
│        │   ├── items/{id}                                      │
│        │   └── metadata                                        │
│        ├── inventory/                                          │
│        │   ├── items/{id}                                      │
│        │   ├── loans/{id}                                      │
│        │   └── metadata                                        │
│        └── ...                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Flux de Permissions

### Schéma du Flux

```
┌─────────────────────────────────────────────────────────────────┐
│ User Action: "Je veux voir l'inventaire"                        │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. AuthContext récupère l'utilisateur actuel                    │
│    → userId: "user123"                                           │
│    → clubId: "club456"                                           │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Récupérer le rôle de l'utilisateur                           │
│    → clubs/club456/members/user123                              │
│    → roleId: "logistique"                                       │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Récupérer les permissions du rôle                            │
│    → clubs/club456/roles/logistique                             │
│    → modulePermissions: {                                       │
│        inventory: ['view', 'manage'],                           │
│        transactions: []  // Pas d'accès                         │
│      }                                                           │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ModuleService.hasModulePermission()                          │
│    → moduleId: 'inventory'                                      │
│    → permissionId: 'view'                                       │
│    → Result: ✅ TRUE                                            │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Vérifier si le module est actif                              │
│    → clubs/club456/modules/inventory                            │
│    → isActive: true                                             │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Firestore Security Rules (Double Vérification)               │
│    function hasModulePermission(clubId, moduleId, permission) { │
│      let roleId = getUserRole(clubId);                          │
│      let role = getRole(clubId, roleId);                        │
│      return permission in role.modulePermissions[moduleId];     │
│    }                                                             │
│    → Result: ✅ TRUE                                            │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ✅ ACCÈS AUTORISÉ                                               │
│ → Charger module_data/inventory/items/                          │
└─────────────────────────────────────────────────────────────────┘
```

### Exemple : Accès Refusé

```
User: "user" role → Veut accéder aux transactions
                                    │
                                    ▼
      roleId: "user" → modulePermissions: {
                         transactions: [],  ❌ Pas de permissions
                         expenses: ['view_own', 'create']
                       }
                                    │
                                    ▼
              hasModulePermission('transactions', 'view')
                                    │
                                    ▼
                              ❌ FALSE
                                    │
                                    ▼
                    Afficher: "Accès Refusé"
```

---

## 📦 Structure d'un Module

### Anatomie Complète

```typescript
Module "Inventory" {

  // ========== IDENTIFICATION ==========
  id: 'inventory'
  name: 'Gestion d\'Inventaire'
  description: 'Suivi du matériel, stocks et prêts'
  version: '1.0.0'

  // ========== CLASSIFICATION ==========
  category: 'operations'
  isCore: false
  isActive: false
  dependencies: []

  // ========== PARAMÈTRES ==========
  settings: {
    general: {
      enableBarcodes: {
        type: 'boolean',
        default: false,
        label: 'Activer les codes-barres'
      },
      autoGenerateReferences: {
        type: 'boolean',
        default: true,
        label: 'Références automatiques'
      }
    },

    alerts: {
      lowStockWarning: {
        type: 'boolean',
        default: true,
        label: 'Alerte stock bas'
      },
      lowStockThreshold: {
        type: 'number',
        default: 5,
        min: 1,
        max: 100,
        dependsOn: 'alerts.lowStockWarning'
      }
    },

    loans: {
      requireApproval: {
        type: 'boolean',
        default: false
      },
      maxLoanDurationDays: {
        type: 'number',
        default: 30,
        min: 1,
        max: 365
      }
    }
  }

  // ========== PERMISSIONS ==========
  permissions: {
    viewer: [
      {
        id: 'view',
        label: 'Consulter l\'inventaire',
        category: 'view',
        riskLevel: 'low'
      }
    ],

    operator: [
      {
        id: 'add_items',
        label: 'Ajouter du matériel',
        category: 'create',
        riskLevel: 'medium'
      },
      {
        id: 'create_loan',
        label: 'Créer un prêt',
        category: 'create',
        riskLevel: 'medium'
      }
    ],

    manager: [
      {
        id: 'delete_items',
        label: 'Supprimer du matériel',
        category: 'delete',
        riskLevel: 'high'
      },
      {
        id: 'approve_loans',
        label: 'Approuver les prêts',
        category: 'manage',
        riskLevel: 'medium'
      }
    ],

    admin: [
      {
        id: 'configure',
        label: 'Configurer le module',
        category: 'admin',
        riskLevel: 'high'
      }
    ]
  }

  // ========== CONFIGURATION ==========
  config: {
    routes: [
      '/inventory',
      '/inventory/items',
      '/inventory/loans'
    ],

    menuItems: [
      {
        label: 'Inventaire',
        icon: 'Package',
        path: '/inventory',
        permission: 'view',
        subItems: [...]
      }
    ],

    widgets: [
      {
        id: 'inventory-status',
        component: 'InventoryStatusWidget',
        position: 'dashboard'
      }
    ],

    scheduledTasks: [
      {
        id: 'maintenance-check',
        schedule: '0 9 * * *',  // Cron: Tous les jours à 9h
        handler: 'checkMaintenanceDue'
      }
    ]
  }

  // ========== HOOKS ==========
  hooks: {
    onInstall: 'createDefaultItemTypes',
    onEnable: 'startMaintenanceScheduler',
    onDisable: 'stopMaintenanceScheduler'
  }
}
```

---

## 🔄 Flux d'Installation d'un Module

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin: "Installer le module Inventaire"                         │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. ModuleService.installModule('inventory')                     │
└────────┬────────────────────────────────────────────────────────┘
         │
         ├─────► Vérifier les dépendances
         │       ✓ Aucune dépendance requise
         │
         ├─────► Vérifier les incompatibilités
         │       ✓ Aucune incompatibilité
         │
         ├─────► Créer l'instance du module
         │       → /clubs/club456/modules/inventory/
         │           {
         │             moduleId: 'inventory',
         │             settings: { /* defaults */ },
         │             permissions: { /* defaults */ },
         │             isActive: true,
         │             installedAt: now,
         │             installedBy: 'admin123'
         │           }
         │
         ├─────► Créer la structure de données
         │       → /clubs/club456/module_data/inventory/
         │           ├── metadata
         │           ├── items/
         │           └── loans/
         │
         ├─────► Exécuter le hook d'installation
         │       → createDefaultItemTypes()
         │           • Créer types: "Bouteille", "Détendeur", etc.
         │
         ├─────► Créer les routes
         │       → Ajouter /inventory au routeur
         │
         ├─────► Ajouter au menu
         │       → Item "Inventaire" dans le menu principal
         │
         └─────► Démarrer les tâches planifiées
                 → Schedule: maintenance-check (9h daily)
                             loan-reminder (10h daily)
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ ✅ Module Inventaire installé et actif                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎭 Cas d'Usage Concrets

### Cas 1 : Créer un Nouveau Rôle "Responsable Logistique"

```typescript
// 1. Créer le rôle
const roleId = await moduleService.createRole(clubId, {
  name: 'Responsable Logistique',
  description: 'Gestion exclusive de l\'inventaire',
  level: 1.5,  // Entre user (1) et validateur (2)
  color: '#8B5CF6',
  icon: 'Package',
  isSystem: false,

  // Permissions par module
  modulePermissions: {
    inventory: [
      'view',
      'search',
      'add_items',
      'edit_items',
      'move_items',
      'create_loan',
      'return_item',
      'approve_loans',
      'manage_cautions'
    ],
    // Aucun accès aux autres modules
    transactions: [],
    expenses: ['view_own', 'create'],  // Peut faire des demandes
    events: ['view', 'register']       // Peut voir et s'inscrire
  },

  canManage: []  // Ne peut gérer personne
});

// 2. Assigner le rôle à un utilisateur
await updateDoc(doc(db, `clubs/${clubId}/members/${userId}`), {
  roleId: roleId
});

// ✅ L'utilisateur a maintenant accès UNIQUEMENT à l'inventaire
```

### Cas 2 : Créer le Module Excursions avec ses Propres Paramètres

```typescript
// 1. Définir le module
const excursionsModule: ModuleDefinition = {
  id: 'excursions',
  name: 'Excursions & Voyages',

  settings: {
    booking: {
      requireAdvancePayment: true,
      paymentDeadlineDays: 14
    },
    cancellation: {
      allowCancellation: true,
      refundPolicy: 'partial',
      partialRefundPercent: 70
    }
  },

  permissions: {
    traveler: ['view', 'book', 'cancel_own'],
    organizer: ['create', 'manage_bookings', 'manage_payments'],
    admin: ['configure', 'financial_report']
  }
};

// 2. Installer le module
await moduleService.installModule(clubId, 'excursions');

// 3. Créer un rôle "Organisateur Excursions"
await moduleService.createRole(clubId, {
  name: 'Organisateur Excursions',
  modulePermissions: {
    excursions: ['create', 'manage_bookings', 'manage_payments'],
    expenses: ['view_all', 'create']  // Pour les frais d'excursion
  }
});

// ✅ Module prêt à l'emploi avec rôle dédié
```

### Cas 3 : Paramètres Personnalisés par Module

```typescript
// Configurer les paramètres du module Inventaire
await moduleService.updateModuleSettings(clubId, 'inventory', {
  // Alertes
  'alerts.lowStockWarning': true,
  'alerts.lowStockThreshold': 3,
  'alerts.maintenanceReminders': true,
  'alerts.maintenanceFrequencyDays': 180,

  // Prêts
  'loans.requireApproval': false,      // Pas d'approbation nécessaire
  'loans.requireCaution': true,        // Mais caution obligatoire
  'loans.defaultCautionAmount': 100,   // 100€ par défaut
  'loans.maxLoanDurationDays': 14,     // 2 semaines max
  'loans.sendReturnReminder': true,
  'loans.reminderDaysBefore': 2
});

// Configurer les paramètres du module Excursions (DIFFÉRENTS!)
await moduleService.updateModuleSettings(clubId, 'excursions', {
  // Réservation
  'booking.requireAdvancePayment': true,
  'booking.advancePaymentPercent': 30,  // Acompte de 30%
  'booking.paymentDeadlineDays': 21,    // 3 semaines avant

  // Tarification
  'pricing.memberDiscount': 15,          // 15% membres
  'pricing.earlyBirdDiscount': 10,       // 10% early bird
  'pricing.earlyBirdDaysBefore': 45,

  // Annulation
  'cancellation.allowCancellation': true,
  'cancellation.cancellationDeadlineDays': 10,
  'cancellation.refundPolicy': 'partial',
  'cancellation.partialRefundPercent': 80
});

// ✅ Chaque module a ses propres paramètres, bien séparés
```

---

## 📈 Avantages Mesurables

### Avant (Architecture Actuelle)

```
Ajouter un nouveau module "Excursions":

1. Modifier src/types/user.types.ts
   → Ajouter permissions hardcodées                      [30 min]

2. Modifier src/services/permissionService.ts
   → Ajouter logique de permissions                      [1h]

3. Modifier firestore.rules
   → Ajouter règles de sécurité                          [1h]

4. Créer les composants
   → Pages, formulaires, etc.                            [2 jours]

5. Modifier src/services/firebaseSettingsService.ts
   → Ajouter gestion des paramètres                      [2h]

6. Mettre à jour tous les rôles existants
   → Manuellement pour chaque club                       [1h/club]

7. Tests et déploiement
   → Tests de non-régression                             [1 jour]

TOTAL: ~4-5 jours + risque de régression élevé
```

### Après (Architecture Modulaire)

```
Ajouter un nouveau module "Excursions":

1. Créer la définition du module
   → src/config/modules/excursionsModule.ts              [2h]
   • Paramètres
   • Permissions
   • Routes
   • Widgets

2. Créer les composants
   → Pages, formulaires (inchangé)                       [2 jours]

3. Déployer
   → npm run deploy:module excursions                    [10 min]

TOTAL: ~2.5 jours + ZERO régression
```

**Gain : 50% de temps + Sécurité accrue**

---

## 🚀 Migration Progressive

### Stratégie Recommandée

```
Phase 1 : Infrastructure (Semaine 1)
├─ Jour 1-2 : Créer types et ModuleService
├─ Jour 3-4 : Créer définitions modules core
└─ Jour 5   : Tests unitaires

Phase 2 : Migration (Semaine 2)
├─ Jour 6-7 : Migrer données existantes
├─ Jour 8   : Migrer rôles et permissions
└─ Jour 9-10: Validation et rollback tests

Phase 3 : Interface (Semaine 3)
├─ Jour 11-12: Créer ModuleManager UI
├─ Jour 13   : Créer composants config
└─ Jour 14-15: Tests d'intégration

Phase 4 : Déploiement (Semaine 3-4)
├─ Jour 16   : Security rules
├─ Jour 17   : Migration club pilote
├─ Jour 18-19: Migration progressive
└─ Jour 20   : Monitoring et support
```

---

## ⚡ Quick Start - Premiers Pas

### Pour Commencer Immédiatement

```bash
# 1. Cloner le repo et installer
npm install

# 2. Créer les fichiers de base
npm run generate:module-structure

# 3. Lancer les tests
npm run test:modules

# 4. Démarrer le dev
npm run dev

# 5. Accéder au ModuleManager
# http://localhost:5173/settings/modules
```

### Premier Module à Créer : Inventaire

```typescript
// src/config/modules/inventoryModule.ts
import type { ModuleDefinition } from '@/types/module.types';

export const inventoryModule: ModuleDefinition = {
  id: 'inventory',
  name: 'Gestion d\'Inventaire',
  // ... (voir définition complète dans le plan)
};
```

---

## 📞 Support & Questions

### Pendant la Migration

**Questions Fréquentes :**

1. **Que deviennent les données existantes ?**
   → Elles sont migrées automatiquement vers `module_data/`

2. **Les anciens rôles fonctionnent-ils encore ?**
   → Oui, ils sont automatiquement convertis en rôles modulaires

3. **Puis-je revenir en arrière ?**
   → Oui, backup complet + rollback script disponible

4. **Combien de temps d'indisponibilité ?**
   → Migration à chaud = 0 temps d'arrêt

5. **Les performances sont-elles affectées ?**
   → Non, optimisations incluses (cache, indexes)

### Contact

- **Documentation** : `docs/migration/`
- **Issues** : GitHub Issues
- **Slack** : #migration-modulaire

---

## ✅ Checklist de Validation

### Avant de Commencer

- [ ] Backup complet de la base de données
- [ ] Environnement de dev/staging disponible
- [ ] Tests unitaires existants passent
- [ ] Équipe informée du planning

### Pendant la Migration

- [ ] Logs de migration activés
- [ ] Monitoring en place
- [ ] Rollback plan testé
- [ ] Club pilote identifié

### Après la Migration

- [ ] Tous les modules core installés
- [ ] Permissions fonctionnelles
- [ ] Paramètres migrés correctement
- [ ] Tests de non-régression OK
- [ ] Documentation à jour
- [ ] Formation admin effectuée

---

## 🎉 Conclusion

L'architecture modulaire proposée transforme CalyCompta en une **plateforme extensible** et **maintenable** pour les années à venir.

**Prochaines étapes :**
1. ✅ Valider l'architecture (CE DOCUMENT)
2. 🚀 Commencer Phase 1 : Infrastructure
3. 📦 Créer le premier module (Inventaire)
4. 🔄 Migrer progressivement les modules existants
5. 🎯 Déployer en production

**L'investissement de 15-20 jours sera rentabilisé dès le deuxième module ajouté !**

---

*Document créé le : 2025-01-16*
*Version : 1.0*
*Auteur : Migration Team*
