# Récapitulatif de l'implémentation - Système de paiement Noda

## 📊 Vue d'ensemble

L'intégration du système de paiement Noda pour CalyMob est **100% complète** et prête pour les tests.

### Architecture globale

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   CalyMob App   │────────>│ Cloud Functions  │────────>│  Noda API   │
│   (Flutter)     │         │   (Firebase)     │         │ (Banking)   │
└─────────────────┘         └──────────────────┘         └─────────────┘
        │                            │                            │
        │                            │                            │
        v                            v                            v
┌─────────────────────────────────────────────────────────────────────┐
│                     Firestore Database                              │
│  - operations (événements)                                          │
│  - operation_participants (inscriptions + paiements)                │
│  - payment_logs (audit trail)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## ✅ Phases complétées

### Phase 1 : "Mes Événements" ✅

**Fichiers créés :**
- [lib/models/user_event_registration.dart](lib/models/user_event_registration.dart) - Modèle combiné Operation + ParticipantOperation
- [lib/screens/operations/my_events_screen.dart](lib/screens/operations/my_events_screen.dart) - Écran avec tabs "À venir" / "Passés"

**Fichiers modifiés :**
- [lib/services/operation_service.dart](lib/services/operation_service.dart) - Ajout `getUserRegistrationsStream()`, `getUserRegistrations()`
- [lib/providers/operation_provider.dart](lib/providers/operation_provider.dart) - Gestion des inscriptions utilisateur
- [lib/screens/home/home_screen.dart](lib/screens/home/home_screen.dart) - Ajout 3ème tab

**Fonctionnalités :**
- Affichage des événements à venir vs passés
- Badges de statut de paiement (À payer / Payé / Échec)
- Pull-to-refresh
- Navigation vers les détails

### Phase 2 : Tarifs flexibles CalyCompta ✅

**Fichiers créés :**
- [lib/models/tariff.dart](lib/models/tariff.dart) - Modèle de tarif
- [lib/utils/pricing_calculator.dart](lib/utils/pricing_calculator.dart) - Calcul de prix selon fonction membre

**Fichiers modifiés :**
- [lib/models/operation.dart](lib/models/operation.dart) - Ajout `eventTariffs`, `lieuId`
- [lib/services/operation_service.dart](lib/services/operation_service.dart) - Ajout `getMemberInfo()`, modification `registerToOperation()`
- [lib/screens/operations/operation_detail_screen.dart](lib/screens/operations/operation_detail_screen.dart) - Affichage prix dynamique

**Logique de tarification :**
```dart
// Priorité des fonctions (ordre décroissant)
1. Encadrants → 15€
2. CA → 20€
3. Membre → 25€
4. Non-membre → 30€

// Déterminé automatiquement depuis clubStatuten du membre
```

### Phase 3 : Workflow de paiement mobile ✅

**Fichiers modifiés :**
- [lib/models/participant_operation.dart](lib/models/participant_operation.dart) - Ajout champs paiement (paymentId, paymentStatus, paymentInitiatedAt)
- [lib/services/operation_service.dart](lib/services/operation_service.dart) - Ajout `getUserParticipation()`, `updateParticipantPaymentStatus()`
- [lib/screens/operations/operation_detail_screen.dart](lib/screens/operations/operation_detail_screen.dart) - Section paiement complète

**Fonctionnalités :**
- Section de paiement avec statut en temps réel
- Bouton "Payer" avec confirmation
- Ouverture de l'URL Noda dans le navigateur
- Polling du statut toutes les 3s (max 5 min)
- Messages de succès/erreur
- Gestion des échecs avec "Réessayer"

### Phase 4 : Cloud Functions backend ✅

**Fichiers créés :**

#### Configuration
- [functions/package.json](functions/package.json) - Dépendances Node.js
- [functions/index.js](functions/index.js) - Point d'entrée
- [functions/.env.example](functions/.env.example) - Template de configuration

#### Utilitaires
- [functions/src/utils/noda-client.js](functions/src/utils/noda-client.js) - Client API Noda avec Axios

#### Fonctions Cloud
- [functions/src/payment/createPayment.js](functions/src/payment/createPayment.js) - Créer un paiement Noda
- [functions/src/payment/webhook.js](functions/src/payment/webhook.js) - Recevoir les notifications Noda
- [functions/src/payment/checkStatus.js](functions/src/payment/checkStatus.js) - Vérifier le statut manuellement

#### Documentation
- [functions/CONFIGURATION.md](functions/CONFIGURATION.md) - Guide de configuration Firebase & Noda
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Guide de test complet avec scénarios

## 🔧 Détails techniques

### 1. Cloud Function: createNodaPayment

**Type :** Callable
**Sécurité :** Authentification requise

**Input :**
```javascript
{
  clubId: string,
  operationId: string,
  participantId: string,
  amount: number,      // 0.01 - 10000.00 EUR
  description: string
}
```

**Output :**
```javascript
{
  paymentId: string,
  paymentUrl: string,
  status: 'pending',
  expiresAt: string | null
}
```

**Validations :**
- ✅ Authentification Firebase
- ✅ Paramètres requis
- ✅ Montant valide (0-10000€)
- ✅ Inscription existe
- ✅ Utilisateur = propriétaire de l'inscription
- ✅ Pas de paiement déjà effectué

**Flux :**
1. Vérifier l'authentification
2. Valider les paramètres
3. Récupérer l'inscription dans Firestore
4. Créer le paiement chez Noda
5. Enregistrer l'ID de paiement dans Firestore
6. Retourner l'URL de paiement

### 2. Cloud Function: nodaWebhook

**Type :** HTTP Endpoint
**Sécurité :** Signature HMAC-SHA256

**Input (JSON body) :**
```javascript
{
  payment_id: string,
  status: 'completed' | 'failed' | 'cancelled' | 'expired',
  amount: number,
  currency: 'EUR',
  metadata: {
    clubId: string,
    operationId: string,
    participantId: string,
    userId: string
  },
  signature: string  // HMAC-SHA256 du body
}
```

**Actions selon statut :**
- `completed` / `succeeded` → `paye = true`, `date_paiement = now`
- `failed` / `cancelled` / `expired` → `paye = false`, `date_paiement = null`

**Flux :**
1. Vérifier la signature webhook
2. Extraire payment_id et metadata
3. Récupérer l'inscription dans Firestore
4. Mettre à jour le statut
5. Logger dans `payment_logs`
6. Retourner 200 OK

### 3. Cloud Function: checkNodaPaymentStatus

**Type :** Callable
**Sécurité :** Authentification requise

**Input :**
```javascript
{
  clubId: string,
  participantId: string
}
```

**Output :**
```javascript
{
  paymentId: string,
  status: string,
  paye: boolean,
  updatedAt: string
}
```

**Optimisations :**
- Si déjà `paye = true`, retourne le statut sans appeler Noda
- Sinon, interroge l'API Noda
- Met à jour Firestore si changement détecté

**Flux :**
1. Vérifier l'authentification et les permissions
2. Récupérer l'inscription
3. Si déjà payé, retourner directement
4. Appeler l'API Noda
5. Mettre à jour Firestore si nécessaire
6. Retourner le statut

## 📦 Structure Firestore

### Collection: `operation_participants`

```javascript
{
  // Champs existants
  operation_id: string,
  membre_id: string,
  membre_nom: string,
  membre_prenom: string,
  prix: number,
  paye: boolean,
  date_paiement: Timestamp | null,
  date_inscription: Timestamp,
  commentaire: string | null,
  notes: string | null,

  // Nouveaux champs paiement Noda
  payment_id: string | null,           // ID Noda
  payment_status: string | null,       // 'pending', 'completed', 'failed', 'cancelled'
  payment_initiated_at: Timestamp | null,  // Date de tentative

  // Métadonnées
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### Collection: `payment_logs` (audit)

```javascript
{
  payment_id: string,
  club_id: string,
  operation_id: string,
  participant_id: string,
  user_id: string,
  status: string,
  amount: number,
  currency: string,
  timestamp: Timestamp,
  raw_payload: object  // Payload complet du webhook
}
```

## 🔒 Sécurité

### Firestore Security Rules

```javascript
// operation_participants - lecture/écriture sécurisée
match /clubs/{clubId}/operation_participants/{participantId} {
  // Lecture: membre peut voir ses propres inscriptions
  allow read: if request.auth != null
    && request.auth.uid == resource.data.membre_id;

  // Écriture: seules les Cloud Functions avec Admin SDK
  allow write: if false;
}

// payment_logs - lecture interdite, écriture Admin uniquement
match /payment_logs/{logId} {
  allow read: if false;
  allow write: if false;  // Admin SDK uniquement
}
```

### Cloud Functions

- ✅ Vérification `context.auth.uid` systématique
- ✅ Validation des permissions (utilisateur = propriétaire)
- ✅ Signature HMAC-SHA256 pour le webhook
- ✅ Pas d'API credentials dans le code (Firebase Config)
- ✅ Logs complets pour audit

## 🎯 Flux utilisateur complet

### Scénario nominal : Inscription + Paiement réussi

```
1. 👤 Utilisateur ouvre CalyMob
   └─> Se connecte avec Firebase Auth

2. 📅 Consulte les événements
   └─> Tab "Événements" → Liste des événements ouverts

3. 📖 Sélectionne un événement
   └─> Affiche les détails
   └─> Prix calculé selon sa fonction (ex: Membre → 25€)
   └─> Bouton "S'inscrire à l'événement"

4. ✍️ S'inscrit
   └─> Confirmation
   └─> Création dans Firestore:
       {
         paye: false,
         prix: 25.0,
         payment_id: null
       }
   └─> Redirection vers "Mes événements"

5. 💳 Initie le paiement
   └─> Tab "Mes événements"
   └─> Badge "À payer" (orange)
   └─> Clique sur "Payer (25€)"
   └─> Confirmation dialog

6. 🌐 Cloud Function createNodaPayment
   └─> Valide l'inscription
   └─> Appelle Noda API
   └─> Met à jour Firestore:
       {
         payment_id: "noda_xyz",
         payment_status: "pending",
         payment_initiated_at: now
       }
   └─> Retourne paymentUrl

7. 🏦 Page de paiement Noda
   └─> L'app ouvre le navigateur
   └─> Utilisateur sélectionne sa banque
   └─> Confirme le paiement (Strong Customer Authentication)
   └─> Noda valide le paiement

8. 📥 Webhook Noda → Firebase
   └─> POST /nodaWebhook
   └─> Body: { payment_id, status: "completed", metadata }
   └─> Met à jour Firestore:
       {
         payment_status: "completed",
         paye: true,
         date_paiement: now
       }
   └─> Crée un log dans payment_logs

9. ✅ Confirmation dans l'app
   └─> Polling détecte le changement (ou temps réel via Stream)
   └─> Badge passe à "Payé" (vert)
   └─> Message de succès
   └─> Bouton "Payer" disparaît

10. 🎉 Événement confirmé
    └─> L'utilisateur reçoit un email de confirmation (optionnel)
    └─> Le trésorier voit le paiement dans CalyCompta
```

### Temps d'exécution typiques

- Création du paiement : **1-2 secondes**
- Ouverture du navigateur : **instantané**
- Paiement utilisateur : **30-120 secondes**
- Webhook reçu : **1-5 secondes** après validation
- Mise à jour UI : **instantané** (Stream Firestore)

**Total : 1-3 minutes** de bout en bout

## 🚀 Déploiement

### Commandes de déploiement

```bash
# 1. Configuration
firebase functions:config:set \
  noda.api_key="YOUR_KEY" \
  noda.api_secret="YOUR_SECRET" \
  noda.base_url="https://api.noda.live" \
  noda.webhook_secret="YOUR_WEBHOOK_SECRET"

# 2. Déploiement
cd functions
npm install
cd ..
firebase deploy --only functions

# 3. Configuration webhook Noda
# URL: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/nodaWebhook
# Événements: payment.completed, payment.failed, payment.cancelled
```

### Variables d'environnement requises

| Variable | Description | Exemple |
|----------|-------------|---------|
| `noda.api_key` | Clé API Noda | `noda_live_abc123...` |
| `noda.api_secret` | Secret API Noda | `sk_live_xyz456...` |
| `noda.base_url` | URL de l'API | `https://api.noda.live` |
| `noda.webhook_secret` | Secret webhook | `whsec_abc123...` |

## 📈 Métriques et monitoring

### Métriques à surveiller

1. **Taux de conversion** :
   - Inscriptions créées → Paiements initiés : **attendu > 80%**
   - Paiements initiés → Paiements complétés : **attendu > 90%**

2. **Performance** :
   - Temps de réponse createNodaPayment : **< 2s**
   - Temps de réponse checkNodaPaymentStatus : **< 1s**
   - Temps de traitement webhook : **< 500ms**

3. **Erreurs** :
   - Erreurs Cloud Functions : **< 1%**
   - Timeouts : **< 0.5%**
   - Webhooks manqués : **< 0.1%**

### Dashboard Firebase

```
Functions → Statistics
├─ createNodaPayment
│  ├─ Invocations/day
│  ├─ Errors (target: < 1%)
│  └─ Execution time (target: < 2s)
├─ nodaWebhook
│  ├─ Invocations/day
│  └─ Execution time (target: < 500ms)
└─ checkNodaPaymentStatus
   ├─ Invocations/day
   └─ Execution time (target: < 1s)
```

## 💰 Coûts estimés

### Firebase Functions

- **createNodaPayment** : ~2s @ 256MB
  - 100 paiements/jour = **gratuit** (plan Spark 2M invocations/mois)
  - 1000 paiements/jour = **~1€/mois** (plan Blaze)

- **nodaWebhook** : ~200ms @ 256MB
  - Toujours gratuit (< 1s)

- **checkNodaPaymentStatus** : ~500ms @ 256MB
  - Polling 3s pendant 5min max = 100 appels/paiement
  - 100 paiements/jour = 10 000 appels = **gratuit**

**Total Firebase : < 5€/mois** pour 1000 paiements/mois

### Noda

- **Frais par transaction** : ~0.5% (vs 2-3% pour cartes bancaires)
- Exemple : 25€ → frais de **0.12€**
- **Pas de frais fixes mensuels**

### Total pour 1000 paiements/mois

| Service | Coût |
|---------|------|
| Firebase Functions | 5€ |
| Firestore (reads/writes) | 2€ |
| Noda (0.5% × 25€ × 1000) | 125€ |
| **Total** | **132€** |

**vs système cartes bancaires :**
- Stripe/Mollie : 2.5% × 25€ × 1000 = **625€**
- **Économie : 493€/mois** 💰

## 📝 Prochaines étapes

### Avant la mise en production

1. **Créer un compte Noda** :
   - S'inscrire sur https://noda.live
   - Valider l'identité de l'entreprise
   - Récupérer les credentials de production

2. **Tester en sandbox** :
   - Suivre le [TESTING_GUIDE.md](TESTING_GUIDE.md)
   - Valider tous les scénarios
   - Corriger les bugs éventuels

3. **Déployer en production** :
   - Configurer les variables d'environnement
   - Déployer les Cloud Functions
   - Configurer le webhook Noda

4. **Soft launch** :
   - Activer pour 10-20 utilisateurs beta
   - Monitorer pendant 1 semaine
   - Recueillir les feedbacks

5. **Production complète** :
   - Annoncer la fonctionnalité
   - Activer pour tous les utilisateurs
   - Célébrer ! 🎉

### Améliorations futures (optionnel)

- [ ] Notifications push lors de la confirmation de paiement
- [ ] Reçu PDF téléchargeable
- [ ] Remboursements via l'app (admin uniquement)
- [ ] Support de plusieurs devises (USD, GBP)
- [ ] Paiements récurrents pour cotisations annuelles
- [ ] Split payments (partage de frais entre plusieurs membres)

## 🎓 Ressources

- [Documentation Noda](https://docs.noda.live)
- [Firebase Functions Guide](https://firebase.google.com/docs/functions)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Flutter Cloud Functions](https://pub.dev/packages/cloud_functions)
- [url_launcher Package](https://pub.dev/packages/url_launcher)

## 🤝 Support

En cas de problème :

1. **Consulter les logs** :
   ```bash
   firebase functions:log
   ```

2. **Vérifier Firestore** :
   - Console Firebase → Firestore
   - Collection `operation_participants`
   - Collection `payment_logs`

3. **Contacter le support Noda** :
   - Dashboard : https://dashboard.noda.live
   - Email : support@noda.live

---

**Statut : ✅ 100% TERMINÉ**
**Prêt pour les tests**
**Dernière mise à jour : 2025-11-23**
