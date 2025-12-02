# Plan: Notifications Push pour Messages d'Événements

## Objectif
Envoyer une notification push aux participants d'un événement quand un nouveau message est posté dans la discussion.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flutter App    │────>│  Firestore       │────>│  Cloud Function │
│  (Send message) │     │  (messages/...)  │     │  (Trigger)      │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          v
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flutter App    │<────│  FCM             │<────│  Send to FCM    │
│  (Receive push) │     │  (Push service)  │     │  (tokens)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Étapes d'implémentation

### 1. Configuration Firebase Cloud Messaging (FCM)

#### 1.1 Android
- [ ] Vérifier `google-services.json` présent dans `android/app/`
- [ ] Ajouter dépendance dans `android/app/build.gradle`:
  ```gradle
  implementation 'com.google.firebase:firebase-messaging'
  ```

#### 1.2 iOS
- [ ] Vérifier `GoogleService-Info.plist` présent dans `ios/Runner/`
- [ ] Activer Push Notifications capability dans Xcode
- [ ] Créer une clé APNs dans Apple Developer Console
- [ ] Uploader la clé APNs dans Firebase Console > Project Settings > Cloud Messaging

### 2. Flutter: Gestion des tokens FCM

#### 2.1 Dépendances
```yaml
# pubspec.yaml
dependencies:
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^18.0.0  # Pour notifications en foreground
```

#### 2.2 Service FCM (nouveau fichier)
```dart
// lib/services/fcm_service.dart
class FCMService {
  // Initialiser FCM
  Future<void> initialize();

  // Obtenir le token FCM
  Future<String?> getToken();

  // Sauvegarder le token dans Firestore
  Future<void> saveTokenToFirestore(String userId, String clubId);

  // Gérer les notifications reçues
  void setupMessageHandlers();
}
```

#### 2.3 Stockage des tokens
```
Firestore structure:
clubs/{clubId}/members/{userId}/
  - fcm_tokens: ["token1", "token2"]  // Un user peut avoir plusieurs devices
  - last_token_update: Timestamp
```

### 3. Cloud Function: Envoi des notifications

#### 3.1 Trigger Firestore
```javascript
// functions/src/notifications/onNewMessage.js
exports.onNewEventMessage = functions.firestore
  .document('clubs/{clubId}/operations/{operationId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const { clubId, operationId, messageId } = context.params;
    const message = snapshot.data();

    // 1. Récupérer les participants de l'événement
    // 2. Récupérer leurs tokens FCM
    // 3. Exclure l'expéditeur du message
    // 4. Envoyer notification via FCM
  });
```

#### 3.2 Structure de la notification
```javascript
const payload = {
  notification: {
    title: `${message.sender_name} - ${eventTitle}`,
    body: message.message.substring(0, 100),
  },
  data: {
    type: 'event_message',
    club_id: clubId,
    operation_id: operationId,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  },
};
```

### 4. Flutter: Réception et navigation

#### 4.1 Handlers de notification
```dart
// Quand l'app est en background et user tape sur notification
FirebaseMessaging.onMessageOpenedApp.listen((message) {
  if (message.data['type'] == 'event_message') {
    // Naviguer vers l'écran de détail de l'événement
    Navigator.pushNamed(context, '/event-detail', arguments: {
      'operationId': message.data['operation_id'],
    });
  }
});
```

---

## Fichiers à créer/modifier

### Nouveaux fichiers
| Fichier | Description |
|---------|-------------|
| `lib/services/fcm_service.dart` | Service gestion FCM côté Flutter |
| `functions/src/notifications/onNewMessage.js` | Cloud Function trigger |

### Fichiers à modifier
| Fichier | Modification |
|---------|--------------|
| `pubspec.yaml` | Ajouter `firebase_messaging`, `flutter_local_notifications` |
| `lib/main.dart` | Initialiser FCM au démarrage |
| `android/app/build.gradle` | Dépendance FCM |
| `ios/Runner/AppDelegate.swift` | Configuration APNs |
| `functions/index.js` | Exporter nouvelle fonction |

---

## Règles Firestore (déjà fait)
Les règles pour les messages sont déjà déployées:
```
match /messages/{messageId} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated() && hasValidSession(clubId);
  allow delete: if isAuthenticated() && hasValidSession(clubId) &&
    (resource.data.sender_id == request.auth.uid || isAdmin);
}
```

---

## Estimation effort

| Tâche | Complexité |
|-------|------------|
| Config FCM Android | Faible |
| Config FCM iOS (APNs) | Moyenne |
| Service FCM Flutter | Moyenne |
| Cloud Function | Moyenne |
| Tests & Debug | Moyenne |

---

## Considérations

### Limitations FCM
- iOS: Notifications silencieuses limitées
- Tokens expirent et doivent être rafraîchis
- Limite de 500 devices par envoi multicast

### Optimisations futures
- [ ] Ne pas notifier si l'app est au premier plan sur l'événement
- [ ] Préférences utilisateur (activer/désactiver notifications)
- [ ] Badge count sur icône app
- [ ] Sons personnalisés

---

## Prérequis avant de commencer
1. Compte Apple Developer (pour APNs key)
2. Accès Firebase Console
3. `firebase-tools` installé et connecté
