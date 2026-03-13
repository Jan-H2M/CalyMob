# État Actuel du Projet - 16 Novembre 2025

> Historical notice: état de projet conservé pour contexte uniquement. Ne pas utiliser comme description actuelle du produit.

## 📊 Solde Actuel

**Solde Firestore:** 5,749.98 €

Ce solde est calculé selon la méthode de l'application:
- Opening Balance: 16,009.57 €
- Revenus 2025: 56,733.66 € (759 transactions)
- Dépenses 2025: 66,993.25 € (192 transactions)
- **Total: 5,749.98 €**

## ⚠️ Écart avec la Banque

**Solde attendu (CSV bancaire):** 6,303.98 €
**Écart:** -554.00 €

### Cause de l'écart

**2 transactions manquantes dans Firestore:**
1. `2025-00001`: 355 € - LEMAITRE GEOFFROY (Cotisation Estelle et Geoffroy) - 01/01/2025
2. `2025-00002`: 195 € - MME GRACIA MUSIGAZI (Cotisation 2025) - 01/01/2025

**Total manquant:** 550 €
**Différence résiduelle:** ~4 € (probablement des arrondis)

### Actions à Faire

- [ ] Réimporter les 2 transactions manquantes via l'interface
- [ ] Vérifier que le solde passe à ~6,300 €
- [ ] Archiver les fichiers de backup

## ✅ Corrections Effectuées

### 16 Novembre 2025 - 19:53

**Problèmes corrigés:**
- 20 transactions enfants supprimées (orphelines + invalides)
- 2 transactions parentes converties en transactions normales
- Impact: -715 € sur le solde

**Fichiers de traçabilité:**
- `scripts/backup-2025-11-16T19-53-05.json`
- `scripts/fix-log-2025-11-16T19-53-05.json`
- `scripts/rollback-2025-11-16T19-53-05.mjs`

**Résultat:** ✅ 0 orphelins, 0 parents mal configurés

## 🛠️ Scripts de Maintenance

### Script Principal: Recalcul du Solde

```bash
node scripts/recalculate-balance.mjs
```

Ce script recalcule le solde **exactement comme l'application** en appliquant les mêmes règles:
1. ✅ Exclut les parents (`is_parent=true`)
2. ✅ Inclut les enfants (`parent_transaction_id`)
3. ✅ Filtre uniquement le compte courant (BE26 2100 1607 0629)
4. ✅ Détecte les orphelins et parents mal configurés

**Utiliser ce script pour:**
- Vérifier le solde après toute modification
- Comprendre pourquoi le solde diffère
- Détecter les problèmes avant qu'ils ne s'aggravent

### Autres Scripts Disponibles

```bash
# Réconciliation complète avec CSV
node scripts/complete-reconciliation.mjs

# Analyser les transactions ventilées
node scripts/analyze-ventilated-transactions.mjs

# Correction automatique (avec backup)
node scripts/fix-all-discrepancies.mjs
```

## 📐 Règles de Calcul du Solde

### Formule

```
Solde = Opening Balance + Σ(Revenus) - Σ(Dépenses)
```

### Transactions Incluses

✅ **Transactions normales** (sans `is_parent`, sans `parent_transaction_id`)
✅ **Transactions enfants** (avec `parent_transaction_id`)
✅ **Compte courant uniquement** (BE26 2100 1607 0629)

### Transactions Exclues

❌ **Parents** (`is_parent=true`) - Remplacés par leurs enfants
❌ **Autres comptes** (compte épargne, etc.)

### Pièges Connus

⚠️ **Orphelins:** Enfants dont le parent a été supprimé
→ Comptés dans le solde mais ne correspondent à rien dans la banque
→ Détection: `recalculate-balance.mjs` ou `analyze-ventilated-transactions.mjs`

⚠️ **Parents dans CSV:** Transactions marquées `is_parent=true` mais présentes dans le CSV bancaire
→ Exclues du solde alors qu'elles devraient être comptées
→ Solution: Convertir en transaction normale

## 🔄 Workflow de Vérification

### Vérification Quotidienne (Recommandé)

```bash
#!/bin/bash
# Ajouter à votre cron ou exécuter manuellement

echo "=== Vérification $(date) ===" >> logs/daily-check.log
node scripts/recalculate-balance.mjs >> logs/daily-check.log 2>&1

# Si orphelins détectés, envoyer une alerte
```

### Après Import CSV

```bash
# 1. Recalculer le solde
node scripts/recalculate-balance.mjs

# 2. Comparer avec le CSV
node scripts/complete-reconciliation.mjs

# 3. Si écart > 50 EUR, investiguer
node scripts/analyze-ventilated-transactions.mjs
```

### Avant Déploiement Production

```bash
# Vérifier qu'il n'y a pas d'orphelins
node scripts/recalculate-balance.mjs

# Résultat attendu: "✅ Aucun orphelin détecté"
```

## 📚 Documentation Complète

| Document | Description |
|----------|-------------|
| [ETAT_ACTUEL.md](ETAT_ACTUEL.md) | Ce fichier - État actuel et guide rapide |
| [CORRECTION_RESUME.md](CORRECTION_RESUME.md) | Résumé de la correction du 16/11/2025 |
| [docs/FIX_TRANSACTIONS_2025-11-16.md](docs/FIX_TRANSACTIONS_2025-11-16.md) | Documentation détaillée de la correction |
| [.claude/instructions.md](.claude/instructions.md) | Instructions pour Claude (futures sessions) |
| [README.md](README.md) | Documentation générale du projet |

## 🆘 En Cas de Problème

### Le solde ne correspond pas

1. Exécuter `node scripts/recalculate-balance.mjs`
2. Vérifier s'il y a des orphelins ou des parents
3. Si oui, exécuter `node scripts/fix-all-discrepancies.mjs` (dry-run d'abord)

### Après une correction qui s'est mal passée

```bash
# Utiliser le rollback le plus récent
node scripts/rollback-2025-11-16T19-53-05.mjs

# Cela restaurera TOUTES les données avant la correction
```

### Import CSV échoué

1. Vérifier les logs d'erreur
2. Comparer le nombre de transactions: CSV vs Firestore
3. Identifier les transactions manquantes avec `complete-reconciliation.mjs`
4. Réimporter manuellement si nécessaire

## 💡 Recommandations

### À Court Terme

- [ ] Réimporter les 2 transactions manquantes
- [ ] Vérifier que le solde = 6,303.98 €
- [ ] Archiver les backups (ne pas supprimer!)

### À Moyen Terme

- [ ] Implémenter un trigger Firestore pour empêcher la suppression de parents
- [ ] Ajouter une alerte si écart > 50 EUR
- [ ] Script quotidien de vérification des orphelins

### À Long Terme

- [ ] Améliorer le process d'import CSV avec validation
- [ ] Dashboard de monitoring de l'intégrité des données
- [ ] Tests automatisés pour les règles de calcul

---

**Dernière mise à jour:** 16 Novembre 2025
**Solde vérifié:** 5,749.98 € (951 transactions)
**Status:** ✅ Aucun orphelin, prêt pour réimport des 2 transactions manquantes
