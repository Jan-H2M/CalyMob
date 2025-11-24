# Automatisation des Codes Comptables - Analyse & Questions

**Date**: 13 novembre 2025
**Statut**: Analyse complète - En attente de décisions de conception

---

## 🎯 Objectif

Automatiser le remplissage des codes comptables dans les transactions bancaires en utilisant les opérations (activités) liées comme référence.

### Principe de base
- Les **codes comptables** sont saisis **uniquement dans les transactions**
- Les **opérations** servent de **référence** pour suggérer automatiquement les codes
- Une transaction liée à une opération doit hériter d'un code selon son type :
  - **Montant > 0** (revenu) → suggérer un code **classe 7** (produits)
  - **Montant < 0** (dépense) → suggérer un code **classe 6** (charges)

### Exemple concret
**Opération** : "Sortie plongée mer 2025"
- Transaction +500€ (inscription membre) → suggérer `618-00-732` (Sorties plongées V)
- Transaction -200€ (frais transport) → suggérer `618-00-632` (Sorties plongées A)

---

## 📊 État Actuel du Système

### ✅ Ce qui existe déjà

#### 1. Structure de données
```typescript
// Operation (src/types/index.ts, lignes 222-264)
export interface Operation {
  id: string;
  type: TypeOperation;  // 'evenement' | 'cotisation' | 'caution' | 'vente' | 'subvention' | 'autre'
  titre: string;
  montant_prevu: number;
  statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule';

  // ⚠️ Champs existants mais peu utilisés
  categorie?: string;           // Ex: 'activites_club'
  code_comptable?: string;      // Ex: '730-00-712'

  // Autres champs...
}

// TransactionBancaire (src/types/index.ts, lignes 110-173)
export interface TransactionBancaire {
  id: string;
  montant: number;  // > 0 = revenu, < 0 = dépense
  code_comptable?: string;  // Code à remplir automatiquement

  // Liaison avec opérations
  operation_id?: string;          // Lien direct (nouveau système)
  matched_entities?: MatchedEntity[];  // Liens multiples avancés

  // Autres champs...
}
```

#### 2. Types d'opérations (6 types)
```typescript
export type TypeOperation =
  | 'evenement'      // Plongées, sorties, formations
  | 'cotisation'     // Cotisations annuelles membres
  | 'caution'        // Cautions pour prêt de matériel
  | 'vente'          // Vente matériel
  | 'subvention'     // ADEPS, subsides fédération
  | 'autre';         // Divers
```

#### 3. Codes comptables prédéfinis (93 codes)
Fichier : `src/config/calypso-accounts.ts`

**Exemples classe 7 (revenus)** :
- `730-00-712` - Cotisations des membres plongeurs (V)
- `618-00-732` - Sorties plongées (V)
- `664-00-750` - Soirée annuelle - Recettes (V)
- `15-000-770` - Subsides communaux

**Exemples classe 6 (dépenses)** :
- `730-00-610` - Lifras - Cotisation club (A)
- `610-00-621` - Location piscine
- `612-00-622` - Entretien & réparation matériel
- `618-00-632` - Sorties plongées (A)

#### 4. Système de liaison existant
Composant : `src/components/banque/OperationLinkingPanel.tsx`
- Permet de lier des transactions à des opérations
- Suggestions intelligentes (montant ±10%, même mois)
- Filtres par type d'opération
- Recherche par titre, description, organisateur

#### 5. Système de suggestions actuel
Service : `src/services/categorizationService.ts`
- Suggestions basées sur **mots-clés + montant**
- Apprentissage automatique (patterns stockés en Firestore)
- Matching : `"inscription_199_730_00_712"`
- Fonctionnel mais ne prend pas en compte les opérations liées

#### 6. Interface de sélection de codes
Composant : `src/components/commun/AccountCodeSelectorModal.tsx`
- Modal avec suggestions intelligentes
- Onglets Revenus/Dépenses
- Recherche et filtres
- Codes groupés par préfixe

---

## ❓ Questions à Résoudre

### Question 1 : Source des codes comptables pour les opérations

**Contexte** : Tu as dit "eigenlijk moeten er enkel in de transactions boekhoud codes worden ingevoerd bij activiteiten en depenses is dat niet nodig"

Mais si les opérations n'ont pas de codes, comment le système peut-il savoir quel code suggérer ?

#### Option A : Opérations avec codes (référence uniquement)
```typescript
// Les opérations ont des codes, mais juste pour les suggérer
Operation {
  type: 'evenement',
  titre: 'Sortie plongée 2025',
  code_comptable_revenu: '618-00-732',   // Pour suggérer aux transactions revenus
  code_comptable_depense: '618-00-632'   // Pour suggérer aux transactions dépenses
}
```
**Avantages** :
- Flexibilité maximale
- Codes spécifiques par opération
- Facile à comprendre

**Inconvénients** :
- Faut remplir 2 codes pour chaque opération
- Migration nécessaire
- Plus de maintenance

#### Option B : Mapping par type d'opération
```typescript
// Configuration statique
const OPERATION_TYPE_TO_CODES = {
  evenement: {
    revenu: '618-00-732',
    depense: '618-00-632'
  },
  cotisation: {
    revenu: '730-00-712',
    depense: '730-00-610'
  },
  // etc.
}
```
**Avantages** :
- Pas de modification des opérations
- Pas de migration
- Simple à implémenter
- Cohérence garantie

**Inconvénients** :
- Moins flexible (tous les événements = même code)
- Configuration centralisée à maintenir
- Pas adapté si différents événements = différents codes

#### Option C : Apprentissage par historique
```typescript
// Le système apprend des transactions passées
// "Les transactions liées à des sorties plongées utilisent généralement 618-00-xxx"
```
**Avantages** :
- Pas de configuration manuelle
- S'adapte automatiquement

**Inconvénients** :
- Nécessite un historique
- Moins prévisible
- Plus complexe

#### Option D : Hybride (recommandé ?)
```typescript
// 1. Si l'opération a des codes → les utiliser
// 2. Sinon, utiliser le mapping par type
// 3. Sinon, utiliser l'historique
// 4. Sinon, pas de suggestion
```

**Quelle option préfères-tu ?**

---

### Question 2 : Logique de détermination des codes

Pour un type d'opération donné, comment définir les codes à suggérer ?

#### Scénario : Type "evenement"

Un événement peut être :
- Une sortie plongée → `618-00-732` / `618-00-632`
- Une soirée annuelle → `664-00-750` / `664-00-640`
- Une formation → Autres codes ?

**Sous-question 2a** : Tous les événements doivent-ils avoir le même code ?
- ☐ Oui → Un seul mapping par type suffit
- ☐ Non → Besoin d'une catégorisation plus fine

**Sous-question 2b** : Faut-il ajouter un champ "sous-type" ou "catégorie" aux opérations ?
```typescript
Operation {
  type: 'evenement',
  sous_categorie: 'sortie_plongee' | 'soiree' | 'formation',  // Nouveau champ ?
  // ...
}
```

---

### Question 3 : Comportement de la suggestion

Quand une transaction est liée à une opération, que doit faire le système ?

#### Option A : Suggestion visuelle (non invasive)
- Afficher un badge "💡 Suggestion : 618-00-732"
- L'utilisateur clique pour appliquer
- Possibilité de l'ignorer

#### Option B : Auto-fill avec notification
- Remplir automatiquement `code_comptable`
- Afficher une notification "Code appliqué depuis l'opération"
- Possibilité d'annuler

#### Option C : Auto-fill silencieux
- Remplir automatiquement
- Pas de notification
- L'utilisateur peut modifier après

#### Option D : Liste de suggestions
- Proposer 2-3 codes possibles
- L'utilisateur choisit dans une dropdown
- Basé sur type + historique

**Quelle expérience utilisateur préfères-tu ?**

---

### Question 4 : Transactions liées à plusieurs opérations

Le système permet déjà de lier une transaction à plusieurs opérations via `matched_entities[]`.

**Exemple** : Transaction -500€ liée à :
- Opération A "Sortie mer" → suggère `618-00-632`
- Opération B "Formation" → suggère `617-00-xxx`
- Opération C "Cotisation" → suggère `730-00-610`

**Que faire ?**

#### Option A : Suggérer tous les codes
- Afficher 3 suggestions
- L'utilisateur choisit

#### Option B : Prendre le premier lien
- Utiliser l'opération principale (premier matched_entity)
- Ignorer les autres

#### Option C : Prendre le plus confiant
- Utiliser le `matched_entity` avec le plus haut `confidence`

#### Option D : Demander à l'utilisateur
- Modal : "Cette transaction est liée à plusieurs opérations. Choisir la source du code ?"

**Quelle logique préfères-tu ?**

---

### Question 5 : Gestion des exceptions

#### Cas 1 : Transaction liée à une opération qui n'a pas de code
**Que faire ?**
- ☐ Pas de suggestion
- ☐ Suggestion basée sur le type uniquement
- ☐ Suggestion basée sur l'historique

#### Cas 2 : Opération de type "autre"
**Que faire ?**
- ☐ Pas de suggestion automatique
- ☐ Suggérer les codes les plus fréquents
- ☐ Utiliser uniquement l'historique

#### Cas 3 : Transaction déjà avec un code, puis liée à une opération
**Que faire ?**
- ☐ Respecter le code existant (ne rien changer)
- ☐ Proposer de remplacer par le code suggéré
- ☐ Afficher les deux codes (existant vs suggéré)

---

## 🎨 Proposition d'Architecture

### Approche recommandée (à valider)

#### Phase 1 : Configuration simple
1. Créer un fichier de configuration : `src/config/operation-code-mapping.ts`
```typescript
export const OPERATION_CODE_MAPPING: Record<TypeOperation, {
  revenu: string;
  depense: string;
  description: string;
}> = {
  evenement: {
    revenu: '618-00-732',
    depense: '618-00-632',
    description: 'Sorties plongées'
  },
  cotisation: {
    revenu: '730-00-712',
    depense: '730-00-610',
    description: 'Cotisations membres / club'
  },
  caution: {
    revenu: 'XXX-XX-XXX',  // À définir
    depense: 'XXX-XX-XXX',  // À définir
    description: 'Cautions matériel'
  },
  vente: {
    revenu: 'XXX-XX-XXX',  // À définir
    depense: 'XXX-XX-XXX',  // À définir
    description: 'Ventes matériel'
  },
  subvention: {
    revenu: '15-000-770',
    depense: '',  // Pas de dépenses pour les subsides
    description: 'Subsides communaux'
  },
  autre: {
    revenu: '',
    depense: '',
    description: 'Divers - pas de suggestion'
  }
};
```

#### Phase 2 : Service de suggestion
2. Créer `src/services/operationCodeSuggestionService.ts`
```typescript
export function suggestCodeFromOperation(
  transaction: TransactionBancaire,
  operation: Operation
): string | null {
  // 1. Déterminer si revenu ou dépense
  const isRevenue = transaction.montant > 0;

  // 2. Récupérer le mapping pour ce type d'opération
  const mapping = OPERATION_CODE_MAPPING[operation.type];
  if (!mapping) return null;

  // 3. Retourner le code approprié
  return isRevenue ? mapping.revenu : mapping.depense;
}

export function suggestCodesFromMultipleOperations(
  transaction: TransactionBancaire,
  operations: Operation[]
): Array<{ code: string; source: string; confidence: number }> {
  // Logique pour gérer plusieurs opérations
  // Retourne une liste de suggestions avec leur source
}
```

#### Phase 3 : Intégration UI
3. Modifier `OperationLinkingPanel.tsx` :
   - Quand une opération est liée → calculer la suggestion
   - Afficher un badge avec le code suggéré
   - Bouton "Appliquer" pour remplir automatiquement

4. Modifier `TransactionDetailView.tsx` :
   - Afficher les suggestions dans le sélecteur de code
   - Icône distincte pour les codes suggérés depuis opérations
   - Tooltip expliquant la source

#### Phase 4 : Évolution future (optionnel)
5. Ajouter des champs dans Operation si nécessaire :
```typescript
Operation {
  // Existant
  type: TypeOperation;

  // Nouveau (optionnel)
  sous_categorie?: string;  // Pour affiner
  code_comptable_revenu_personnalise?: string;  // Override manuel
  code_comptable_depense_personnalise?: string;  // Override manuel
}
```

---

## 🔍 Points Techniques à Considérer

### 1. Performance
- Les suggestions doivent être calculées en temps réel
- Pas d'impact sur le temps de chargement des transactions
- Cache éventuel pour les mappings

### 2. Compatibilité
- Ne pas casser le système de suggestions actuel (mots-clés + montant)
- Les deux systèmes peuvent coexister
- Priorité : opération liée > mots-clés

### 3. Migration
- Si on ajoute des champs aux opérations → script de migration
- Les opérations existantes sans codes → utiliser le mapping par défaut
- Pas de perte de données

### 4. Tests
- Tester avec différents types d'opérations
- Tester les cas multiples opérations
- Tester les montants positifs/négatifs

### 5. Documentation
- Expliquer la logique aux utilisateurs
- Guide pour configurer les mappings
- FAQ sur les cas particuliers

---

## 📁 Fichiers Concernés

### À lire/analyser
- ✅ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/types/index.ts`
- ✅ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/config/calypso-accounts.ts`
- ✅ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/services/categorizationService.ts`
- ✅ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/components/banque/OperationLinkingPanel.tsx`
- ✅ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/components/banque/TransactionDetailView.tsx`

### À créer (selon décisions)
- ☐ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/config/operation-code-mapping.ts`
- ☐ `/Users/jan/Documents/GitHub/CalyCompta/calycompta-app/src/services/operationCodeSuggestionService.ts`

### À modifier (selon décisions)
- ☐ `src/components/banque/OperationLinkingPanel.tsx` - Afficher suggestions
- ☐ `src/components/banque/TransactionDetailView.tsx` - Intégrer suggestions
- ☐ `src/components/commun/AccountCodeSelectorModal.tsx` - Afficher codes suggérés
- ☐ `src/types/index.ts` - Si ajout de champs à Operation

---

## 📝 Décisions à Prendre

### Priorité haute
- [ ] **Question 1** : Option A, B, C ou D pour la source des codes ?
- [ ] **Question 3** : Quel comportement de suggestion (A, B, C ou D) ?
- [ ] **Question 4** : Que faire avec plusieurs opérations liées ?

### Priorité moyenne
- [ ] **Question 2** : Faut-il affiner par sous-catégorie ?
- [ ] **Question 5** : Gestion des cas particuliers

### À définir
- [ ] Codes manquants dans le mapping (caution, vente)
- [ ] Interface utilisateur exacte
- [ ] Messages d'aide et tooltips

---

## 🚀 Prochaines Étapes

### Une fois les décisions prises :

1. **Créer le plan d'implémentation détaillé**
   - Liste des tâches précises
   - Ordre d'implémentation
   - Tests à effectuer

2. **Développer la fonctionnalité**
   - Créer les fichiers de configuration
   - Implémenter le service de suggestion
   - Modifier les composants UI
   - Ajouter les tests

3. **Tester en local**
   - Cas simples (1 opération, 1 transaction)
   - Cas complexes (multiples opérations)
   - Cas limites (pas de code, montant = 0)

4. **Déployer progressivement**
   - Version beta avec flag feature ?
   - Feedback utilisateurs
   - Ajustements

---

## 💡 Recommandation Personnelle

Après analyse, je recommande :

1. **Question 1** : Option D (Hybride)
   - Commencer avec Option B (mapping par type) pour la simplicité
   - Permettre l'override via champs optionnels dans Operation (Option A)
   - Ajouter l'historique plus tard (Option C)

2. **Question 3** : Option A (Suggestion visuelle)
   - Moins invasif
   - Utilisateur garde le contrôle
   - Facile à ignorer si pas pertinent

3. **Question 4** : Option C (Plus confiant)
   - Utiliser le `matched_entity` avec le plus haut `confidence`
   - Afficher les autres en suggestions alternatives

**Pourquoi ?**
- Démarrage rapide (pas de migration)
- Évolutif (peut s'enrichir)
- Non invasif (respecte l'utilisateur)
- Maintenable (configuration claire)

---

## 📞 Contact

Pour discuter de ces choix, reprendre le développement avec Claude Code :
```bash
cd /Users/jan/Documents/GitHub/CalyCompta
# Mentionner ce document : ACCOUNT_CODE_AUTOMATION_ANALYSIS.md
```

**Document créé le** : 13 novembre 2025
**Analyse complète** : ✅
**Statut** : En attente de décisions de conception
