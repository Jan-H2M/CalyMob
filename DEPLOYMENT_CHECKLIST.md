# Checklist de déploiement - Système de paiement Noda

## ✅ Phase 1 : Vérification du code

### Flutter/Dart (Mobile App)

- [x] **Models créés** :
  - [x] [lib/models/tariff.dart](lib/models/tariff.dart)
  - [x] [lib/models/user_event_registration.dart](lib/models/user_event_registration.dart)
  - [x] [lib/models/payment_response.dart](lib/models/payment_response.dart)

- [x] **Models modifiés** :
  - [x] [lib/models/operation.dart](lib/models/operation.dart) - Ajout eventTariffs, lieuId
  - [x] [lib/models/participant_operation.dart](lib/models/participant_operation.dart) - Ajout payment fields

- [x] **Services** :
  - [x] [lib/services/operation_service.dart](lib/services/operation_service.dart) - Méthodes user registrations
  - [x] [lib/services/payment_service.dart](lib/services/payment_service.dart) - Cloud Functions calls

- [x] **Providers** :
  - [x] [lib/providers/operation_provider.dart](lib/providers/operation_provider.dart) - User events state
  - [x] [lib/providers/payment_provider.dart](lib/providers/payment_provider.dart) - Payment state & polling

- [x] **Utils** :
  - [x] [lib/utils/pricing_calculator.dart](lib/utils/pricing_calculator.dart) - Flexible pricing logic

- [x] **Screens** :
  - [x] [lib/screens/operations/my_events_screen.dart](lib/screens/operations/my_events_screen.dart) - Mes événements
  - [x] [lib/screens/operations/operation_detail_screen.dart](lib/screens/operations/operation_detail_screen.dart) - Payment section
  - [x] [lib/screens/home/home_screen.dart](lib/screens/home/home_screen.dart) - 3rd tab added

### Cloud Functions (Backend)

- [x] **Configuration** :
  - [x] [functions/package.json](functions/package.json) - Dependencies
  - [x] [functions/index.js](functions/index.js) - Entry point
  - [x] [functions/.env.example](functions/.env.example) - Template

- [x] **Utils** :
  - [x] [functions/src/utils/noda-client.js](functions/src/utils/noda-client.js) - Noda API client

- [x] **Payment Functions** :
  - [x] [functions/src/payment/createPayment.js](functions/src/payment/createPayment.js) - Create payment
  - [x] [functions/src/payment/webhook.js](functions/src/payment/webhook.js) - Receive notifications
  - [x] [functions/src/payment/checkStatus.js](functions/src/payment/checkStatus.js) - Check status

### Documentation

- [x] [functions/CONFIGURATION.md](functions/CONFIGURATION.md) - Setup guide
- [x] [TESTING_GUIDE.md](TESTING_GUIDE.md) - Complete test scenarios
- [x] [PAYMENT_IMPLEMENTATION_SUMMARY.md](PAYMENT_IMPLEMENTATION_SUMMARY.md) - Full summary
- [x] [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - This file

## 🔧 Phase 2 : Configuration locale

### Flutter App

```bash
# 1. Installer les dépendances
cd /Users/jan/Documents/GitHub/CalyMob
flutter pub get

# 2. Vérifier la compilation
flutter analyze

# 3. Build (optionnel - test local)
flutter build ios --debug
```

- [ ] `flutter pub get` exécuté sans erreur
- [ ] `flutter analyze` sans erreurs critiques
- [ ] App compile sur iOS/Android

### Cloud Functions

```bash
# 1. Installer les dépendances
cd /Users/jan/Documents/GitHub/CalyMob/functions
npm install

# 2. Créer le fichier .env
cp .env.example .env
# Éditer .env avec les credentials Noda sandbox

# 3. Linter/test
npm run lint  # Si configuré
```

- [ ] `npm install` terminé sans erreur
- [ ] `.env` créé avec credentials Noda sandbox
- [ ] Pas d'erreurs de linting

## 🌐 Phase 3 : Configuration Firebase

### Firebase Functions Config

```bash
# Se connecter
firebase login

# Vérifier le projet
firebase projects:list
firebase use YOUR_PROJECT_ID

# Configurer les variables Noda (SANDBOX d'abord)
firebase functions:config:set \
  noda.api_key="YOUR_NODA_SANDBOX_KEY" \
  noda.api_secret="YOUR_NODA_SANDBOX_SECRET" \
  noda.base_url="https://sandbox.noda.live" \
  noda.webhook_secret="YOUR_WEBHOOK_SECRET"

# Vérifier
firebase functions:config:get
```

- [ ] Firebase CLI installé (`npm install -g firebase-tools`)
- [ ] Connecté avec `firebase login`
- [ ] Projet sélectionné
- [ ] Variables d'environnement configurées
- [ ] Vérification avec `firebase functions:config:get`

### Firebase Plan

- [ ] Plan **Blaze** activé (requis pour Cloud Functions externes)
- [ ] Facturation configurée
- [ ] Alertes de budget définies

## 🚀 Phase 4 : Déploiement (Sandbox)

### Déployer les Cloud Functions

```bash
cd /Users/jan/Documents/GitHub/CalyMob

# Déployer toutes les fonctions
firebase deploy --only functions

# Attendre la fin du déploiement...
# ✔ functions[createNodaPayment]: Successful
# ✔ functions[nodaWebhook]: Successful
# ✔ functions[checkNodaPaymentStatus]: Successful
```

- [ ] Déploiement réussi sans erreur
- [ ] 3 fonctions déployées : createNodaPayment, nodaWebhook, checkNodaPaymentStatus
- [ ] URLs des fonctions récupérées

### Récupérer les URLs

```bash
# Les URLs sont affichées après le déploiement
# Exemple :
# https://us-central1-YOUR_PROJECT.cloudfunctions.net/createNodaPayment
# https://us-central1-YOUR_PROJECT.cloudfunctions.net/nodaWebhook
# https://us-central1-YOUR_PROJECT.cloudfunctions.net/checkNodaPaymentStatus
```

- [ ] URL du webhook notée : `_______________________________________`

### Configurer le webhook dans Noda

1. Aller sur https://sandbox.noda.live (ou dashboard Noda)
2. Settings → Webhooks
3. Ajouter l'URL du webhook
4. Sélectionner les événements :
   - [x] `payment.completed`
   - [x] `payment.failed`
   - [x] `payment.cancelled`
   - [x] `payment.expired`
5. Enregistrer

- [ ] Webhook configuré dans le dashboard Noda
- [ ] Événements sélectionnés
- [ ] Secret webhook récupéré et ajouté à Firebase Config

## 🧪 Phase 5 : Tests

### Test 1 : Créer un événement dans CalyCompta

Dans l'interface web CalyCompta :

1. Créer un événement test :
   - Titre : "Test Paiement Noda"
   - Type : Événement
   - Date : Future
   - Statut : **Ouvert**

2. Configurer les tarifs :
   ```json
   event_tariffs: [
     {
       "id": "t1",
       "label": "Membre",
       "category": "membre",
       "price": 1.0,
       "is_default": true,
       "display_order": 1
     }
   ]
   ```

- [ ] Événement test créé dans CalyCompta
- [ ] Tarifs configurés (prix test : 1€)
- [ ] ID de l'événement noté : `_______________________________________`

### Test 2 : S'inscrire depuis CalyMob

Dans l'app Flutter :

1. Se connecter avec un compte test
2. Tab "Événements"
3. Sélectionner "Test Paiement Noda"
4. Vérifier le prix affiché (doit être 1€)
5. Cliquer sur "S'inscrire"
6. Confirmer

- [ ] Inscription réussie
- [ ] Visible dans "Mes événements"
- [ ] Badge "À payer" affiché
- [ ] Prix correct (1€)

### Test 3 : Payer depuis CalyMob

1. Tab "Mes événements"
2. Cliquer sur l'événement test
3. Cliquer sur "Payer (1€)"
4. Confirmer le paiement
5. La page Noda s'ouvre dans le navigateur

- [ ] Dialog de confirmation s'affiche
- [ ] Dialog de chargement s'affiche
- [ ] Navigateur s'ouvre avec l'URL Noda
- [ ] Page de paiement Noda affiche 1.00 EUR

### Test 4 : Compléter le paiement Noda

Sur la page Noda (sandbox) :

1. Sélectionner une banque test
2. Confirmer le paiement (utiliser les credentials de test Noda)
3. Attendre la redirection

- [ ] Banque test disponible
- [ ] Paiement validé sans erreur
- [ ] Redirection vers success_url

### Test 5 : Vérifier la confirmation

Dans l'app CalyMob :

1. Le polling doit détecter le changement
2. Badge passe de "À payer" à "Payé" (vert)
3. Message de succès s'affiche
4. Bouton "Payer" disparaît

- [ ] Badge "Payé" affiché (vert)
- [ ] Message de succès visible
- [ ] Bouton "Payer" masqué

Dans Firebase Console :

1. Firestore → `operation_participants`
2. Trouver l'inscription test
3. Vérifier les champs :
   - `paye = true`
   - `payment_status = "completed"`
   - `payment_id` présent
   - `date_paiement` présent

- [ ] `paye = true` dans Firestore
- [ ] `payment_status = "completed"`
- [ ] `payment_id` présent
- [ ] `date_paiement` présent

### Test 6 : Vérifier les logs

```bash
# Logs Cloud Functions
firebase functions:log

# Filtrer par fonction
firebase functions:log --only createNodaPayment
firebase functions:log --only nodaWebhook
```

- [ ] Logs `createNodaPayment` : "✅ Paiement Noda créé"
- [ ] Logs `nodaWebhook` : "✅ Paiement confirmé"
- [ ] Aucune erreur dans les logs

### Test 7 : Vérifier payment_logs

Dans Firestore → `payment_logs` :

- [ ] Log créé avec le payment_id
- [ ] Statut = "completed"
- [ ] Montant = 1.0
- [ ] Timestamp présent
- [ ] raw_payload contient les données du webhook

### Test 8 : Tests d'erreurs

Tester les scénarios d'erreur :

1. **Double paiement** :
   - Réessayer de payer l'inscription déjà payée
   - Doit afficher : "Paiement déjà effectué"

2. **Paiement annulé** :
   - Créer une nouvelle inscription
   - Initier le paiement
   - Annuler sur la page Noda
   - Badge doit passer à "Échec" (rouge)

3. **Montant invalide** (modifier temporairement le code) :
   - Mettre `amount = 15000`
   - Doit refuser : "Le montant doit être entre 0 et 10000 euros"

- [ ] Test double paiement : Erreur affichée correctement
- [ ] Test annulation : Badge "Échec" affiché
- [ ] Test montant invalide : Erreur de validation

## 📊 Phase 6 : Monitoring (post-déploiement)

### Firebase Console

Surveiller pendant 1 semaine :

1. **Functions** → Statistics :
   - Invocations
   - Erreurs (doit être < 1%)
   - Durée d'exécution

2. **Firestore** → Usage :
   - Nombre de reads/writes
   - Coûts

3. **Authentication** → Users :
   - Utilisateurs actifs

- [ ] Dashboard Firebase vérifié quotidiennement
- [ ] Aucune erreur critique (< 1%)
- [ ] Temps de réponse < 3s

### Noda Dashboard

https://dashboard.noda.live

- [ ] Paiements visibles dans le dashboard
- [ ] Statuts corrects
- [ ] Webhooks reçus (vérifier les logs Noda)
- [ ] Aucun webhook échoué

## 🎯 Phase 7 : Production

### ⚠️ Avant de passer en production

**Checklist critique** :

- [ ] **Tous les tests en sandbox passés**
- [ ] **Aucune erreur critique pendant 1 semaine de sandbox**
- [ ] **Compte Noda production créé et validé**
- [ ] **Variables d'environnement production configurées**
- [ ] **Plan de rollback préparé**
- [ ] **Support utilisateur prêt**

### Configuration Production

```bash
# ATTENTION : Ces commandes sont pour la PRODUCTION !
# Ne les exécuter qu'après validation complète en sandbox

# 1. Reconfigurer avec les credentials PRODUCTION
firebase functions:config:set \
  noda.api_key="YOUR_NODA_PRODUCTION_KEY" \
  noda.api_secret="YOUR_NODA_PRODUCTION_SECRET" \
  noda.base_url="https://api.noda.live" \
  noda.webhook_secret="YOUR_PRODUCTION_WEBHOOK_SECRET"

# 2. Redéployer
firebase deploy --only functions

# 3. Reconfigurer le webhook dans Noda PRODUCTION
# URL: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/nodaWebhook
```

- [ ] Credentials production configurés
- [ ] Fonctions redéployées avec config production
- [ ] Webhook production configuré dans Noda
- [ ] Test de paiement réel avec 1€

### Déploiement progressif

1. **Beta (Semaine 1)** :
   - Activer pour 10 utilisateurs beta
   - Annoncer dans le club
   - Monitorer quotidiennement

2. **Soft launch (Semaines 2-3)** :
   - Activer pour 50% des utilisateurs
   - Annoncer la fonctionnalité officiellement
   - Recueillir les feedbacks

3. **Production complète (Semaine 4+)** :
   - Activer pour 100% des utilisateurs
   - Désactiver l'ancien système de paiement
   - Célébrer ! 🎉

- [ ] Phase Beta terminée (10 users, 1 semaine)
- [ ] Soft launch terminé (50%, 2 semaines)
- [ ] Production complète (100%)

## 📞 Support et communication

### Documentation utilisateur

Créer un guide utilisateur :

- [ ] **Comment s'inscrire à un événement**
- [ ] **Comment payer en ligne**
- [ ] **Que faire si le paiement échoue**
- [ ] **Sécurité des paiements (PSD2, etc.)**

### Support technique

Préparer :

- [ ] **FAQ** pour les questions courantes
- [ ] **Procédure de remboursement** (si applicable)
- [ ] **Contact support** (email, téléphone)
- [ ] **Temps de réponse** défini (ex: 24h)

### Communication

Annoncer :

- [ ] **Email aux membres** avec guide d'utilisation
- [ ] **Post sur le site web** du club
- [ ] **Démo lors d'une réunion** (optionnel)

## 🎉 Statut final

### Sandbox
- [ ] ✅ **Tous les tests passés**
- [ ] ✅ **Aucune erreur critique**
- [ ] ✅ **Prêt pour la production**

### Production
- [ ] ✅ **Déployé en production**
- [ ] ✅ **Utilisateurs actifs**
- [ ] ✅ **Paiements fonctionnels**
- [ ] 🎊 **Succès !**

---

**Date de début** : _______________________
**Date de fin sandbox** : _______________________
**Date de fin production** : _______________________

**Responsable** : _______________________
**Validé par** : _______________________
