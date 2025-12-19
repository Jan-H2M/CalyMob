# 📦 Scripts de Backup & Restore Firestore

## Vue d'ensemble

Trois scripts pour gérer les backups Firestore :

1. **`backup-firestore.js`** - Exporte toutes les collections en JSON
2. **`restore-firestore.js`** - Restaure les collections depuis JSON
3. **`compare-firestore.js`** - Compare backup vs Firestore actuel

---

## 🔧 Configuration Initiale

### Pour Production

1. **Télécharger Service Account Key depuis Firebase Console :**
   - Aller sur : https://console.firebase.google.com/project/calycompta/settings/serviceaccounts/adminsdk
   - Cliquer "Generate New Private Key"
   - Télécharger le fichier JSON
   - Renommer en `firebase-admin-key.json`
   - Placer dans `/firebase-admin-key.json`

2. **⚠️ Sécurité :** Ce fichier est dans `.gitignore` - NE JAMAIS commit sur GitHub !

### Pour Emulators (Développement)

Aucune configuration nécessaire ! Les scripts utilisent `--emulator` flag.

---

## 📖 Usage des Scripts

### 1. Backup Firestore

#### Production
```bash
node scripts/backup-firestore.js
```

**Sortie attendue :**
```
📦 BACKUP FIRESTORE
==================

📂 Dossier backup: firestore-backup-2025-10-22T14-30-00

🔄 Backup collections...

   evenements               ... ✅ 53 docs (a3b2c1d4...)
   event_registrations      ... ✅ 534 docs (e5f6g7h8...)
   bank_transactions        ... ✅ 127 docs (i9j0k1l2...)
   expense_claims           ... ✅ 23 docs (m3n4o5p6...)
   members                  ... ✅ 45 docs (q7r8s9t0...)
   settings                 ... ✅ 3 docs (u1v2w3x4...)
   fiscal_years             ... ✅ 2 docs (y5z6a7b8...)
   audit_logs               ... ✅ 156 docs (c9d0e1f2...)

📊 Statistiques:
   Total documents : 943
   Collections     : 8
   Taille totale   : 2.3 Mo

✅ Backup terminé avec succès !
📁 Emplacement: /Users/jan/Documents/GitHub/CalyCompta/backups/firestore-backup-2025-10-22T14-30-00
```

**Fichiers créés :**
```
backups/firestore-backup-2025-10-22T14-30-00/
├── _metadata.json           # Métadonnées (date, checksums, stats)
├── evenements.json          # 53 docs
├── event_registrations.json # 534 docs
├── bank_transactions.json   # 127 docs
├── expense_claims.json      # 23 docs
├── members.json             # 45 docs
├── settings.json            # 3 docs
├── fiscal_years.json        # 2 docs
└── audit_logs.json          # 156 docs
```

#### Emulator (Test)
```bash
# Terminal 1: Start emulators
firebase emulators:start

# Terminal 2: Backup emulator
node scripts/backup-firestore.js --emulator
```

#### Backup avec Label Personnalisé
```bash
node scripts/backup-firestore.js --label "pre-migration"
# Créé: firestore-backup-2025-10-22T14-30-00-pre-migration/
```

---

### 2. Restore Firestore

#### ⚠️ ATTENTION : ÉCRASE LES DONNÉES EXISTANTES !

#### Production - Restore Complet
```bash

node scripts/restore-firestore.js \
  --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00 \
  --collections all
```

**Sortie attendue :**
```
🔄 RESTORE FIRESTORE
====================

📋 Métadonnées backup:
   Date         : 22/10/2025 14:30:00
   Mode         : production
   Club ID      : calypso
   Total docs   : 943

🎯 Collections à restaurer:
   - evenements
   - event_registrations
   - bank_transactions
   - expense_claims
   - members
   - settings
   - fiscal_years
   - audit_logs

⚠️  ATTENTION: Les collections existantes seront ÉCRASÉES !
   Appuyez sur Ctrl+C pour annuler dans les 3 secondes...

🔄 Restore en cours...

   evenements               ... ✅ 53 docs restaurés
   event_registrations      ... ✅ 534 docs restaurés
   bank_transactions        ... ✅ 127 docs restaurés
   expense_claims           ... ✅ 23 docs restaurés
   members                  ... ✅ 45 docs restaurés
   settings                 ... ✅ 3 docs restaurés
   fiscal_years             ... ✅ 2 docs restaurés
   audit_logs               ... ✅ 156 docs restaurés

📊 Statistiques:
   Total documents restaurés : 943
   Collections               : 8

✅ Restore terminé avec succès !
```

#### Production - Restore Partiel (Collections Spécifiques)
```bash
node scripts/restore-firestore.js \
  --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00 \
  --collections evenements,event_registrations
```

#### Dry-Run (Simulation SANS écriture)
```bash
node scripts/restore-firestore.js \
  --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00 \
  --collections all \
  --dry-run
```

**Sortie :**
```
🔍 MODE DRY-RUN: Aucune écriture Firestore

   evenements               ... 🔍 DRY-RUN: 53 docs seraient restaurés
   event_registrations      ... 🔍 DRY-RUN: 534 docs seraient restaurés
   ...

🔍 DRY-RUN terminé. Aucune modification Firestore.
```

#### Emulator
```bash
node scripts/restore-firestore.js \
  --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00 \
  --collections all \
  --emulator
```

---

### 3. Comparer Backup vs Firestore

#### Production
```bash

node scripts/compare-firestore.js \
  --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00
```

**Sortie attendue (100% identique) :**
```
🔍 COMPARAISON BACKUP vs FIRESTORE
===================================

📋 Backup:
   Date         : 22/10/2025 14:30:00
   Total docs   : 943

🔄 Comparaison en cours...

   evenements               ... ✅ 53 docs (100% identiques)
   event_registrations      ... ✅ 534 docs (100% identiques)
   bank_transactions        ... ✅ 127 docs (100% identiques)
   expense_claims           ... ✅ 23 docs (100% identiques)
   members                  ... ✅ 45 docs (100% identiques)
   settings                 ... ✅ 3 docs (100% identiques)
   fiscal_years             ... ✅ 2 docs (100% identiques)
   audit_logs               ... ✅ 156 docs (100% identiques)

📊 Résumé Global:
   Documents identiques     : 943
   Documents modifiés       : 0
   Documents ajoutés        : 0
   Documents supprimés      : 0

✅ Backup et Firestore sont IDENTIQUES !
```

**Sortie attendue (différences détectées) :**
```
🔄 Comparaison en cours...

   evenements               ... ⚠️  Backup: 53, Firestore: 55
      ➜ 2 ajoutés dans Firestore
   event_registrations      ... ✅ 534 docs (100% identiques)
   bank_transactions        ... ⚠️  Backup: 127, Firestore: 125
      ➜ 2 supprimés de Firestore

📊 Résumé Global:
   Documents identiques     : 1078
   Documents modifiés       : 0
   Documents ajoutés        : 2
   Documents supprimés      : 2

⚠️  Différences détectées entre backup et Firestore

🔍 Détails des différences:

   evenements - Ajoutés:
      - zUmG4hKL9pQ2RsT8
      - bYx3CdE5fN7oP9q

   bank_transactions - Supprimés:
      - aB1cD2eF3gH4iJ5
      - kL6mN7oP8qR9sT0
```

#### Emulator
```bash
node scripts/compare-firestore.js \
  --backup-dir ../backups/firestore-backup-test \
  --emulator
```

---

## 🎯 Cas d'Usage Typiques

### Workflow Migration avec Rollback

```bash
# 1. Backup AVANT migration
node scripts/backup-firestore.js --label "pre-migration"

# 2. Migration (exemple : migrer evenements → operations)
node scripts/migrate-to-operations.js

# 3. Vérifier migration OK
node scripts/compare-firestore.js \
  --backup-dir ../backups/firestore-backup-[...]-pre-migration

# 4. Si problème : ROLLBACK
node scripts/restore-firestore.js \
  --backup-dir ../backups/firestore-backup-[...]-pre-migration \
  --collections all

# 5. Vérifier rollback
node scripts/compare-firestore.js \
  --backup-dir ../backups/firestore-backup-[...]-pre-migration
# Attendu: 100% identique
```

### Backup Quotidien Automatique (Cron)

```bash
# Ajouter à crontab (Linux/Mac)
0 3 * * * cd /path/to/CalyCompta/calycompta-app && node scripts/backup-firestore.js --label "daily"

# Nettoyer backups >30 jours
0 4 * * * find /path/to/CalyCompta/backups -name "firestore-backup-*" -mtime +30 -exec rm -rf {} \;
```

### Test Emulator avant Production

```bash
# 1. Start emulators
firebase emulators:start

# 2. Créer données test via UI

# 3. Backup emulator
node scripts/backup-firestore.js --emulator --label "test"

# 4. Modifier données

# 5. Restore
node scripts/restore-firestore.js \
  --backup-dir ../backups/firestore-backup-[...]-test \
  --emulator

# 6. Vérifier restauration OK ✅
```

---

## 🔍 Structure Fichiers Backup

### _metadata.json

```json
{
  "timestamp": "2025-10-22T14:30:00.000Z",
  "mode": "production",
  "clubId": "calypso",
  "collections": {
    "evenements": {
      "documentCount": 53,
      "filePath": "evenements.json",
      "checksum": "a3b2c1d4e5f6g7h8",
      "size": 245678
    },
    "event_registrations": {
      "documentCount": 534,
      "filePath": "event_registrations.json",
      "checksum": "i9j0k1l2m3n4o5p6",
      "size": 876543
    }
  },
  "totalDocuments": 943
}
```

### evenements.json (Exemple)

```json
[
  {
    "id": "zUmG4hKL9pQ2RsT8",
    "data": {
      "titre": "Plongée Zélande",
      "date_debut": {
        "_type": "timestamp",
        "_seconds": 1698159600,
        "_nanoseconds": 0
      },
      "statut": "ferme",
      "prix_membre": 45,
      "created_at": {
        "_type": "timestamp",
        "_seconds": 1696032000,
        "_nanoseconds": 0
      }
    }
  }
]
```

**Note :** Les `Timestamp` Firestore sont sérialisés en objets JSON avec `_type`, `_seconds`, `_nanoseconds` pour permettre restauration exacte.

---

## ⚠️ Limitations & Warnings

### Limitations

1. **Batch Size :** Max 500 documents par batch (limite Firestore)
   - Collections >500 docs automatiquement paginées
   - Progression affichée en temps réel

2. **Types Complexes :** GeoPoint, Reference non testés
   - Timestamps et Dates : ✅ Supportés
   - Arrays et Maps : ✅ Supportés
   - Nested objects : ✅ Supportés

3. **Permissions :** Nécessite Service Account Key (admin rights)

### Warnings

1. **NE JAMAIS commit `firebase-admin-key.json`** sur GitHub !
   - Déjà dans `.gitignore`
   - Contient accès complet Firebase

2. **Restore ÉCRASE données** sans confirmation (sauf --dry-run)
   - Toujours tester avec `--dry-run` d'abord
   - Toujours backup AVANT restore

3. **Timestamps :** Précision à la nanoseconde préservée
   - Date restoration exacte à 100%

---

## 🐛 Troubleshooting

### Erreur: `firebase-admin-key.json introuvable`

**Solution :**
1. Télécharger depuis Firebase Console (voir Configuration Initiale)
2. Ou utiliser `--emulator` flag pour développement

### Erreur: `FIRESTORE_EMULATOR_HOST not set`

**Solution :**
```bash
# Start emulators d'abord
firebase emulators:start
```

### Erreur: `Permission denied`

**Solution :**
1. Vérifier Service Account Key valide
2. Vérifier permissions IAM dans Firebase Console
3. Pour emulators, pas de permissions nécessaires

### Backup très lent (>5 minutes)

**Normal si :**
- Collections >1000 documents
- Connexion Internet lente (production)
- Emulator sur machine lente

**Optimisation :**
- Filtrer collections spécifiques (pas `all`)
- Augmenter BATCH_SIZE dans code (risqué)

### Restore échoue à 50%

**Causes possibles :**
1. Firestore rules trop strictes → Temporairement désactiver
2. Timeout réseau → Réessayer
3. Documents corrompus → Vérifier backup JSON

**Solution :**
```bash
# Restore partiel déjà fait, continuer avec collections restantes
node scripts/restore-firestore.js \
  --backup-dir ../backups/... \
  --collections settings,fiscal_years,audit_logs
```

---

## 📚 Ressources

- **Firebase Admin SDK :** https://firebase.google.com/docs/admin/setup
- **Firestore Batch Writes :** https://firebase.google.com/docs/firestore/manage-data/transactions
- **ROLLBACK.md :** Procédures complètes de rollback

---

**Auteur :** Claude Code + Jan Andriessens
**Date :** 2025-10-22
**Version :** 1.0.0
