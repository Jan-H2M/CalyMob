# Configuration des Cloud Functions - Paiements Noda

## 📋 Prérequis

- Compte Firebase avec plan Blaze (facturation activée)
- Compte Noda (Open Banking) avec API credentials
- Node.js 18 ou supérieur
- Firebase CLI installé (`npm install -g firebase-tools`)

## 🔑 Configuration des variables d'environnement

### 1. Configuration Noda

Vous devez configurer les credentials Noda dans Firebase Functions :

```bash
# Se connecter à Firebase
firebase login

# Configurer les variables d'environnement
firebase functions:config:set noda.api_key="YOUR_NODA_API_KEY"
firebase functions:config:set noda.api_secret="YOUR_NODA_API_SECRET"
firebase functions:config:set noda.base_url="https://api.noda.live"
firebase functions:config:set noda.webhook_secret="YOUR_NODA_WEBHOOK_SECRET"

# Vérifier la configuration
firebase functions:config:get
```

### 2. Variables d'environnement pour développement local

Créer `.env` dans le dossier `functions/` :

```env
NODA_API_KEY=your_noda_api_key
NODA_API_SECRET=your_noda_api_secret
NODA_BASE_URL=https://sandbox.noda.live
NODA_WEBHOOK_SECRET=your_webhook_secret
```

⚠️ **Ne jamais commiter le fichier `.env` !** Il est déjà dans `.gitignore`.

## 🚀 Installation et déploiement

### Installation des dépendances

```bash
cd functions
npm install
```

### Déploiement en production

```bash
# Déployer toutes les fonctions
firebase deploy --only functions

# Ou déployer une fonction spécifique
firebase deploy --only functions:createNodaPayment
firebase deploy --only functions:nodaWebhook
firebase deploy --only functions:checkNodaPaymentStatus
```

### Test en local avec émulateur Firebase

```bash
# Installer l'émulateur
npm install -g firebase-tools

# Lancer l'émulateur
cd /Users/jan/Documents/GitHub/CalyMob
firebase emulators:start --only functions,firestore

# Les fonctions seront accessibles sur :
# http://localhost:5001/YOUR_PROJECT_ID/us-central1/createNodaPayment
# http://localhost:5001/YOUR_PROJECT_ID/us-central1/nodaWebhook
# http://localhost:5001/YOUR_PROJECT_ID/us-central1/checkNodaPaymentStatus
```

## 📡 Configuration du webhook Noda

Une fois les fonctions déployées, vous devez configurer l'URL du webhook dans votre compte Noda :

1. Récupérer l'URL de production :
   ```
   https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/nodaWebhook
   ```

2. Dans le dashboard Noda :
   - Aller dans **Settings** > **Webhooks**
   - Ajouter l'URL ci-dessus
   - Sélectionner les événements : `payment.completed`, `payment.failed`, `payment.cancelled`
   - Enregistrer le secret webhook et l'ajouter à la configuration Firebase

## 🔧 Structure des fonctions

### 1. createNodaPayment (Callable)

**Usage depuis Flutter :**
```dart
final result = await FirebaseFunctions.instance
  .httpsCallable('createNodaPayment')
  .call({
    'clubId': 'club123',
    'operationId': 'op456',
    'participantId': 'part789',
    'amount': 25.0,
    'description': 'Inscription plongée Kasterlee',
  });

final paymentUrl = result.data['paymentUrl'];
```

**Retour :**
```json
{
  "paymentId": "noda_payment_xyz",
  "paymentUrl": "https://checkout.noda.live/xyz",
  "status": "pending",
  "expiresAt": "2025-11-24T10:00:00Z"
}
```

### 2. nodaWebhook (HTTP)

**Endpoint :** `POST /nodaWebhook`

**Reçu automatiquement par Noda lors des changements de statut.**

Événements traités :
- `completed` → Met à jour `paye = true`
- `failed` / `cancelled` / `expired` → Met à jour `paye = false`

### 3. checkNodaPaymentStatus (Callable)

**Usage depuis Flutter :**
```dart
final result = await FirebaseFunctions.instance
  .httpsCallable('checkNodaPaymentStatus')
  .call({
    'clubId': 'club123',
    'participantId': 'part789',
  });

final status = result.data['status'];
final isPaid = result.data['paye'];
```

**Retour :**
```json
{
  "paymentId": "noda_payment_xyz",
  "status": "completed",
  "paye": true,
  "updatedAt": "2025-11-23T15:30:00Z"
}
```

## 🔒 Sécurité

### Validation de signature webhook

Le webhook vérifie la signature HMAC-SHA256 pour s'assurer que les requêtes viennent bien de Noda.

### Permissions Firestore

Les fonctions utilisent Firebase Admin SDK avec droits complets. Assurez-vous que :

1. Les Security Rules Firestore protègent les données côté client
2. Les fonctions vérifient toujours `context.auth.uid`
3. Les utilisateurs ne peuvent payer que leurs propres inscriptions

### Variables sensibles

- ✅ Stockées dans Firebase Functions Config
- ✅ Non commitées dans Git
- ✅ Différentes entre sandbox et production

## 📊 Monitoring

### Logs Firebase

```bash
# Voir les logs en temps réel
firebase functions:log

# Filtrer par fonction
firebase functions:log --only createNodaPayment
```

### Dashboard Firebase

- **Functions** : Voir les invocations, erreurs, durée d'exécution
- **Firestore** : Consulter `payment_logs` pour l'audit
- **Performance** : Surveiller les temps de réponse

## 🧪 Tests

### Test de createNodaPayment

Depuis Flutter :
```dart
try {
  final result = await FirebaseFunctions.instance
    .httpsCallable('createNodaPayment')
    .call({
      'clubId': 'test_club',
      'operationId': 'test_op',
      'participantId': 'test_part',
      'amount': 1.0,
      'description': 'Test payment',
    });
  print('Payment URL: ${result.data['paymentUrl']}');
} catch (e) {
  print('Error: $e');
}
```

### Test du webhook

Avec curl :
```bash
curl -X POST https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/nodaWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "test_payment",
    "status": "completed",
    "amount": 25.0,
    "currency": "EUR",
    "metadata": {
      "clubId": "club123",
      "operationId": "op456",
      "participantId": "part789",
      "userId": "user123"
    }
  }'
```

### Test de checkNodaPaymentStatus

Depuis Flutter :
```dart
final result = await FirebaseFunctions.instance
  .httpsCallable('checkNodaPaymentStatus')
  .call({
    'clubId': 'club123',
    'participantId': 'part789',
  });
print('Status: ${result.data['status']}');
```

## 🐛 Dépannage

### Erreur "CORS"
Les fonctions callable gèrent automatiquement CORS. Si problème, vérifier Firebase Auth.

### Erreur "unauthenticated"
L'utilisateur doit être connecté avec Firebase Auth avant d'appeler les fonctions.

### Erreur "invalid-argument"
Vérifier que tous les paramètres requis sont fournis.

### Webhook non reçu
1. Vérifier l'URL dans le dashboard Noda
2. Vérifier les logs Firebase : `firebase functions:log`
3. Tester manuellement avec curl

### Paiement bloqué en "pending"
1. Vérifier les logs Noda
2. Appeler `checkNodaPaymentStatus` manuellement
3. Vérifier que le webhook est bien configuré

## 📚 Ressources

- [Documentation Firebase Functions](https://firebase.google.com/docs/functions)
- [Documentation Noda API](https://docs.noda.live)
- [Cloud Functions Pricing](https://firebase.google.com/pricing)

## 🔄 Mises à jour

Pour mettre à jour les fonctions après modification du code :

```bash
# 1. Tester en local
firebase emulators:start

# 2. Déployer en production
firebase deploy --only functions

# 3. Vérifier les logs
firebase functions:log
```
