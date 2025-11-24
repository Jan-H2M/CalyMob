# Guide de test - Système de paiement Noda

## 🎯 Objectif

Tester le flux complet d'inscription et de paiement pour un événement dans CalyMob.

## 📋 Prérequis

### 1. Environnement Firebase

```bash
# Installer Firebase CLI
npm install -g firebase-tools

# Se connecter
firebase login

# Vérifier le projet
firebase projects:list
```

### 2. Configuration Noda (Sandbox)

Avant de tester en production, vous devez :

1. **Créer un compte Noda Sandbox** : https://sandbox.noda.live
2. **Récupérer les credentials API** :
   - API Key
   - API Secret
   - Webhook Secret

3. **Configurer les variables d'environnement** :
   ```bash
   firebase functions:config:set noda.api_key="YOUR_KEY"
   firebase functions:config:set noda.api_secret="YOUR_SECRET"
   firebase functions:config:set noda.base_url="https://sandbox.noda.live"
   firebase functions:config:set noda.webhook_secret="YOUR_WEBHOOK_SECRET"
   ```

### 3. Déployer les Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Vous devriez voir :
```
✔ functions[createNodaPayment]: Successful create operation
✔ functions[nodaWebhook]: Successful create operation
✔ functions[checkNodaPaymentStatus]: Successful create operation
```

## 🧪 Tests unitaires (optionnel)

### Test des fonctions en local

1. **Créer un fichier de test** `functions/test/payment.test.js` :

```javascript
const test = require('firebase-functions-test')();
const admin = require('firebase-admin');

describe('Payment Functions', () => {
  let createNodaPayment;

  before(() => {
    createNodaPayment = require('../src/payment/createPayment').createNodaPayment;
  });

  after(() => {
    test.cleanup();
  });

  it('should reject unauthenticated calls', async () => {
    const data = {
      clubId: 'test',
      operationId: 'test',
      participantId: 'test',
      amount: 10,
      description: 'test'
    };

    try {
      await createNodaPayment(data, {});
      assert.fail('Should have thrown');
    } catch (error) {
      assert.equal(error.code, 'unauthenticated');
    }
  });
});
```

2. **Lancer les tests** :

```bash
cd functions
npm test
```

## 🔄 Test du flux complet

### Scénario 1 : Inscription et paiement réussi

#### Étape 1 : Créer un événement test dans CalyCompta

Dans CalyCompta (interface web) :

1. Créer un événement :
   - Type : Événement
   - Titre : "Test Plongée Kasterlee"
   - Date : Date future
   - Statut : "Ouvert"

2. Configurer les tarifs flexibles :
   ```json
   event_tariffs: [
     {
       "id": "t1",
       "label": "Membre",
       "category": "membre",
       "price": 25.0,
       "is_default": true,
       "display_order": 1
     },
     {
       "id": "t2",
       "label": "Encadrant",
       "category": "encadrant",
       "price": 15.0,
       "is_default": false,
       "display_order": 2
     }
   ]
   ```

3. Récupérer l'ID de l'événement (ex: `op_test_123`)

#### Étape 2 : S'inscrire depuis CalyMob

Dans l'app Flutter :

1. **Connexion** :
   - Se connecter avec un compte membre
   - Vérifier que `clubStatuten` contient `["Membre"]`

2. **Naviguer vers l'événement** :
   - Tab "Événements"
   - Sélectionner "Test Plongée Kasterlee"

3. **Vérifier le prix** :
   - Le prix affiché doit être **25€** (tarif membre)
   - Le badge doit afficher la fonction "Membre"

4. **S'inscrire** :
   - Cliquer sur "S'inscrire"
   - Confirmer l'inscription
   - L'inscription est créée dans Firestore avec `paye = false`

#### Étape 3 : Payer depuis CalyMob

1. **Voir "Mes Événements"** :
   - Tab "Mes événements"
   - L'événement apparaît avec badge "À payer"

2. **Initier le paiement** :
   - Cliquer sur le bouton "Payer (25€)"
   - Confirmer le paiement
   - Une dialog de chargement apparaît

3. **Vérifier dans Firestore** :
   ```
   clubs/{clubId}/operation_participants/{participantId}
   {
     payment_id: "noda_payment_xyz",
     payment_status: "pending",
     payment_initiated_at: Timestamp,
     paye: false
   }
   ```

4. **Page de paiement Noda** :
   - L'app ouvre le navigateur avec l'URL Noda
   - La page affiche le montant 25€
   - En mode sandbox, utiliser les credentials de test Noda

5. **Compléter le paiement** :
   - Sélectionner une banque test
   - Confirmer le paiement
   - Noda redirige vers success_url

#### Étape 4 : Vérifier la confirmation

1. **Webhook reçu** :
   ```bash
   # Vérifier les logs
   firebase functions:log --only nodaWebhook
   ```

   Vous devriez voir :
   ```
   📥 Webhook Noda reçu: { payment_id: "...", status: "completed" }
   ✅ Paiement confirmé pour: part_xyz
   ```

2. **Firestore mis à jour** :
   ```
   clubs/{clubId}/operation_participants/{participantId}
   {
     payment_id: "noda_payment_xyz",
     payment_status: "completed",
     paye: true,
     date_paiement: Timestamp
   }
   ```

3. **App CalyMob** :
   - Le badge passe de "À payer" à "Payé" (vert)
   - Le bouton "Payer" disparaît
   - Félicitations s'affichent

4. **Log de paiement** :
   ```
   payment_logs/{logId}
   {
     payment_id: "noda_payment_xyz",
     status: "completed",
     amount: 25.0,
     timestamp: Timestamp
   }
   ```

### Scénario 2 : Paiement annulé

1. Suivre les étapes 1-3 du Scénario 1
2. Sur la page Noda, cliquer sur "Annuler"
3. Le webhook reçoit `status: "cancelled"`
4. Firestore est mis à jour avec `payment_status: "cancelled"`, `paye: false`
5. Dans l'app, le badge affiche "Échec" (rouge)
6. Le bouton "Réessayer le paiement" apparaît

### Scénario 3 : Polling manuel du statut

Si le webhook n'est pas reçu (ex: réseau instable), l'app doit pouvoir vérifier le statut manuellement.

1. Dans `operation_detail_screen.dart`, le polling appelle `checkNodaPaymentStatus` toutes les 3 secondes
2. Vérifier les logs :
   ```bash
   firebase functions:log --only checkNodaPaymentStatus
   ```

3. Vous devriez voir :
   ```
   🔍 Vérification statut Noda: noda_payment_xyz
   📊 Statut Noda reçu: completed
   ```

## 🔍 Vérifications Firestore

### Après inscription (avant paiement)

```
clubs/{clubId}/operation_participants/{participantId}
{
  operation_id: "op_test_123",
  membre_id: "user_xyz",
  membre_nom: "Doe",
  membre_prenom: "John",
  prix: 25.0,
  paye: false,
  date_inscription: Timestamp,
  payment_id: null,
  payment_status: null,
  payment_initiated_at: null
}
```

### Après création du paiement (en attente)

```
{
  ...
  payment_id: "noda_payment_abc123",
  payment_status: "pending",
  payment_initiated_at: Timestamp,
  paye: false
}
```

### Après confirmation du paiement

```
{
  ...
  payment_id: "noda_payment_abc123",
  payment_status: "completed",
  payment_initiated_at: Timestamp,
  paye: true,
  date_paiement: Timestamp
}
```

## 🐛 Scénarios d'erreur à tester

### Erreur 1 : Montant invalide

```dart
// Dans l'app, modifier temporairement le montant
final amount = 15000.0; // > 10000€

// Résultat attendu :
// HttpsError: invalid-argument
// "Le montant doit être entre 0 et 10000 euros"
```

### Erreur 2 : Double paiement

1. S'inscrire et payer avec succès
2. Réessayer de payer la même inscription
3. Résultat attendu :
   ```
   HttpsError: already-exists
   "Paiement déjà effectué"
   ```

### Erreur 3 : Inscription non trouvée

```dart
// Appeler avec un participantId invalide
final result = await functions.httpsCallable('createNodaPayment').call({
  'participantId': 'invalid_id',
  // ...
});

// Résultat attendu :
// HttpsError: not-found
// "Inscription non trouvée"
```

### Erreur 4 : Permission refusée

1. Utilisateur A s'inscrit à un événement
2. Utilisateur B tente de payer l'inscription de A
3. Résultat attendu :
   ```
   HttpsError: permission-denied
   "Vous ne pouvez pas payer pour une autre personne"
   ```

## 📊 Monitoring production

Une fois en production, surveiller :

### 1. Dashboard Firebase

- **Functions** :
  - Invocations par jour
  - Erreurs
  - Durée d'exécution moyenne

- **Firestore** :
  - Nombre d'inscriptions
  - Nombre de paiements réussis/échoués
  - Collection `payment_logs`

### 2. Dashboard Noda

- Paiements en attente
- Taux de succès
- Montant total traité

### 3. Requête Firestore pour statistiques

```javascript
// Compter les paiements réussis
db.collectionGroup('operation_participants')
  .where('paye', '==', true)
  .count()

// Compter les paiements en attente
db.collectionGroup('operation_participants')
  .where('payment_status', '==', 'pending')
  .count()

// Somme des montants payés
db.collectionGroup('operation_participants')
  .where('paye', '==', true)
  .get()
  .then(snapshot => {
    const total = snapshot.docs.reduce((sum, doc) => sum + doc.data().prix, 0);
    console.log('Total payé:', total, '€');
  })
```

## ✅ Checklist avant mise en production

- [ ] Compte Noda production créé
- [ ] Variables d'environnement configurées (production)
- [ ] Cloud Functions déployées
- [ ] Webhook URL configurée dans Noda
- [ ] Test du flux complet en sandbox
- [ ] Test des scénarios d'erreur
- [ ] Monitoring configuré (Firebase + Noda)
- [ ] Documentation utilisateur créée
- [ ] Plan de rollback préparé

## 🚀 Déploiement progressif

Pour minimiser les risques :

1. **Phase 1 - Beta (1 semaine)** :
   - Activer pour 10 utilisateurs test
   - Surveiller les logs quotidiennement
   - Corriger les bugs si nécessaire

2. **Phase 2 - Soft launch (2 semaines)** :
   - Activer pour 50% des utilisateurs
   - Annoncer la fonctionnalité
   - Recueillir les feedbacks

3. **Phase 3 - Production complète** :
   - Activer pour 100% des utilisateurs
   - Supprimer l'ancien système de paiement
   - Célébrer ! 🎉

## 📞 Support et dépannage

Si un utilisateur rencontre un problème :

1. **Vérifier Firestore** :
   - Statut de l'inscription
   - ID du paiement
   - Logs d'erreur

2. **Vérifier Noda** :
   - Rechercher le payment_id
   - Voir le statut réel
   - Vérifier les webhooks reçus

3. **Action manuelle si nécessaire** :
   ```javascript
   // Marquer manuellement comme payé
   db.collection('clubs/{clubId}/operation_participants')
     .doc(participantId)
     .update({
       paye: true,
       payment_status: 'completed',
       date_paiement: admin.firestore.FieldValue.serverTimestamp()
     })
   ```

## 🎓 Ressources supplémentaires

- [Documentation Noda Sandbox](https://docs.noda.live/sandbox)
- [Firebase Functions Logs](https://console.firebase.google.com/project/_/functions/logs)
- [Firestore Console](https://console.firebase.google.com/project/_/firestore)
