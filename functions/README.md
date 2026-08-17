# Cloud Functions - CalyMob Payment System

> **Current payment boundary:** Only the EPC/SEPA payment-ledger commands
> exported from `functions/index.js` are operational. The Noda examples below
> are retained as historical reference; production Noda endpoints are
> fail-closed (`FAILED_PRECONDITION` / HTTP `410`) and never write accounting
> fields. Ponto is an incoming bank-feed provider, not a member payment path.
> See [`docs/PAYMENT_LEDGER_ARCHITECTURE.md`](../docs/PAYMENT_LEDGER_ARCHITECTURE.md)
> before changing any payment code.

The `createNodaPayment`, `nodaWebhook` and `checkNodaPaymentStatus` examples
below are therefore **retired API reference**, not an implementation contract.

## 📦 Fonctions disponibles

### 1. createNodaPayment (Callable)

Crée un paiement Noda pour une inscription à un événement.

**Type :** `functions.https.onCall`
**Authentification :** Requise

**Paramètres :**
```javascript
{
  clubId: string,           // ID du club
  operationId: string,      // ID de l'opération/événement
  participantId: string,    // ID de l'inscription
  amount: number,           // Montant en euros (0.01 - 10000.00)
  description: string       // Description du paiement
}
```

**Retour :**
```javascript
{
  paymentId: string,        // ID du paiement Noda
  paymentUrl: string,       // URL de redirection vers Noda
  status: "pending",        // Statut initial
  expiresAt: string | null  // Date d'expiration (ISO 8601)
}
```

**Exemple d'utilisation (Flutter) :**
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
await launchUrl(Uri.parse(paymentUrl));
```

---

### 2. nodaWebhook (HTTP)

Reçoit les notifications de Noda sur les changements de statut de paiement.

**Type :** `functions.https.onRequest`
**Méthode :** POST
**Sécurité :** Signature HMAC-SHA256

**Body attendu (JSON) :**
```javascript
{
  payment_id: string,
  status: "completed" | "failed" | "cancelled" | "expired",
  amount: number,
  currency: "EUR",
  metadata: {
    clubId: string,
    operationId: string,
    participantId: string,
    userId: string
  },
  timestamp: string,
  signature: string  // HMAC-SHA256
}
```

**Actions automatiques :**
- `status = "completed"` → Met à jour Firestore avec `paye = true`
- `status = "failed/cancelled/expired"` → Met à jour Firestore avec `paye = false`
- Création d'un log dans `payment_logs`

**Configuration dans Noda :**
```
URL: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/nodaWebhook
Événements: payment.completed, payment.failed, payment.cancelled, payment.expired
```

---

### 3. checkNodaPaymentStatus (Callable)

Vérifie manuellement le statut d'un paiement auprès de Noda.

**Type :** `functions.https.onCall`
**Authentification :** Requise

**Paramètres :**
```javascript
{
  clubId: string,           // ID du club
  participantId: string     // ID de l'inscription
}
```

**Retour :**
```javascript
{
  paymentId: string,        // ID du paiement Noda
  status: string,           // Statut actuel (pending, completed, failed, etc.)
  paye: boolean,            // true si paiement confirmé
  updatedAt: string         // Timestamp de dernière mise à jour (ISO 8601)
}
```

**Exemple d'utilisation (Flutter) :**
```dart
final result = await FirebaseFunctions.instance
  .httpsCallable('checkNodaPaymentStatus')
  .call({
    'clubId': 'club123',
    'participantId': 'part789',
  });

final isPaid = result.data['paye'];
```

**Optimisation :**
- Si `paye = true` dans Firestore, retourne directement sans appeler Noda
- Sinon, interroge l'API Noda et met à jour Firestore si nécessaire

---

## 🔧 Installation

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configuration locale (développement)

Créer un fichier `.env` à partir de `.env.example` :

```bash
cp .env.example .env
```

Éditer `.env` avec vos credentials Noda :

```env
NODA_API_KEY=your_noda_api_key
NODA_API_SECRET=your_noda_api_secret
NODA_BASE_URL=https://sandbox.noda.live
NODA_WEBHOOK_SECRET=your_webhook_secret
```

### 3. Configuration Firebase (production)

```bash
firebase functions:config:set \
  noda.api_key="YOUR_KEY" \
  noda.api_secret="YOUR_SECRET" \
  noda.base_url="https://api.noda.live" \
  noda.webhook_secret="YOUR_WEBHOOK_SECRET"
```

---

## 🚀 Déploiement

### Déployer toutes les fonctions

```bash
firebase deploy --only functions
```

### Déployer une fonction spécifique

```bash
firebase deploy --only functions:createNodaPayment
firebase deploy --only functions:nodaWebhook
firebase deploy --only functions:checkNodaPaymentStatus
```

---

## 🧪 Tests locaux

### Avec l'émulateur Firebase

```bash
# Depuis la racine du projet
firebase emulators:start --only functions,firestore

# Les fonctions sont accessibles sur :
# http://localhost:5001/YOUR_PROJECT/us-central1/createNodaPayment
# http://localhost:5001/YOUR_PROJECT/us-central1/nodaWebhook
# http://localhost:5001/YOUR_PROJECT/us-central1/checkNodaPaymentStatus
```

### Tester le webhook manuellement

```bash
curl -X POST http://localhost:5001/YOUR_PROJECT/us-central1/nodaWebhook \
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

---

## 📊 Monitoring

### Voir les logs

```bash
# Tous les logs
firebase functions:log

# Logs d'une fonction spécifique
firebase functions:log --only createNodaPayment
firebase functions:log --only nodaWebhook
firebase functions:log --only checkNodaPaymentStatus

# Logs en temps réel
firebase functions:log --follow
```

### Dashboard Firebase

```
https://console.firebase.google.com/project/YOUR_PROJECT/functions
```

**Métriques à surveiller :**
- Invocations par jour
- Erreurs (cible : < 1%)
- Durée d'exécution (cible : < 2s)

---

## 🔒 Sécurité

### Variables d'environnement

- ✅ **Jamais committées** dans Git
- ✅ Stockées dans Firebase Functions Config
- ✅ Différentes entre sandbox et production

### Authentification

- ✅ Toutes les fonctions callable vérifient `context.auth`
- ✅ Vérification des permissions (utilisateur = propriétaire)
- ✅ Validation des paramètres

### Webhook

- ✅ Signature HMAC-SHA256 vérifiée
- ✅ Protection contre les replay attacks (timestamp)
- ✅ Logs complets pour audit

---

## 🐛 Dépannage

### Erreur "CORS"

Les fonctions callable gèrent automatiquement CORS. Vérifier que l'utilisateur est bien authentifié avec Firebase Auth.

### Erreur "unauthenticated"

L'utilisateur doit être connecté avant d'appeler les fonctions :

```dart
final user = FirebaseAuth.instance.currentUser;
if (user == null) {
  // Rediriger vers login
}
```

### Erreur "Noda API request failed"

Vérifier :
1. Credentials Noda corrects
2. Base URL correcte (sandbox vs production)
3. Logs Firebase : `firebase functions:log`

### Webhook non reçu

Vérifier :
1. URL correcte dans le dashboard Noda
2. Événements sélectionnés (payment.completed, etc.)
3. Logs Firebase pour voir si la requête arrive
4. Signature webhook correcte

---

## 📚 Structure du code

```
functions/
├── index.js                    # Point d'entrée, exports
├── package.json                # Dépendances npm
├── .env.example                # Template de configuration
├── .gitignore                  # Exclut .env
├── README.md                   # Ce fichier
├── CONFIGURATION.md            # Guide détaillé
└── src/
    ├── utils/
    │   └── noda-client.js      # Client API Noda (Axios)
    └── payment/
        ├── createPayment.js    # Fonction createNodaPayment
        ├── webhook.js          # Fonction nodaWebhook
        └── checkStatus.js      # Fonction checkNodaPaymentStatus
```

---

## 📖 Ressources

- [Documentation Noda API](https://docs.noda.live)
- [Firebase Functions Guide](https://firebase.google.com/docs/functions)
- [Configuration détaillée](./CONFIGURATION.md)
- [Guide de test complet](../TESTING_GUIDE.md)
- [Résumé de l'implémentation](../PAYMENT_IMPLEMENTATION_SUMMARY.md)

---

## 🆘 Support

**Problèmes techniques :**
1. Consulter les logs : `firebase functions:log`
2. Vérifier Firestore Console
3. Vérifier Dashboard Noda

**Contact :**
- Firebase Support : https://firebase.google.com/support
- Noda Support : support@noda.live
