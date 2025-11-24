# Instructions pour Claude - CalyCompta

## Contexte du Projet

Application de gestion financière pour le club de plongée Calypso. Stack: React + TypeScript + Firebase + Vercel.

## Historique Important

### Correction des Transactions - 16 Nov 2025

**⚠️ IMPORTANT:** Une correction majeure des transactions a été effectuée. Voir [docs/FIX_TRANSACTIONS_2025-11-16.md](../docs/FIX_TRANSACTIONS_2025-11-16.md) pour les détails complets.

**Problème résolu:**
- 20 transactions enfants orphelines/invalides supprimées (-915 EUR)
- 2 transactions parentes réinitialisées (+200 EUR)
- Impact net: -715 EUR sur le solde

**Fichiers de traçabilité:**
- Backup: `scripts/backup-2025-11-16T19-43-54.json`
- Log: `scripts/fix-log-2025-11-16T19-43-54.json`
- Rollback: `scripts/rollback-2025-11-16T19-43-54.mjs`

### Scripts Disponibles

**Diagnostic:**
- `scripts/complete-reconciliation.mjs` - Analyse complète CSV vs Firestore
- `scripts/analyze-ventilated-transactions.mjs` - Vérifier les ventilations
- `scripts/compare-amounts-csv-firestore.mjs` - Comparer transaction par transaction

**Correction:**
- `scripts/fix-all-discrepancies.mjs` - Correction automatique avec backup (⚠️ DRY_RUN par défaut)

## Règles Importantes

### 1. Gestion des Transactions Ventilées

**Système parent/enfant:**
- Parent: `is_parent=true` → **EXCLU** du calcul du solde
- Enfants: `parent_transaction_id` présent → **INCLUS** dans le calcul
- La somme des enfants DOIT égaler le montant du parent

**⚠️ Piège connu:**
- Si un parent est supprimé sans supprimer ses enfants → enfants orphelins
- Les orphelins sont comptés mais ne correspondent à aucune transaction bancaire réelle
- Détection: `scripts/analyze-ventilated-transactions.mjs`

### 2. Réconciliation avec le CSV Bancaire

**Règle d'or:** La banque a TOUJOURS raison.

**Process de vérification:**
1. Comparer nombre de transactions
2. Comparer montants revenus/dépenses
3. Identifier les écarts
4. **Toujours faire un backup avant correction**

**CSV vs Firestore:**
- Le CSV ne contient QUE les transactions parentes (transactions bancaires réelles)
- Firestore contient parents + enfants (ventilations)
- Pour comparer: exclure les parents (`is_parent=true`) ET les enfants (`parent_transaction_id`)

### 3. Sécurité des Modifications

**Avant TOUTE modification en masse:**
1. ✅ Créer un backup complet
2. ✅ Tester en DRY_RUN
3. ✅ Générer un script de rollback
4. ✅ Documenter dans `docs/`

**Format des backups:**
```javascript
{
  timestamp: "2025-11-16T19:43:54",
  backup: [...],  // Données complètes
  operations: {
    deletions: [...],
    updates: [...]
  }
}
```

## Commandes Utiles

### Vérifier l'intégrité des données
```bash
# Recalcul du solde (méthode de référence - identique à l'application)
node scripts/recalculate-balance.mjs

# Analyse complète
node scripts/complete-reconciliation.mjs

# Vérifier les orphelins
node scripts/analyze-ventilated-transactions.mjs

# Comparer avec CSV
CSV_PATH="/path/to/csv" node scripts/compare-amounts-csv-firestore.mjs
```

### Corriger les incohérences
```bash
# 1. Dry-run (simulation)
node scripts/fix-all-discrepancies.mjs

# 2. Vérifier le backup créé
cat scripts/backup-*.json

# 3. Modifier le script: DRY_RUN = false

# 4. Exécuter
node scripts/fix-all-discrepancies.mjs

# 5. Si problème, rollback
node scripts/rollback-*.mjs
```

## Structure des Données Firestore

### Collection: `transactions_bancaires`

**Transaction normale:**
```javascript
{
  numero_sequence: "2025-00001",
  montant: 355,
  date_execution: Timestamp,
  contrepartie_nom: "...",
  numero_compte: "BE26210016070629",
  // Pas de is_parent, pas de parent_transaction_id
}
```

**Transaction parent (ventilée):**
```javascript
{
  numero_sequence: "2025-00040",
  montant: 125,
  is_parent: true,           // ← EXCLU du calcul
  child_count: 2,
  // ...
}
```

**Transaction enfant:**
```javascript
{
  numero_sequence: "2025-00040_child_1",
  montant: 25,
  parent_transaction_id: "abc123",  // ← ID Firestore du parent
  // ...
}
```

## Points d'Attention

### Calcul du Solde

**Formule correcte:**
```javascript
solde = opening_balance +
        Σ(transactions normales) +
        Σ(transactions enfants) +
        0  // parents exclus
```

**⚠️ Erreur fréquente:**
- Oublier d'exclure les parents (`is_parent=true`)
- Inclure les orphelins qui ne devraient plus exister

### Import CSV

**Vérifications obligatoires:**
1. Nombre de lignes importées = nombre dans CSV
2. Pas de numéros de séquence dupliqués
3. Opening balance correct
4. Logger les erreurs dans un fichier séparé

### Transactions Manquantes

Si des transactions sont dans le CSV mais pas dans Firestore:
1. Vérifier la date d'import du CSV
2. Vérifier les logs d'erreur d'import
3. Réimporter manuellement si nécessaire
4. **Ne jamais modifier manuellement dans Firestore Console**

## Maintenance Préventive

### Script de vérification quotidien (recommandé)

```bash
#!/bin/bash
# daily-check.sh

LOG_FILE="logs/daily-check-$(date +%Y-%m-%d).log"

echo "=== Vérification quotidienne ===" > $LOG_FILE
date >> $LOG_FILE

# Vérifier les orphelins
echo "\n--- Orphelins ---" >> $LOG_FILE
node scripts/analyze-ventilated-transactions.mjs >> $LOG_FILE 2>&1

# Si orphelins détectés, envoyer alerte
if grep -q "orphelins trouvés" $LOG_FILE; then
  echo "⚠️ ALERTE: Orphelins détectés!"
  # Envoyer email/notification
fi
```

### Triggers Firestore (à implémenter)

```javascript
// Empêcher la suppression d'un parent si enfants existent
exports.preventParentDeletion = functions.firestore
  .document('clubs/{clubId}/transactions_bancaires/{txId}')
  .onDelete(async (snap, context) => {
    const data = snap.data();

    if (data.is_parent) {
      const childrenQuery = await admin.firestore()
        .collection(`clubs/${context.params.clubId}/transactions_bancaires`)
        .where('parent_transaction_id', '==', snap.id)
        .get();

      if (!childrenQuery.empty) {
        throw new Error('Cannot delete parent with existing children');
      }
    }
  });
```

## En Cas de Problème

1. **NE PAS PANIQUER** - Tous les backups sont là
2. Vérifier `docs/FIX_TRANSACTIONS_*.md` pour des cas similaires
3. Utiliser les scripts de diagnostic
4. Si incertain, faire un dry-run
5. Toujours documenter les corrections dans `docs/`

## Contact & Support

Pour questions techniques ou problèmes critiques:
- Consulter cette documentation
- Vérifier les logs dans `scripts/fix-log-*.json`
- En dernier recours: rollback et demander de l'aide
