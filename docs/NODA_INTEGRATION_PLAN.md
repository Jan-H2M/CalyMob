# Plan d'Intégration Noda Payment - CalyMob

**Document créé le:** 21 novembre 2025
**Version:** 1.0
**Auteur:** Équipe CalyMob
**Statut:** Planning

---

## Table des Matières

1. [Résumé Exécutif](#résumé-exécutif)
2. [Contexte et Objectifs](#contexte-et-objectifs)
3. [Présentation de Noda](#présentation-de-noda)
4. [Architecture Technique](#architecture-technique)
5. [Analyse du Code Existant](#analyse-du-code-existant)
6. [Plan d'Implémentation Détaillé](#plan-dimplémentation-détaillé)
7. [Spécifications Techniques](#spécifications-techniques)
8. [Sécurité et Conformité](#sécurité-et-conformité)
9. [Tests et Validation](#tests-et-validation)
10. [Déploiement](#déploiement)
11. [Coûts et ROI](#coûts-et-roi)
12. [Risques et Mitigation](#risques-et-mitigation)
13. [Chronologie et Jalons](#chronologie-et-jalons)
14. [Ressources et Documentation](#ressources-et-documentation)

---

## 1. Résumé Exécutif

### Objectif du Projet
Intégrer le système de paiement **Noda** (Open Banking) dans l'application CalyMob pour permettre aux membres du club de plongée Calypso DC de payer leurs frais d'inscription aux événements directement via l'application mobile.

### Bénéfices Clés
- 💰 **Réduction des coûts** : Frais de transaction ~0.5% vs 2-3% pour les cartes (économie de 80%)
- 🔒 **Sécurité renforcée** : Authentification bancaire PSD2, pas de données de carte à stocker
- 🌍 **Couverture européenne** : 2,000+ banques dans 28 pays
- ⚡ **Paiements instantanés** : Virements bancaires directs en temps réel
- 📱 **Expérience utilisateur** : Intégration native dans l'application mobile

### Durée Estimée
**2-3 semaines** (10-15 jours ouvrables)

### Investissement
- Développement : 10-15 jours
- Infrastructure : < 5€/mois (Firebase Cloud Functions)
- Transaction : ~0.5% par paiement

---

## 2. Contexte et Objectifs

### 2.1 Situation Actuelle

**Problème Identifié:**
- Les utilisateurs peuvent s'inscrire aux événements via l'application
- Le champ `paye` existe dans le modèle de données mais n'est jamais utilisé
- Les paiements doivent être effectués manuellement (virement, espèces)
- Aucun suivi automatique des paiements dans l'application
- Charge administrative élevée pour les organisateurs

**Flux Actuel:**
```
1. Utilisateur consulte événement
2. Utilisateur clique "S'inscrire"
3. Inscription enregistrée avec paye = false
4. ❌ Aucun moyen de payer dans l'app
5. ❌ Paiement manuel hors application
6. ❌ Mise à jour manuelle du statut de paiement
```

### 2.2 Objectifs du Projet

**Objectifs Fonctionnels:**
1. Permettre le paiement en ligne sécurisé des frais d'événements
2. Mise à jour automatique du statut de paiement dans Firestore
3. Affichage en temps réel du statut de paiement dans l'application
4. Gestion des erreurs et des échecs de paiement
5. Historique des paiements pour les utilisateurs et administrateurs

**Objectifs Non-Fonctionnels:**
1. Sécurité : Conformité PSD2 et protection des données
2. Performance : Temps de paiement < 10 secondes
3. Fiabilité : Taux de succès > 95%
4. Maintenabilité : Code documenté et testable
5. Scalabilité : Support jusqu'à 1000 paiements/mois

### 2.3 Périmètre

**Inclus dans le Projet:**
- ✅ Paiement des frais d'inscription aux événements
- ✅ Intégration API Noda via Cloud Functions
- ✅ Interface utilisateur de paiement dans l'application
- ✅ Mise à jour automatique du statut de paiement
- ✅ Gestion des erreurs et retry
- ✅ Documentation technique et utilisateur

**Exclus du Projet (V1):**
- ❌ Paiements des cotisations annuelles (futur)
- ❌ Dons au club (futur)
- ❌ Remboursements automatiques (futur)
- ❌ Paiements échelonnés (futur)
- ❌ Méthodes de paiement alternatives (carte, Apple Pay)

---

## 3. Présentation de Noda

### 3.1 Qu'est-ce que Noda ?

**Noda** est une institution de paiement agréée par la FCA (Référence: 832969) spécialisée dans l'**Open Banking** et les paiements **pay-by-bank**.

**Caractéristiques Principales:**
- Institution de paiement autorisée au Royaume-Uni
- Spécialiste de l'intégration API Open Banking
- Support des paiements instantanés via PSD2
- Alternative aux réseaux de cartes traditionnels
- Frais de transaction significativement réduits

### 3.2 Comment Fonctionne Noda ?

**Flux de Paiement:**

```
┌─────────────────────────────────────────────────┐
│ 1. Utilisateur initie le paiement               │
│    "Payer 45€ pour Sortie plongée"             │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ 2. Sélection de la banque                      │
│    Liste des 2000+ banques disponibles         │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ 3. Authentification bancaire                   │
│    Login via l'app bancaire de l'utilisateur   │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ 4. Validation du paiement                      │
│    Montant et destinataire pré-remplis         │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ 5. Confirmation et virement                    │
│    Débit du compte → Crédit compte club        │
└─────────────────────────────────────────────────┘
```

### 3.3 Avantages pour CalyMob

| Critère | Cartes Bancaires | Noda Open Banking | Gain |
|---------|------------------|-------------------|------|
| **Frais de transaction** | 2-3% | ~0.5% | 80% d'économie |
| **Sécurité** | PCI-DSS requis | Bank-level PSD2 | ✅ Simplifié |
| **Temps de traitement** | 2-3 jours | Instantané | ✅ Immédiat |
| **Couverture géographique** | Mondiale | 28 pays EU | ✅ Suffisant |
| **Complexité d'intégration** | Moyenne | Faible | ✅ API REST simple |

**Exemple de Coût:**
```
Événement : 45€
Frais Noda (0.5%) : 0.23€
Net reçu : 44.77€

vs

Événement : 45€
Frais carte (2.5%) : 1.13€
Net reçu : 43.87€

Économie : 0.90€ par transaction (80%)
```

### 3.4 Couverture Réseau

- **2,000+ banques** connectées
- **28 pays** : Tous les pays UE + UK, Brésil, Canada
- **Conformité PSD2** avec Strong Customer Authentication (SCA)
- **Chiffrement** de bout en bout

---

## 4. Architecture Technique

### 4.1 Vue d'Ensemble

```
┌──────────────────────────────────────────────────────���
│         FLUTTER MOBILE APP (CalyMob)                 │
│  ┌────────────────────────────────────────────────┐  │
│  │ 1. User clicks "Payer maintenant - 45€"       │  │
│  │    operation_detail_screen.dart                │  │
│  └────────────┬───────────────────────────────────┘  │
│               │ PaymentProvider.createPayment()      │
│               ↓                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │ 2. PaymentService calls Cloud Function        │  │
│  │    lib/services/payment_service.dart           │  │
│  └────────────┬───────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────┘
                │ HTTPS Callable Function
                ↓
┌──────────────────────────────────────────────────────┐
│      FIREBASE CLOUD FUNCTIONS (Backend)              │
│  ┌────────────────────────────────────────────────┐  │
│  │ 3. createNodaPayment()                         │  │
│  │    - Validates request                         │  │
│  │    - Calls Noda API with secure API key        │  │
│  │    - Returns payment URL                       │  │
│  └────────────┬───────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────┘
                │ REST API Call
                ↓
┌──────────────────────────────────────────────────────┐
│            NODA API (noda.live)                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ 4. Creates payment session                     │  │
│  │    - Returns payment_id and payment_url        │  │
│  └────────────┬───────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────┘
                │ Payment URL
                ↓
┌──────────────────────────────────────────────────────┐
│         FLUTTER MOBILE APP                           │
│  ┌────────────────────────────────────────────────┐  │
│  │ 5. Opens payment URL (url_launcher)            │  │
│  │    User selects bank & authenticates           │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                │ User approves payment
                ↓
┌──────────────────────────────────────────────────────┐
│            NODA PLATFORM                             │
│  ┌────────────────────────────────────────────────┐  │
│  │ 6. Processes payment                           │  │
│  │    - Sends webhook to Cloud Function           │  │
│  └────────────┬───────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────┘
                │ POST /nodaWebhook
                ↓
┌──────────────────────────────────────────────────────┐
│      FIREBASE CLOUD FUNCTIONS                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ 7. nodaWebhook()                               │  │
│  │    - Validates webhook signature               │  │
│  │    - Updates Firestore: paye = true            │  │
│  └────────────┬───────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────┘
                │ Firestore Update
                ↓
┌──────────────────────────────────────────────────────┐
│         FIREBASE FIRESTORE                           │
│  ┌────────────────────────────────────────────────┐  │
│  │ operation_participants/{participantId}         │  │
│  │   paye: false → true                           │  │
│  │   date_paiement: timestamp                     │  │
│  │   payment_id: "pay_xxx"                        │  │
│  └────────────┬───────────────────────────────────┘  │
└───────────────┼───────────────────────────────────────┘
                │ Real-time Stream
                ↓
┌──────────────────────────────────────────────────────┐
│         FLUTTER MOBILE APP                           │
│  ┌────────────────────────────────────────────────┐  │
│  │ 8. UI updates automatically                    │  │
│  │    Shows "✅ Paiement effectué"                │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 4.2 Composants Principaux

#### 4.2.1 Frontend (Flutter)

**Nouveaux fichiers à créer:**

```
lib/
├── models/
│   └── payment_response.dart          ← Modèles de réponse Noda
├── services/
│   └── payment_service.dart           ← Service d'intégration API
├── providers/
│   └── payment_provider.dart          ← Gestion d'état paiements
└── screens/
    └── payments/
        └── payment_webview_screen.dart ← Écran paiement (optionnel)
```

**Fichiers à modifier:**

```
lib/
├── models/
│   └── participant_operation.dart      ← Ajouter champs optionnels
└── screens/
    └── operations/
        └── operation_detail_screen.dart ← Ajouter UI paiement
```

#### 4.2.2 Backend (Firebase Cloud Functions)

**Structure à créer:**

```
functions/
├── package.json                        ← Dépendances Node.js
├── index.js                            ← Point d'entrée
├── src/
│   ├── payment/
│   │   ├── createPayment.js           ← Création paiement Noda
│   │   ├── checkStatus.js             ← Vérification statut
│   │   └── webhook.js                 ← Réception confirmations
│   └── utils/
│       ├── noda-client.js             ← Client API Noda
│       └── validation.js              ← Validation données
├── .env.example                        ← Template variables
└── README.md                           ← Documentation setup
```

#### 4.2.3 Firebase Firestore

**Modifications du modèle de données:**

**Collection existante:** `clubs/{clubId}/operation_participants`

```javascript
// Document existant
{
  id: "participant_123",
  operationId: "op_456",
  membreId: "user_789",
  prix: 45.00,
  paye: false,              // ← Déjà présent
  datePaiement: null,       // ← Déjà présent
  dateInscription: Timestamp,

  // NOUVEAUX CHAMPS OPTIONNELS
  paymentId: null,          // ID Noda "pay_xxxxx"
  paymentStatus: null,      // "pending" | "completed" | "failed"
  paymentMethod: null,      // "noda_open_banking"
  paymentInitiatedAt: null  // Timestamp création paiement
}
```

### 4.3 Dépendances Techniques

#### Flutter (pubspec.yaml)

```yaml
dependencies:
  # Existantes
  firebase_core: ^4.2.0
  firebase_auth: ^6.1.1
  cloud_firestore: ^6.0.3
  provider: ^6.1.0
  url_launcher: ^6.2.4     # ✅ Déjà présent

  # NOUVELLES
  dio: ^5.4.0              # Client HTTP avancé
  cloud_functions: ^5.2.0  # Appels Cloud Functions
```

#### Firebase Cloud Functions (package.json)

```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "axios": "^1.6.0",
    "express": "^4.18.0"
  }
}
```

---

## 5. Analyse du Code Existant

### 5.1 Modèle de Données Actuel

#### ParticipantOperation (lib/models/participant_operation.dart)

```dart
class ParticipantOperation {
  final String id;
  final String operationId;
  final String? operationTitre;
  final String membreId;
  final String? membreNom;
  final String? membrePrenom;
  final double prix;
  final bool paye;                    // ✅ Déjà présent!
  final DateTime? datePaiement;       // ✅ Déjà présent!
  final DateTime dateInscription;
  final String? commentaire;
  final String? notes;
}
```

**Constat:** Le modèle supporte déjà les paiements, les champs ne sont simplement jamais mis à `true`.

### 5.2 Flux d'Inscription Actuel

#### operation_detail_screen.dart

**Méthode actuelle:**

```dart
Future<void> _handleRegister() async {
  // Affiche dialogue de confirmation
  final confirm = await showDialog(...);

  if (confirm) {
    await operationProvider.registerToOperation(
      clubId: widget.clubId,
      operationId: widget.operationId,
      userId: userId,
      userName: userEmail,
    );

    // ✅ Message : "Inscription réussie !"
    // ❌ Mais paye reste = false
    // ❌ Pas de moyen de payer
  }
}
```

**Point d'intégration identifié:** Après l'inscription réussie, ajouter un bouton "Payer maintenant" si `paye == false`.

### 5.3 Architecture Provider Existante

**Providers actuels:**
- `AuthProvider` - Gestion authentification
- `OperationProvider` - Gestion événements/inscriptions
- `ExpenseProvider` - Gestion notes de frais

**Pattern confirmé:** Provider + Service Layer

```dart
// Pattern utilisé dans l'app
Provider (UI State) → Service (Business Logic) → Firebase
```

**Nouveau pattern à suivre:**
```dart
PaymentProvider → PaymentService → Cloud Functions → Noda API
```

---

## 6. Plan d'Implémentation Détaillé

### Phase 1: Configuration et Setup (Jours 1-2)

#### Jour 1: Configuration Noda

**Tâches:**

1. **Création compte Noda**
   - Aller sur https://noda.live/
   - Créer un compte marchand
   - Soumettre documents entreprise (KBIS, IBAN)
   - Attendre validation (24-48h généralement)

2. **Obtention des credentials**
   - Accéder au Noda Hub (dashboard marchand)
   - Récupérer API Key Sandbox
   - Récupérer API Key Production (après validation)
   - Noter l'URL webhook à configurer

3. **Documentation**
   - Lire https://docs.noda.live/reference
   - Comprendre les endpoints:
     - `POST /v1/payments` - Créer paiement
     - `GET /v1/payments/{id}` - Statut paiement
   - Comprendre le format des webhooks
   - Tester avec curl/Postman

**Livrables:**
- ✅ Compte Noda activé
- ✅ API keys obtenues
- ✅ Documentation technique lue

#### Jour 2: Setup Firebase Cloud Functions

**Tâches:**

1. **Initialiser Cloud Functions**
   ```bash
   cd /Users/jan/Documents/GitHub/CalyMob
   firebase init functions
   # Choisir JavaScript/TypeScript
   # Installer dépendances
   ```

2. **Structure du projet**
   ```bash
   mkdir -p functions/src/payment
   mkdir -p functions/src/utils
   touch functions/src/payment/createPayment.js
   touch functions/src/payment/checkStatus.js
   touch functions/src/payment/webhook.js
   touch functions/src/utils/noda-client.js
   ```

3. **Configuration environnement**
   ```bash
   # Stocker API key Noda de façon sécurisée
   firebase functions:config:set noda.api_key_sandbox="sk_sandbox_xxx"
   firebase functions:config:set noda.api_key_production="sk_live_xxx"
   ```

4. **Test local**
   ```bash
   firebase emulators:start --only functions
   # Tester appel fonction locale
   ```

**Livrables:**
- ✅ Firebase Functions initialisé
- ✅ Structure de projet créée
- ✅ Variables d'environnement configurées
- ✅ Test local fonctionnel

---

### Phase 2: Développement Backend (Jours 3-5)

#### Jour 3: Cloud Function - Création Paiement

**Fichier:** `functions/src/payment/createPayment.js`

**Implémentation:**

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

/**
 * Cloud Function callable pour créer un paiement Noda
 */
exports.createNodaPayment = functions.https.onCall(async (data, context) => {
  // 1. Vérifier l'authentification
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  // 2. Valider les paramètres
  const { clubId, operationId, participantId, amount, currency, description } = data;

  if (!clubId || !operationId || !participantId || !amount) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields'
    );
  }

  // 3. Vérifier que l'utilisateur est bien inscrit
  const participantDoc = await admin.firestore()
    .doc(`clubs/${clubId}/operation_participants/${participantId}`)
    .get();

  if (!participantDoc.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'Participant not found'
    );
  }

  const participant = participantDoc.data();

  // 4. Vérifier que le paiement n'a pas déjà été effectué
  if (participant.paye === true) {
    throw new functions.https.HttpsError(
      'already-exists',
      'Payment already completed'
    );
  }

  try {
    // 5. Appeler l'API Noda
    const nodaResponse = await axios.post(
      'https://api.noda.live/v1/payments',
      {
        amount: amount,
        currency: currency || 'EUR',
        description: description,
        reference: `${clubId}_${operationId}_${participantId}`,
        return_url: `calymob://payment/complete?participantId=${participantId}`,
        webhook_url: `https://europe-west1-calymob-XXXXX.cloudfunctions.net/nodaWebhook`,
        metadata: {
          clubId,
          operationId,
          participantId,
          userId: context.auth.uid
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${functions.config().noda.api_key_sandbox}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const paymentData = nodaResponse.data;

    // 6. Enregistrer la référence dans Firestore
    await admin.firestore()
      .doc(`clubs/${clubId}/operation_participants/${participantId}`)
      .update({
        paymentId: paymentData.payment_id,
        paymentStatus: 'pending',
        paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    // 7. Retourner les données de paiement
    return {
      paymentId: paymentData.payment_id,
      paymentUrl: paymentData.payment_url,
      status: paymentData.status,
      expiresAt: paymentData.expires_at
    };

  } catch (error) {
    console.error('Error calling Noda API:', error.response?.data || error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to create payment',
      error.response?.data
    );
  }
});
```

**Tests:**
```javascript
// Test unitaire avec Jest
describe('createNodaPayment', () => {
  it('should create payment successfully', async () => {
    // Mock data
    // Call function
    // Assert response
  });

  it('should reject unauthenticated users', async () => {
    // Test sans auth
  });
});
```

#### Jour 4: Cloud Function - Webhook Handler

**Fichier:** `functions/src/payment/webhook.js`

**Implémentation:**

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

/**
 * Webhook endpoint pour recevoir les notifications Noda
 */
exports.nodaWebhook = functions.https.onRequest(async (req, res) => {
  // 1. Vérifier la signature du webhook (sécurité)
  const signature = req.headers['x-noda-signature'];
  const webhookSecret = functions.config().noda.webhook_secret;

  const isValid = verifyWebhookSignature(
    req.body,
    signature,
    webhookSecret
  );

  if (!isValid) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Unauthorized');
  }

  // 2. Parser le payload
  const payload = req.body;
  const { payment_id, status, metadata } = payload;

  console.log(`Webhook received: payment=${payment_id}, status=${status}`);

  const { clubId, operationId, participantId } = metadata;

  try {
    // 3. Traiter selon le statut
    if (status === 'completed') {
      // Paiement réussi
      await admin.firestore()
        .doc(`clubs/${clubId}/operation_participants/${participantId}`)
        .update({
          paye: true,
          datePaiement: admin.firestore.FieldValue.serverTimestamp(),
          paymentId: payment_id,
          paymentStatus: 'completed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

      console.log(`Payment completed for participant ${participantId}`);

      // Optionnel : Envoyer email de confirmation
      // await sendPaymentConfirmationEmail(participantId);

    } else if (status === 'failed') {
      // Paiement échoué
      await admin.firestore()
        .doc(`clubs/${clubId}/operation_participants/${participantId}`)
        .update({
          paymentStatus: 'failed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

      console.log(`Payment failed for participant ${participantId}`);

    } else if (status === 'cancelled') {
      // Paiement annulé par l'utilisateur
      await admin.firestore()
        .doc(`clubs/${clubId}/operation_participants/${participantId}`)
        .update({
          paymentStatus: 'cancelled',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

      console.log(`Payment cancelled for participant ${participantId}`);
    }

    // 4. Répondre à Noda avec succès
    res.status(200).send({ received: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * Vérifie la signature du webhook Noda
 */
function verifyWebhookSignature(payload, signature, secret) {
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}
```

#### Jour 5: Cloud Function - Vérification Statut + Tests

**Fichier:** `functions/src/payment/checkStatus.js`

```javascript
exports.checkNodaPaymentStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const { paymentId } = data;

  try {
    const response = await axios.get(
      `https://api.noda.live/v1/payments/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${functions.config().noda.api_key_sandbox}`
        }
      }
    );

    return {
      status: response.data.status,
      completedAt: response.data.completed_at,
      failureReason: response.data.failure_reason
    };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to check status');
  }
});
```

**Tests d'intégration:**

```bash
# Tester avec l'émulateur
firebase emulators:start

# Tester création paiement
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/createNodaPayment \
  -H "Content-Type: application/json" \
  -d '{"data": {"clubId": "test", "operationId": "op1", ...}}'

# Simuler webhook
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/nodaWebhook \
  -H "Content-Type: application/json" \
  -d '{"payment_id": "pay_123", "status": "completed", ...}'
```

**Livrables Jour 3-5:**
- ✅ 3 Cloud Functions implémentées
- ✅ Validation et sécurité en place
- ✅ Tests unitaires écrits
- ✅ Tests d'intégration passés

---

### Phase 3: Développement Frontend Flutter (Jours 6-10)

#### Jour 6: Modèles et Service de Paiement

**1. Créer les modèles (payment_response.dart)**

```dart
class PaymentResponse {
  final String paymentId;
  final String paymentUrl;
  final String status;
  final DateTime expiresAt;

  PaymentResponse({
    required this.paymentId,
    required this.paymentUrl,
    required this.status,
    required this.expiresAt,
  });

  factory PaymentResponse.fromJson(Map<String, dynamic> json) {
    return PaymentResponse(
      paymentId: json['paymentId'] as String,
      paymentUrl: json['paymentUrl'] as String,
      status: json['status'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }
}

class PaymentStatus {
  final String status;
  final DateTime? completedAt;
  final String? failureReason;

  PaymentStatus({
    required this.status,
    this.completedAt,
    this.failureReason,
  });

  factory PaymentStatus.fromJson(Map<String, dynamic> json) {
    return PaymentStatus(
      status: json['status'] as String,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      failureReason: json['failureReason'] as String?,
    );
  }

  bool get isPending => status == 'pending';
  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isCancelled => status == 'cancelled';
}

class PaymentException implements Exception {
  final String message;
  final String? code;

  PaymentException(this.message, {this.code});

  @override
  String toString() => 'PaymentException: $message';
}
```

**2. Créer le service (payment_service.dart)**

```dart
import 'package:cloud_functions/cloud_functions.dart';
import '../models/payment_response.dart';

class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  Future<PaymentResponse> createPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    try {
      final result = await _functions.httpsCallable('createNodaPayment').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'amount': amount,
        'currency': 'EUR',
        'description': description,
      });

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(
        _getFriendlyErrorMessage(e.code),
        code: e.code,
      );
    } catch (e) {
      throw PaymentException(
        'Erreur lors de la création du paiement. Veuillez réessayer.'
      );
    }
  }

  Future<PaymentStatus> checkPaymentStatus(String paymentId) async {
    try {
      final result =
          await _functions.httpsCallable('checkNodaPaymentStatus').call({
        'paymentId': paymentId,
      });

      return PaymentStatus.fromJson(Map<String, dynamic>.from(result.data));
    } catch (e) {
      throw PaymentException('Erreur lors de la vérification du paiement');
    }
  }

  String _getFriendlyErrorMessage(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'Vous devez être connecté pour effectuer un paiement';
      case 'already-exists':
        return 'Ce paiement a déjà été effectué';
      case 'invalid-argument':
        return 'Données de paiement invalides';
      case 'unavailable':
        return 'Service temporairement indisponible. Réessayez.';
      default:
        return 'Erreur de paiement. Contactez le support.';
    }
  }
}
```

**Tests:**
```dart
// test/services/payment_service_test.dart
void main() {
  group('PaymentService', () {
    test('createPayment should return PaymentResponse', () async {
      // Mock CloudFunctions
      // Test
    });
  });
}
```

#### Jour 7: Provider de Paiement

**Créer le provider (payment_provider.dart)**

```dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';
import '../services/payment_service.dart';

class PaymentProvider with ChangeNotifier {
  final PaymentService _paymentService = PaymentService();

  bool _isProcessing = false;
  String? _currentPaymentId;
  String? _errorMessage;
  Timer? _statusCheckTimer;

  bool get isProcessing => _isProcessing;
  String? get currentPaymentId => _currentPaymentId;
  String? get errorMessage => _errorMessage;

  Future<String?> createPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    _isProcessing = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _paymentService.createPayment(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        amount: amount,
        description: description,
      );

      _currentPaymentId = response.paymentId;
      _isProcessing = false;
      notifyListeners();

      return response.paymentUrl;
    } on PaymentException catch (e) {
      _errorMessage = e.message;
      _isProcessing = false;
      notifyListeners();
      return null;
    }
  }

  void startPaymentStatusPolling(
    String paymentId,
    Function(PaymentStatus) onStatusUpdate,
  ) {
    stopPaymentStatusPolling();

    int tickCount = 0;
    const maxTicks = 100; // 5 minutes

    _statusCheckTimer = Timer.periodic(
      const Duration(seconds: 3),
      (timer) async {
        tickCount++;

        if (tickCount > maxTicks) {
          stopPaymentStatusPolling();
          return;
        }

        try {
          final status = await _paymentService.checkPaymentStatus(paymentId);
          onStatusUpdate(status);

          if (status.isCompleted || status.isFailed || status.isCancelled) {
            stopPaymentStatusPolling();
          }
        } catch (e) {
          debugPrint('Error checking payment status: $e');
        }
      },
    );
  }

  void stopPaymentStatusPolling() {
    _statusCheckTimer?.cancel();
    _statusCheckTimer = null;
  }

  void reset() {
    stopPaymentStatusPolling();
    _isProcessing = false;
    _currentPaymentId = null;
    _errorMessage = null;
    notifyListeners();
  }

  @override
  void dispose() {
    stopPaymentStatusPolling();
    super.dispose();
  }
}
```

**Enregistrer le provider dans main.dart:**

```dart
// lib/main.dart
runApp(
  MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (_) => AuthProvider()),
      ChangeNotifierProvider(create: (_) => OperationProvider()),
      ChangeNotifierProvider(create: (_) => ExpenseProvider()),
      ChangeNotifierProvider(create: (_) => PaymentProvider()), // ← NOUVEAU
    ],
    child: MyApp(),
  ),
);
```

#### Jour 8-9: Modification de l'UI - operation_detail_screen.dart

**Ajouter le bouton de paiement:**

```dart
// Dans la méthode build(), après le bouton d'inscription

Widget _buildPaymentSection() {
  final participant = context.watch<OperationProvider>()
      .getCurrentUserParticipant(widget.operationId);

  if (participant == null) {
    return const SizedBox.shrink();
  }

  final isPaid = participant.paye;

  if (isPaid) {
    // Afficher le badge "Payé"
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.green, width: 2),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 28),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Paiement effectué',
                style: TextStyle(
                  color: Colors.green,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (participant.datePaiement != null)
                Text(
                  'Le ${DateFormat('dd/MM/yyyy à HH:mm').format(participant.datePaiement!)}',
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 14,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  } else {
    // Afficher le bouton "Payer"
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Message informatif
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.orange.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.orange.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline, color: Colors.orange),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Votre inscription sera confirmée après le paiement',
                  style: TextStyle(color: Colors.grey[700], fontSize: 14),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Bouton de paiement
        SizedBox(
          height: 56,
          child: ElevatedButton.icon(
            onPressed: context.watch<PaymentProvider>().isProcessing
                ? null
                : () => _handlePayment(participant),
            icon: const Icon(Icons.payment, color: Colors.white),
            label: Text(
              'Payer maintenant - ${NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(participant.prix)}',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 2,
            ),
          ),
        ),

        const SizedBox(height: 8),

        // Informations paiement
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.lock, size: 16, color: Colors.grey),
            const SizedBox(width: 4),
            Text(
              'Paiement sécurisé via Noda (Open Banking)',
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
          ],
        ),
      ],
    );
  }
}
```

**Ajouter le handler de paiement:**

```dart
Future<void> _handlePayment(ParticipantOperation participant) async {
  final paymentProvider = context.read<PaymentProvider>();
  final operation = context.read<OperationProvider>().selectedOperation;

  if (operation == null) return;

  try {
    // Afficher dialogue de chargement
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Préparation du paiement...'),
              ],
            ),
          ),
        ),
      ),
    );

    // Créer le paiement
    final paymentUrl = await paymentProvider.createPayment(
      clubId: widget.clubId,
      operationId: widget.operationId,
      participantId: participant.id,
      amount: participant.prix,
      description: operation.titre,
    );

    // Fermer le dialogue de chargement
    if (mounted) Navigator.pop(context);

    if (paymentUrl == null) {
      // Erreur
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(paymentProvider.errorMessage ?? 'Erreur de paiement'),
            backgroundColor: Colors.red,
            action: SnackBarAction(
              label: 'Réessayer',
              textColor: Colors.white,
              onPressed: () => _handlePayment(participant),
            ),
          ),
        );
      }
      return;
    }

    // Ouvrir la page de paiement
    final Uri paymentUri = Uri.parse(paymentUrl);
    if (await canLaunchUrl(paymentUri)) {
      await launchUrl(
        paymentUri,
        mode: LaunchMode.externalApplication,
      );

      if (mounted) {
        // Message d'instruction
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Complétez le paiement dans votre application bancaire',
            ),
            duration: Duration(seconds: 5),
            backgroundColor: Colors.blue,
          ),
        );

        // Démarrer le polling du statut
        paymentProvider.startPaymentStatusPolling(
          paymentProvider.currentPaymentId!,
          (status) {
            if (status.isCompleted && mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.white),
                      SizedBox(width: 8),
                      Text('Paiement réussi !'),
                    ],
                  ),
                  backgroundColor: Colors.green,
                  duration: Duration(seconds: 3),
                ),
              );
            } else if (status.isFailed && mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    'Paiement échoué${status.failureReason != null ? ': ${status.failureReason}' : ''}',
                  ),
                  backgroundColor: Colors.red,
                  action: SnackBarAction(
                    label: 'Réessayer',
                    textColor: Colors.white,
                    onPressed: () => _handlePayment(participant),
                  ),
                ),
              );
            }
          },
        );
      }
    } else {
      throw Exception('Impossible d\'ouvrir le lien de paiement');
    }
  } catch (e) {
    if (mounted) {
      Navigator.of(context).pop(); // Fermer dialogue si ouvert
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
```

**Ajouter dans le build():**

```dart
@override
Widget build(BuildContext context) {
  return Scaffold(
    // ... existing code ...
    body: SingleChildScrollView(
      child: Column(
        children: [
          // ... infos opération existantes ...

          // NOUVEAU: Section paiement
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: _buildPaymentSection(),
          ),

          // ... reste du contenu ...
        ],
      ),
    ),
  );
}
```

#### Jour 10: Tests et Polish

**Tests à effectuer:**

1. **Test inscription + paiement**
   - S'inscrire à un événement
   - Cliquer "Payer maintenant"
   - Vérifier ouverture navigateur
   - Simuler paiement sandbox
   - Vérifier mise à jour UI

2. **Test statuts différents**
   - Paiement réussi → Badge vert
   - Paiement échoué → Message d'erreur + Retry
   - Paiement annulé → Message info

3. **Test edge cases**
   - App tuée pendant paiement → Webhook met à jour Firestore → UI se met à jour au redémarrage
   - Perte réseau → Message erreur
   - Double paiement → Bloqué côté serveur

**Polish UI:**
- Ajouter animations (fade in/out pour les messages)
- Améliorer les messages d'erreur
- Ajouter icônes
- Tester sur iOS et Android

**Livrables Jours 6-10:**
- ✅ 3 nouveaux fichiers Flutter créés
- ✅ UI paiement intégrée
- ✅ Tests fonctionnels passés
- ✅ App testée sur émulateurs iOS/Android

---

### Phase 4: Tests et Validation (Jours 11-13)

#### Jour 11: Tests Unitaires et d'Intégration

**Tests Backend (Cloud Functions):**

```javascript
// functions/test/payment.test.js
const test = require('firebase-functions-test')();
const admin = require('firebase-admin');

describe('Payment Functions', () => {
  describe('createNodaPayment', () => {
    it('should reject unauthenticated requests', async () => {
      const wrapped = test.wrap(createNodaPayment);

      try {
        await wrapped({ clubId: 'test', amount: 45 });
        fail('Should have thrown');
      } catch (e) {
        expect(e.code).toBe('unauthenticated');
      }
    });

    it('should create payment successfully', async () => {
      const wrapped = test.wrap(createNodaPayment);

      const result = await wrapped(
        {
          clubId: 'club1',
          operationId: 'op1',
          participantId: 'part1',
          amount: 45,
          description: 'Test event'
        },
        { auth: { uid: 'user1' } }
      );

      expect(result.paymentId).toBeDefined();
      expect(result.paymentUrl).toContain('noda.live');
    });
  });

  describe('nodaWebhook', () => {
    it('should update Firestore on payment completion', async () => {
      // Mock webhook payload
      const payload = {
        payment_id: 'pay_123',
        status: 'completed',
        metadata: {
          clubId: 'club1',
          operationId: 'op1',
          participantId: 'part1'
        }
      };

      // Call webhook
      await nodaWebhook(mockRequest(payload), mockResponse());

      // Verify Firestore update
      const doc = await admin.firestore()
        .doc('clubs/club1/operation_participants/part1')
        .get();

      expect(doc.data().paye).toBe(true);
    });
  });
});
```

**Tests Frontend (Flutter):**

```dart
// test/providers/payment_provider_test.dart
void main() {
  group('PaymentProvider', () => {
    late PaymentProvider provider;
    late MockPaymentService mockService;

    setUp(() {
      mockService = MockPaymentService();
      provider = PaymentProvider();
      // Inject mock
    });

    test('createPayment updates state correctly', () async {
      when(mockService.createPayment(...))
        .thenAnswer((_) async => PaymentResponse(...));

      await provider.createPayment(...);

      expect(provider.isProcessing, false);
      expect(provider.currentPaymentId, 'pay_123');
      expect(provider.errorMessage, null);
    });

    test('createPayment handles errors', () async {
      when(mockService.createPayment(...))
        .thenThrow(PaymentException('Error'));

      await provider.createPayment(...);

      expect(provider.errorMessage, 'Error');
      expect(provider.isProcessing, false);
    });
  });
}
```

**Exécuter les tests:**

```bash
# Backend
cd functions
npm test

# Frontend
flutter test
flutter test --coverage
```

#### Jour 12: Tests End-to-End

**Scénarios à tester:**

1. **Parcours complet réussi**
   ```
   1. Login utilisateur
   2. Navigation vers événement
   3. Inscription
   4. Clic "Payer"
   5. Sélection banque sandbox
   6. Authentification sandbox
   7. Validation paiement
   8. Retour app
   9. Vérification badge "Payé"
   ```

2. **Paiement échoué**
   ```
   1-6. Identique
   7. Échec paiement (fonds insuffisants)
   8. Message d'erreur
   9. Bouton "Réessayer" fonctionne
   ```

3. **Paiement annulé**
   ```
   1-6. Identique
   7. Utilisateur annule
   8. Retour app
   9. Statut reste "Non payé"
   10. Peut retenter
   ```

4. **App tuée pendant paiement**
   ```
   1-6. Identique
   7. Tuer l'app
   8. Paiement se complète quand même
   9. Webhook met à jour Firestore
   10. Relancer app
   11. UI montre "Payé" (via stream Firestore)
   ```

5. **Double paiement**
   ```
   1-9. Paiement réussi
   10. Cliquer à nouveau "Payer"
   11. Cloud Function refuse (already-exists)
   12. Message "Paiement déjà effectué"
   ```

**Checklist de test:**

- [ ] iOS - iPhone 14 (émulateur)
- [ ] iOS - iPad (émulateur)
- [ ] Android - Pixel 7 (émulateur)
- [ ] Android - Tablette
- [ ] Mode sombre / Mode clair
- [ ] Perte réseau pendant paiement
- [ ] Rotation écran
- [ ] App en background pendant paiement

#### Jour 13: Tests Utilisateurs (UAT)

**Plan de test utilisateur:**

1. **Recrutement testeurs**
   - 3-5 membres du club
   - Différents types de téléphones
   - Différentes banques

2. **Environnement de test**
   - App en mode TestFlight (iOS) / Internal Testing (Android)
   - Sandbox Noda avec comptes bancaires de test
   - Montants de test : 0.01€ (pour limiter coûts)

3. **Scénarios à tester**
   - Inscription + paiement événement
   - Tentative double paiement
   - Annulation paiement

4. **Feedback à collecter**
   - Clarté du processus
   - Messages d'erreur compréhensibles
   - Temps de paiement
   - Problèmes rencontrés
   - Suggestions d'amélioration

5. **Documentation des bugs**
   - Créer GitHub Issues pour chaque bug
   - Prioriser : Critical / High / Medium / Low
   - Fixer les Critical/High avant déploiement

**Livrables Jours 11-13:**
- ✅ Suite de tests automatisés
- ✅ Tests E2E passés
- ✅ UAT effectué avec vrais utilisateurs
- ✅ Bugs critiques corrigés

---

### Phase 5: Déploiement Production (Jours 14-15)

#### Jour 14: Préparation Production

**1. Configuration Production**

```bash
# Remplacer les clés sandbox par les clés production
firebase functions:config:set noda.api_key="sk_live_PRODUCTION_KEY"
firebase functions:config:set noda.webhook_secret="whsec_PRODUCTION_SECRET"

# Vérifier la config
firebase functions:config:get
```

**2. Variables d'environnement Flutter**

```dart
// lib/config/environment.dart
class Environment {
  static const bool isProduction = bool.fromEnvironment('PRODUCTION', defaultValue: false);

  static String get firebaseFunctionsRegion {
    return 'europe-west1'; // Région européenne pour GDPR
  }
}
```

**3. Build production**

```bash
# iOS
cd ios
pod install
cd ..
flutter build ios --release --dart-define=PRODUCTION=true

# Android
flutter build appbundle --release --dart-define=PRODUCTION=true
```

**4. Déployer Cloud Functions**

```bash
# Vérifier qu'on est sur le bon projet
firebase use production

# Déployer les functions
firebase deploy --only functions

# Vérifier les logs
firebase functions:log
```

**5. Configuration Noda Production**

- Aller dans Noda Hub
- Configurer l'URL du webhook production:
  ```
  https://europe-west1-calymob-XXXXX.cloudfunctions.net/nodaWebhook
  ```
- Tester avec un paiement de test
- Vérifier réception webhook

**6. Firestore Security Rules**

```javascript
// firestore.rules
match /clubs/{clubId}/operation_participants/{participantId} {
  // Lecture : membre du club ou participant lui-même
  allow read: if request.auth != null &&
    (isClubMember(clubId) || resource.data.membreId == request.auth.uid);

  // Écriture manuelle : admins uniquement
  allow create, update: if request.auth != null && isClubAdmin(clubId);

  // IMPORTANT : Les webhooks utilisent l'Admin SDK qui bypass les rules
  // Pas de rule spéciale nécessaire pour les updates via webhook
}
```

#### Jour 15: Déploiement et Monitoring

**1. Déploiement App**

**iOS (App Store):**
```bash
# Upload vers App Store Connect
flutter build ipa --release --dart-define=PRODUCTION=true

# Via Xcode
open ios/Runner.xcworkspace
# Product > Archive
# Distribute App > App Store Connect
```

**Android (Google Play):**
```bash
# Upload vers Google Play Console
flutter build appbundle --release --dart-define=PRODUCTION=true

# Aller dans Google Play Console
# Production > Create new release
# Upload le .aab
```

**2. Release Notes**

```markdown
## Version 1.1.0 - Paiements en Ligne

### Nouvelles Fonctionnalités
✨ Paiement en ligne sécurisé pour les événements
- Paiement direct depuis l'application via Open Banking
- Support de 2000+ banques européennes
- Confirmation instantanée du paiement
- Historique des paiements visible dans l'app

### Améliorations
- Interface utilisateur améliorée pour les inscriptions
- Statut de paiement en temps réel
- Messages d'erreur plus clairs

### Technique
- Intégration API Noda (Open Banking)
- Sécurité renforcée (PSD2 compliant)
- Mise à jour automatique du statut
```

**3. Déploiement Progressif**

**Stratégie:**
1. **Jour 1** : Release à 10% des utilisateurs
2. **Jour 2** : Si OK, passer à 25%
3. **Jour 3** : Si OK, passer à 50%
4. **Jour 4** : Si OK, passer à 100%

**Monitoring pendant le rollout:**
- Surveiller les crashs (Firebase Crashlytics)
- Surveiller les logs Cloud Functions
- Vérifier taux de succès des paiements
- Surveiller temps de réponse API

**4. Setup Monitoring**

**Firebase Performance:**
```dart
// lib/main.dart
import 'package:firebase_performance/firebase_performance.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  // Activer Performance Monitoring
  FirebasePerformance.instance.setPerformanceCollectionEnabled(true);

  runApp(MyApp());
}
```

**Cloud Functions Monitoring:**
```javascript
// functions/index.js
const functions = require('firebase-functions');

// Métriques personnalisées
exports.createNodaPayment = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    const startTime = Date.now();

    try {
      // ... logique ...

      const duration = Date.now() - startTime;
      console.log(`Payment created in ${duration}ms`);

      return result;
    } catch (error) {
      console.error('Payment creation failed:', error);
      throw error;
    }
  });
```

**Alertes:**
- Configurer alertes si taux d'erreur > 5%
- Alerte si temps réponse > 10s
- Alerte si webhook non reçu après 5min

**5. Documentation Utilisateur**

Créer guide utilisateur:

```markdown
# Guide de Paiement - CalyMob

## Comment payer votre inscription

1. **Inscrivez-vous à l'événement**
   - Cliquez sur l'événement dans la liste
   - Cliquez "S'inscrire"

2. **Effectuez le paiement**
   - Cliquez "Payer maintenant"
   - Sélectionnez votre banque dans la liste
   - Connectez-vous à votre espace bancaire
   - Validez le paiement

3. **Confirmation**
   - Retournez dans l'application
   - Votre paiement est confirmé instantanément
   - Vous recevez un badge "Payé" ✅

## Questions Fréquentes

**Q: Quelles banques sont supportées ?**
R: Plus de 2000 banques dans 28 pays, incluant toutes les grandes banques européennes.

**Q: Est-ce sécurisé ?**
R: Oui, nous utilisons Noda (Open Banking) avec authentification PSD2 au niveau de votre banque.

**Q: Combien ça coûte ?**
R: Aucun frais supplémentaire pour vous. Vous payez uniquement le prix de l'événement.

**Q: Que faire si le paiement échoue ?**
R: Vérifiez que vous avez suffisamment de fonds. Vous pouvez réessayer en cliquant à nouveau sur "Payer".

**Q: Puis-je annuler un paiement ?**
R: Contactez un administrateur du club pour un remboursement.
```

**Livrables Jours 14-15:**
- ✅ Cloud Functions déployées en production
- ✅ App publiée sur App Store / Google Play
- ✅ Monitoring en place
- ✅ Documentation utilisateur créée
- ✅ Release notes publiées

---

## 7. Spécifications Techniques

### 7.1 API Noda

**Base URL:** `https://api.noda.live`

**Authentification:**
```
Authorization: Bearer {API_KEY}
```

**Endpoints Principaux:**

#### POST /v1/payments
Crée un nouveau paiement.

**Request:**
```json
{
  "amount": 45.00,
  "currency": "EUR",
  "description": "Sortie plongée - 23 Dec 2025",
  "reference": "club1_op123_part456",
  "return_url": "calymob://payment/complete?participantId=part456",
  "webhook_url": "https://europe-west1-calymob.cloudfunctions.net/nodaWebhook",
  "metadata": {
    "clubId": "club1",
    "operationId": "op123",
    "participantId": "part456"
  }
}
```

**Response:**
```json
{
  "payment_id": "pay_abc123xyz",
  "status": "pending",
  "payment_url": "https://pay.noda.live/session/abc123",
  "expires_at": "2025-12-23T12:00:00Z"
}
```

#### GET /v1/payments/{payment_id}
Récupère le statut d'un paiement.

**Response:**
```json
{
  "payment_id": "pay_abc123xyz",
  "status": "completed",
  "amount": 45.00,
  "currency": "EUR",
  "completed_at": "2025-12-23T10:30:00Z",
  "bank": "BNP Paribas"
}
```

**Statuts possibles:**
- `pending` : En attente
- `completed` : Complété avec succès
- `failed` : Échoué
- `cancelled` : Annulé par l'utilisateur

#### Webhooks

**Format:**
```json
{
  "event": "payment.completed",
  "payment_id": "pay_abc123xyz",
  "status": "completed",
  "amount": 45.00,
  "currency": "EUR",
  "completed_at": "2025-12-23T10:30:00Z",
  "metadata": {
    "clubId": "club1",
    "operationId": "op123",
    "participantId": "part456"
  }
}
```

**Headers:**
```
X-Noda-Signature: sha256_hash_of_payload
X-Noda-Event: payment.completed
```

### 7.2 Modèle de Données Firestore

#### Collection: `clubs/{clubId}/operation_participants`

**Champs existants:**
```typescript
{
  id: string;
  operationId: string;
  operationTitre: string | null;
  membreId: string;
  membreNom: string | null;
  membrePrenom: string | null;
  prix: number;
  paye: boolean;                // ✅ Existant
  datePaiement: Timestamp | null; // ✅ Existant
  dateInscription: Timestamp;
  commentaire: string | null;
  notes: string | null;
}
```

**Nouveaux champs (optionnels):**
```typescript
{
  // ... champs existants ...

  // Nouveaux champs paiement
  paymentId: string | null;          // ID Noda "pay_xxxxx"
  paymentStatus: string | null;      // "pending" | "completed" | "failed" | "cancelled"
  paymentMethod: string | null;      // "noda_open_banking"
  paymentInitiatedAt: Timestamp | null; // Quand le paiement a été créé
  updatedAt: Timestamp;              // Dernière mise à jour
}
```

**Index Firestore à créer:**
```
Collection: operation_participants
Index 1: operationId (ASC), paye (ASC)
Index 2: membreId (ASC), dateInscription (DESC)
```

### 7.3 Performance

**Objectifs:**

| Métrique | Objectif | Acceptable |
|----------|----------|------------|
| Temps création paiement | < 2s | < 5s |
| Temps confirmation webhook | < 1s | < 3s |
| Temps total paiement | < 30s | < 60s |
| Disponibilité API | > 99.5% | > 99% |
| Taux de succès paiements | > 95% | > 90% |

**Optimisations:**
- Utiliser région europe-west1 pour Cloud Functions (proximité)
- Cache des données opération côté client
- Retry automatique si timeout
- Polling statut toutes les 3s (pas 1s)

---

## 8. Sécurité et Conformité

### 8.1 Sécurité

**Principes:**

1. **API Keys jamais exposées**
   - ❌ Jamais dans le code Flutter
   - ✅ Uniquement dans Cloud Functions
   - ✅ Variables d'environnement Firebase

2. **Validation côté serveur**
   - Vérifier que l'utilisateur est authentifié
   - Vérifier que l'utilisateur est inscrit
   - Vérifier que le paiement n'existe pas déjà
   - Valider montant et devise

3. **Webhook sécurisé**
   - Vérifier signature HMAC
   - Vérifier timestamp (éviter replay attacks)
   - Validation payload

4. **Firestore Rules**
   ```javascript
   // Seuls les admins et l'utilisateur peuvent lire leurs paiements
   match /operation_participants/{participantId} {
     allow read: if isOwnerOrAdmin();
     allow write: if isAdmin(); // Webhooks utilisent Admin SDK
   }
   ```

### 8.2 Conformité PSD2

**Noda gère:**
- ✅ Strong Customer Authentication (SCA)
- ✅ Chiffrement données bancaires
- ✅ Conformité réglementaire FCA
- ✅ Protection données (GDPR)

**CalyMob doit:**
- ✅ Ne pas stocker données bancaires
- ✅ Afficher clairement les montants
- ✅ Obtenir consentement utilisateur
- ✅ Respecter GDPR pour données personnelles

### 8.3 RGPD (GDPR)

**Données collectées:**
- ID paiement Noda
- Statut paiement
- Date/heure paiement
- Montant

**Données NON collectées:**
- ❌ Numéro de compte bancaire
- ❌ IBAN
- ❌ Identifiants bancaires
- ❌ Historique transactions

**Droits utilisateurs:**
- Droit d'accès : Voir historique paiements
- Droit de rectification : Corriger erreurs
- Droit à l'oubli : Supprimer compte et données
- Droit de portabilité : Exporter données

**Mise en œuvre:**
```dart
// Fonction d'export des données utilisateur
Future<Map<String, dynamic>> exportUserPaymentData(String userId) async {
  final payments = await FirebaseFirestore.instance
    .collectionGroup('operation_participants')
    .where('membreId', isEqualTo: userId)
    .get();

  return {
    'payments': payments.docs.map((doc) => {
      'date': doc['datePaiement'],
      'amount': doc['prix'],
      'status': doc['paye'] ? 'paid' : 'unpaid',
      'operation': doc['operationTitre'],
    }).toList(),
  };
}
```

### 8.4 Audit et Logs

**Logs à conserver (90 jours):**
- Tentatives de paiement
- Succès/échecs
- Webhooks reçus
- Erreurs API

**Alertes à configurer:**
- Taux d'erreur > 5%
- Webhook non reçu dans les 5min
- Tentatives de fraude détectées

---

## 9. Tests et Validation

### 9.1 Stratégie de Test

**Pyramide de tests:**

```
        /\
       /  \  E2E Tests (10%)
      /────\
     /      \  Integration Tests (30%)
    /────────\
   /          \  Unit Tests (60%)
  /────────────\
```

### 9.2 Tests Unitaires

**Backend (Cloud Functions):**
- Test création paiement avec données valides
- Test rejet si non authentifié
- Test rejet si déjà payé
- Test validation des paramètres
- Test gestion erreurs API Noda

**Frontend (Flutter):**
- Test PaymentService création paiement
- Test PaymentProvider gestion état
- Test messages d'erreur
- Test polling statut
- Test UI states (loading, success, error)

**Objectif couverture:** > 80%

### 9.3 Tests d'Intégration

**Scénarios:**
1. Création paiement → Appel Noda → Retour URL
2. Webhook reçu → Update Firestore → Stream UI
3. Vérification statut → Appel Noda → Retour statut

**Environnement:** Émulateurs Firebase + Sandbox Noda

### 9.4 Tests E2E

**Outils:** Flutter Integration Tests + Firebase Test Lab

**Scénarios critiques:**
1. Flux complet : Inscription → Paiement → Confirmation
2. Gestion erreur : Paiement échoué → Retry → Succès
3. App killed : Paiement en cours → Kill app → Relaunch → Voir confirmation

### 9.5 Tests de Charge

**Objectifs:**
- Support 100 paiements simultanés
- Temps réponse < 5s même sous charge
- Pas de perte de webhooks

**Outils:** Artillery.io ou k6

**Scénario:**
```yaml
# load-test.yml
scenarios:
  - name: "Payment Creation"
    flow:
      - post:
          url: "/createNodaPayment"
          json:
            clubId: "test"
            amount: 45
    arrivalRate: 10  # 10 requêtes/seconde
    duration: 60     # pendant 60 secondes
```

---

## 10. Déploiement

### 10.1 Environnements

| Environnement | Firebase Project | Noda API | App Version |
|---------------|------------------|----------|-------------|
| Development | calymob-dev | Sandbox | Debug |
| Staging | calymob-staging | Sandbox | Release |
| Production | calymob-prod | Production | Release |

### 10.2 Checklist de Déploiement

**Pre-Deployment:**
- [ ] Tous les tests passent
- [ ] Code review effectué
- [ ] Documentation à jour
- [ ] Release notes rédigées
- [ ] Backup Firestore effectué
- [ ] Rollback plan documenté

**Deployment:**
- [ ] Déployer Cloud Functions en staging
- [ ] Tester en staging avec Noda sandbox
- [ ] Déployer Cloud Functions en production
- [ ] Tester avec 1 paiement réel (0.01€)
- [ ] Vérifier webhooks reçus
- [ ] Build app production
- [ ] Upload vers App Store / Google Play
- [ ] Release progressive (10% → 100%)

**Post-Deployment:**
- [ ] Surveiller dashboards 24h
- [ ] Vérifier taux de succès > 95%
- [ ] Vérifier aucune erreur critique
- [ ] Collecter feedback utilisateurs
- [ ] Créer rapport de déploiement

### 10.3 Rollback Plan

**Si problème critique détecté:**

1. **Désactiver paiements côté app**
   ```dart
   // Feature flag dans Firebase Remote Config
   final paymentsEnabled = RemoteConfig.instance.getBool('payments_enabled');

   if (!paymentsEnabled) {
     // Cacher bouton "Payer"
     // Afficher message maintenance
   }
   ```

2. **Rollback Cloud Functions**
   ```bash
   # Lister les versions
   firebase functions:list

   # Rollback à version précédente
   firebase functions:rollback createNodaPayment
   firebase functions:rollback nodaWebhook
   ```

3. **Rollback App**
   - Retirer version de production (App Store / Google Play)
   - Ou pousser hotfix avec paiements désactivés

### 10.4 Monitoring Post-Déploiement

**Dashboards à surveiller:**

1. **Firebase Console**
   - Crashlytics : Aucun crash lié paiements
   - Performance : Temps réponse < 5s
   - Analytics : Taux conversion inscription→paiement

2. **Cloud Functions Dashboard**
   - Invocations par minute
   - Erreurs (< 5%)
   - Durée d'exécution (< 3s)

3. **Noda Dashboard**
   - Taux de succès paiements
   - Banques les plus utilisées
   - Montant total traité

**Métriques clés:**

| Métrique | Alerte si | Action |
|----------|-----------|--------|
| Taux d'erreur | > 5% | Investiguer logs |
| Temps réponse | > 10s | Vérifier Noda API |
| Webhooks manquants | > 1% | Vérifier configuration |
| Crashs app | > 0.1% | Hotfix urgent |

---

## 11. Coûts et ROI

### 11.1 Coûts de Développement

**Temps de développement:** 15 jours × 500€/jour = **7,500€**

**Breakdown:**
- Setup et configuration : 2 jours (1,000€)
- Développement backend : 3 jours (1,500€)
- Développement frontend : 5 jours (2,500€)
- Tests : 3 jours (1,500€)
- Déploiement : 2 jours (1,000€)

### 11.2 Coûts d'Infrastructure (mensuel)

**Firebase (pour 100 paiements/mois):**

| Service | Consommation | Coût |
|---------|--------------|------|
| Cloud Functions Invocations | 300 calls | Gratuit (free tier) |
| Cloud Functions Compute | 1000 GB-sec | Gratuit (free tier) |
| Firestore Reads | 1000 reads | Gratuit (free tier) |
| Firestore Writes | 500 writes | Gratuit (free tier) |
| **Total Firebase** | | **0€/mois** |

**Noda (pour 100 paiements × 45€):**

| Métrique | Valeur |
|----------|--------|
| Volume mensuel | 4,500€ |
| Frais Noda (0.5%) | 22.50€ |
| **Total Noda** | **22.50€/mois** |

**Total Infrastructure:** **~25€/mois**

### 11.3 Économies vs Carte Bancaire

**Comparaison 100 paiements de 45€:**

| Solution | Frais par transaction | Frais mensuels | Économie |
|----------|----------------------|----------------|----------|
| Carte bancaire (2.5%) | 1.13€ | 113€ | - |
| Noda Open Banking (0.5%) | 0.23€ | 23€ | **90€/mois** |

**Économie annuelle:** 90€ × 12 = **1,080€/an**

### 11.4 ROI

**Investissement initial:** 7,500€
**Économies annuelles:** 1,080€
**Coûts infrastructure:** 300€/an
**Économies nettes:** 780€/an

**Retour sur investissement:** 7,500€ ÷ 780€ = **9.6 ans**

**MAIS** si on compte les bénéfices indirects:
- Réduction charge administrative : 5h/mois × 30€/h × 12 = 1,800€/an
- Amélioration trésorerie (paiements instantanés) : ~500€/an
- Meilleure expérience utilisateur → Rétention : Inestimable

**ROI réel avec bénéfices indirects:** 7,500€ ÷ (780€ + 1,800€ + 500€) = **~2.4 ans**

---

## 12. Risques et Mitigation

### 12.1 Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| API Noda indisponible | Faible | Élevé | Retry logic + message utilisateur clair |
| Webhook non reçu | Moyen | Élevé | Polling backup + vérification manuelle |
| Timeout paiement | Moyen | Moyen | Timeout à 10min + possibilité retry |
| Double paiement | Faible | Élevé | Vérification côté serveur (already-exists) |
| App crash pendant paiement | Moyen | Faible | Webhook continue le processus |

### 12.2 Risques Métier

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Utilisateurs n'ont pas les banques | Faible | Moyen | 2000+ banques couvertes |
| Confusion UI paiement | Moyen | Moyen | Tests utilisateurs + onboarding |
| Frais cachés perçus | Faible | Faible | Communication transparente |
| Résistance au changement | Moyen | Faible | Formation admins + support |

### 12.3 Risques Réglementaires

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Non-conformité RGPD | Faible | Élevé | Audit RGPD + politique de confidentialité |
| Non-conformité PSD2 | Très Faible | Élevé | Noda est certifié FCA |
| Changement régulation | Faible | Moyen | Veille réglementaire + contrat Noda |

### 12.4 Plan de Contingence

**Scénario 1: Noda API down**
- Détection : Health check automatique
- Action immédiate : Désactiver bouton paiement
- Message utilisateur : "Service temporairement indisponible"
- Fallback : Paiement manuel + mise à jour manuelle

**Scénario 2: Webhooks en panne**
- Détection : Webhook non reçu après 5min
- Action : Polling API Noda toutes les 30s
- Backup : Vérification manuelle par admin
- Notification : Alerte équipe technique

**Scénario 3: Fraude détectée**
- Détection : Pattern suspect (même user, multiples paiements)
- Action : Bloquer utilisateur temporairement
- Investigation : Review logs
- Résolution : Débloquer si légitime, ban si fraude

---

## 13. Chronologie et Jalons

### 13.1 Planning Global

```
Semaine 1
├─ Lundi (J1): Setup Noda + Firebase Functions
├─ Mardi (J2): Test environnement local
├─ Mercredi (J3): Développement Cloud Function création paiement
├─ Jeudi (J4): Développement Cloud Function webhook
└─ Vendredi (J5): Tests backend + vérification statut

Semaine 2
├─ Lundi (J6): Modèles Flutter + PaymentService
├─ Mardi (J7): PaymentProvider + intégration main.dart
├─ Mercredi (J8): UI paiement dans operation_detail_screen
├─ Jeudi (J9): Finalisation UI + polish
└─ Vendredi (J10): Tests fonctionnels Flutter

Semaine 3
├─ Lundi (J11): Tests unitaires + intégration
├─ Mardi (J12): Tests E2E
├─ Mercredi (J13): UAT avec utilisateurs
├─ Jeudi (J14): Préparation production + déploiement
└─ Vendredi (J15): Monitoring + documentation finale
```

### 13.2 Jalons (Milestones)

**M1 - Fin Semaine 1 (J5):**
- ✅ Backend fonctionnel en sandbox
- ✅ Tests backend passent
- ✅ Webhook testé avec succès
- **Livrable:** Backend prêt pour intégration

**M2 - Fin Semaine 2 (J10):**
- ✅ Frontend intégré
- ✅ Flux paiement complet fonctionne
- ✅ Tests manuels passent
- **Livrable:** App fonctionnelle en dev

**M3 - Fin Semaine 3 (J15):**
- ✅ Tests automatisés passent
- ✅ UAT validé
- ✅ Production déployée
- **Livrable:** Feature en production

### 13.3 Checkpoints

**Checkpoint 1 (J3):**
- Review : Architecture backend validée ?
- Go/No-Go : Continuer développement

**Checkpoint 2 (J7):**
- Review : Architecture frontend validée ?
- Go/No-Go : Continuer développement UI

**Checkpoint 3 (J13):**
- Review : UAT satisfaisant ?
- Go/No-Go : Déployer en production

---

## 14. Ressources et Documentation

### 14.1 Documentation Noda

**Officielle:**
- 🌐 Site principal : https://noda.live/
- 📚 Developer Hub : https://docs.noda.live/
- 📖 API Reference : https://docs.noda.live/reference
- 📝 Articles : https://noda.live/docs
- 🎓 Open Banking Guide : https://noda.live/articles/open-banking-for-beginners

**Support:**
- 📧 Email : support@noda.live (supposé)
- 💬 Support via Noda Hub
- 📞 Contact commercial pour onboarding

### 14.2 Documentation Technique

**Firebase:**
- Cloud Functions : https://firebase.google.com/docs/functions
- Firestore : https://firebase.google.com/docs/firestore
- Authentication : https://firebase.google.com/docs/auth

**Flutter:**
- Cloud Functions Package : https://pub.dev/packages/cloud_functions
- URL Launcher : https://pub.dev/packages/url_launcher
- Provider : https://pub.dev/packages/provider

### 14.3 Outils de Développement

**Requis:**
- Node.js 18+ (pour Cloud Functions)
- Flutter 3.0+ (pour l'app)
- Firebase CLI
- Compte Noda (marchand)
- Compte Firebase (projet existant)

**Recommandés:**
- Postman (test API Noda)
- VS Code avec extensions Flutter
- Firebase Emulator Suite
- Git pour versioning

### 14.4 Formation Équipe

**Développeurs:**
- Formation Cloud Functions (2h)
- Formation API Noda (1h)
- Formation Provider pattern (1h)
- Code review des implémentations (2h)

**Administrateurs Club:**
- Formation utilisation interface paiement (30min)
- Formation vérification paiements (30min)
- Formation gestion erreurs (30min)
- Support utilisateurs (1h)

### 14.5 Documentation à Créer

**Technique:**
- [x] Ce document (NODA_INTEGRATION_PLAN.md)
- [ ] README.md backend (functions/README.md)
- [ ] API Documentation (fonctions exposées)
- [ ] Runbook (incidents et résolution)

**Utilisateur:**
- [ ] Guide paiement utilisateur
- [ ] FAQ paiements
- [ ] Guide admin (vérification paiements)
- [ ] Troubleshooting courant

---

## 15. Prochaines Étapes

### 15.1 Actions Immédiates

**Cette semaine:**
1. ✅ Lire ce document en entier
2. ⏳ Créer compte marchand Noda
3. ⏳ Obtenir credentials sandbox
4. ⏳ Valider architecture avec équipe
5. ⏳ Préparer environnement développement

**Semaine prochaine:**
1. ⏳ Démarrer Phase 1 (Setup)
2. ⏳ Initialiser Firebase Functions
3. ⏳ Premier test API Noda
4. ⏳ Setup émulateurs Firebase

### 15.2 Décisions à Prendre

**Avant de commencer:**
- [ ] Valider budget (7,500€ + 25€/mois)
- [ ] Approuver timeline (3 semaines)
- [ ] Choisir date de release
- [ ] Définir responsables (dev, QA, product owner)

**Pendant développement:**
- [ ] Valider design UI paiement
- [ ] Valider messages d'erreur
- [ ] Valider processus remboursement (V2 ?)

### 15.3 Questions Ouvertes

**À clarifier avec Noda:**
- ❓ Délai activation compte production ?
- ❓ Frais exact (négociation volume possible ?)
- ❓ SLA garantie disponibilité ?
- ❓ Process remboursement ?

**À clarifier en interne:**
- ❓ Qui gère support paiements ?
- ❓ Process remboursement manuel ?
- ❓ Faut-il envoyer facture/reçu par email ?
- ❓ Intégration comptabilité nécessaire ?

---

## 16. Conclusion

### 16.1 Récapitulatif

L'intégration de **Noda** dans CalyMob pour les paiements d'événements est une évolution naturelle de l'application qui apportera:

✅ **Valeur utilisateurs:**
- Paiement en ligne simple et sécurisé
- Confirmation instantanée
- Pas de manipulation d'espèces

✅ **Valeur club:**
- Automatisation des paiements
- Réduction charge administrative
- Économies frais transaction (80%)
- Trésorerie instantanée

✅ **Faisabilité technique:**
- Architecture simple et éprouvée
- Intégration avec stack existant
- Pas de breaking changes
- Rollback facile si besoin

### 16.2 Recommandation

**Je recommande de procéder à cette intégration** pour les raisons suivantes:

1. **ROI positif** : ~2.4 ans avec bénéfices indirects
2. **Risques maîtrisés** : Architecture robuste + plans de contingence
3. **Timeline réaliste** : 3 semaines est achievable
4. **Impact utilisateur** : Amélioration significative UX

### 16.3 Success Criteria

Le projet sera considéré réussi si:

- ✅ Taux de succès paiements > 95%
- ✅ Temps moyen paiement < 30 secondes
- ✅ 0 crash lié aux paiements
- ✅ Satisfaction utilisateurs > 4/5
- ✅ Économies frais transaction mesurables

---

**Document Version:** 1.0
**Dernière Mise à Jour:** 21 novembre 2025
**Statut:** ✅ Prêt pour Revue
**Prochaine Action:** Créer compte Noda + Valider budget

---

## Annexes

### Annexe A: Glossaire

- **Open Banking** : Système permettant aux tiers autorisés d'accéder aux données bancaires des clients via API
- **PSD2** : Directive européenne sur les services de paiement (Payment Services Directive 2)
- **SCA** : Strong Customer Authentication - Authentification forte requise pour paiements
- **Webhook** : Notification HTTP automatique envoyée par un serveur vers un endpoint
- **A2A** : Account-to-Account - Paiement direct de compte à compte
- **FCA** : Financial Conduct Authority - Régulateur financier britannique

### Annexe B: Liens Utiles

**Projet CalyMob:**
- GitHub : (lien privé)
- Firebase Console : (lien projet)
- Documentation : `docs/`

**Noda:**
- Dashboard : https://hub.noda.live/ (après création compte)
- Support : Via dashboard
- Status Page : (à confirmer)

**Outils:**
- Firebase Emulator UI : http://localhost:4000
- Cloud Functions Logs : Firebase Console > Functions

### Annexe C: Contact

**Questions sur ce document:**
- Email : (votre email)
- Slack : #calymob-dev (si applicable)

**Support Technique:**
- Firebase : Support Google Cloud
- Noda : support@noda.live
- Flutter : https://flutter.dev/community

---

**FIN DU DOCUMENT**
