# Plan de Refactoring des Notifications Push

**Date**: 2026-03-21
**Auteur**: Jan / Claude
**Statut**: Planifié
**Feedback utilisateur**: _"On reçoit trop de notifications. On devrait en recevoir : quand on est assigné à une tâche en piscine, quand une nouvelle sortie extérieure est proposée, et si on participe à un événement les discussions de cet event."_

---

## Contexte

Le système de notifications actuel envoie trop de push notifications. 10 Cloud Functions déclenchent des notifications, dont plusieurs envoient à **tous les membres du club** au lieu de cibler les personnes concernées. Ce document décrit le plan complet pour rendre les notifications pertinentes et ciblées.

## Analyse de l'état actuel

### Cloud Functions existantes (notifications/)

| Fonction | Trigger Firestore | Destinataires actuels | Problème |
|---|---|---|---|
| `onNewEventMessage` | `operations/{id}/messages/{id}` | **TOUS** les membres (`app_installed=true`) | Tout le monde reçoit tous les messages de tous les événements |
| `onNewAnnouncement` | `announcements/{id}` | **TOUS** les membres | Acceptable mais contribue au bruit |
| `onNewAnnouncementReply` | `announcements/{id}/replies/{id}` | **TOUS** les membres | Très bruyant — chaque réponse va à tout le monde |
| `onNewTeamMessage` | `team_channels/{id}/messages/{id}` | Membres avec rôle correspondant (`clubStatuten`) | OK — déjà ciblé |
| `onNewSessionMessage` | `piscine_sessions/{id}/messages/{id}` | Participants par `group_type` | OK — déjà ciblé |
| `sessionReminder` | Cron quotidien 09:00 CET | Participants aux sessions du lendemain | OK |
| `onMedicalCertStatusChange` | `members/{id}/medical_certificates/{id}` | Le membre concerné uniquement | OK — personnel |
| `onEventStatusChange` | `operations/{id}` (update) | Nettoyage des compteurs unread | OK — pas de push |
| `onExpenseCreated` | `demandes_remboursement/{id}` | Email uniquement | OK |
| `onExpenseStatusChange` | `demandes_remboursement/{id}` (update) | Email uniquement | OK |

### Ce que l'utilisateur veut

1. Notification quand **assigné à une tâche en piscine** (accueil, gonflage, encadrant)
2. Notification quand une **nouvelle sortie extérieure** est proposée
3. Notifications des **discussions d'un événement** uniquement si **inscrit comme participant**

---

## Plan d'implémentation

### Phase 1 (P1) — Impact maximal, effort minimal

#### 1.1 Corriger `onNewEventMessage.js` — Participants uniquement

**Fichier**: `functions/src/notifications/onNewEventMessage.js`
**Changement**: Au lieu de requêter tous les membres, requêter la sous-collection `inscriptions/` de l'événement.

**Avant** (lignes 63-68):
```javascript
// ACTUEL - envoie à TOUS les membres
const membersSnapshot = await admin.firestore()
  .collection('clubs').doc(clubId)
  .collection('members')
  .where('app_installed', '==', true)
  .get();
```

**Après**:
```javascript
// NOUVEAU - seulement les participants inscrits
const inscriptionsSnapshot = await admin.firestore()
  .collection('clubs').doc(clubId)
  .collection('operations').doc(operationId)
  .collection('inscriptions')
  .get();

if (inscriptionsSnapshot.empty) {
  console.log('No inscriptions found, skipping notification');
  return null;
}

// Collecter les membre_id des participants
const participantIds = new Set();
inscriptionsSnapshot.docs.forEach(doc => {
  const data = doc.data();
  const membreId = data.membre_id;
  if (membreId) participantIds.add(membreId);
});

// Ensuite fetcher seulement ces membres pour leurs tokens FCM
const membersSnapshot = await admin.firestore()
  .collection('clubs').doc(clubId)
  .collection('members')
  .where('app_installed', '==', true)
  .get();

// Filtrer pour ne garder que les participants
const memberDocs = membersSnapshot.docs.filter(doc => participantIds.has(doc.id));
```

**Note**: On ne peut pas faire de `where('__name__', 'in', [...])` avec plus de 30 IDs dans Firestore, donc on filtre côté serveur après le fetch. Si le club est petit (<100 membres), c'est efficace. Si le club grandit, on pourra optimiser avec des batches de 30 IDs via `where('__name__', 'in', batch)`.

**Points d'attention**:
- Le `senderId` (expéditeur du message) est déjà exclu par `collectTokensAndMembers()`
- Les `unread_counts` ne seront incrémentés que pour les participants
- Le badge APNs sera correct car basé sur les compteurs individuels

#### 1.2 Créer `onNewOperation.js` — Nouvelle sortie extérieure

**Fichier**: `functions/src/notifications/onNewOperation.js` (NOUVEAU)
**Trigger**: `clubs/{clubId}/operations/{operationId}` — `onDocumentCreated`

**Logique**:
1. Lire le document de l'opération créée
2. Vérifier le champ `event_category` (Firestore) :
   - `'plongee'` = sortie plongée extérieure → notifier
   - `'sortie'` = autre sortie → notifier
   - Tout autre type (cotisation, don, etc.) → ignorer
3. Vérifier que le `type` est `'evenement'` (pas 'cotisation', 'don', etc.)
4. Envoyer une notification à tous les membres avec `app_installed=true`

**Payload**:
```javascript
const basePayload = {
  notification: {
    title: `🤿 Nouvelle sortie : ${eventTitle}`,
    body: `${formattedDate} — ${lieu || 'Lieu à confirmer'}`,
  },
  data: {
    type: 'new_operation',
    club_id: clubId,
    operation_id: operationId,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  },
  android: {
    notification: {
      channelId: 'event_messages',  // Réutiliser le channel existant
      priority: 'high',
      sound: 'default',
    },
  },
  // ... apns standard
};
```

**Enregistrement dans `index.js`**:
```javascript
const { onNewOperation } = require('./src/notifications/onNewOperation');
exports.onNewOperation = onNewOperation;
```

**Côté Flutter** (main.dart, tap handler):
Ajouter le case `'new_operation'` qui navigue vers `OperationDetailScreen`.

**Champs Firestore de l'opération pertinents**:
- `type`: `'evenement'` (obligatoire pour déclencher)
- `event_category`: `'plongee'` ou `'sortie'` (filtrage)
- `titre`: titre de l'événement
- `date_debut`: date de début
- `lieu`: lieu de l'événement
- `event_number`: numéro unique (format `2XXXXX` pour plongée, `3XXXXX` pour autres)

---

### Phase 2 (P2) — Ciblage amélioré

#### 2.1 Notification d'assignation tâche piscine

**Fichier**: `functions/src/notifications/onPiscineTaskAssigned.js` (NOUVEAU)
**Trigger**: `clubs/{clubId}/piscine_sessions/{sessionId}` — `onDocumentUpdated`

**Concept**: Quand un admin met à jour une `piscine_session` en ajoutant des membres aux tâches (accueil, gonflage, niveaux, baptêmes, théorie), on détecte les **nouveaux assignés** et on leur envoie une notification.

**Structure des données de session piscine** (Firestore):
```
piscine_sessions/{sessionId}:
  date: Timestamp (le mardi de la session)
  accueil: [{ membre_id, membre_nom, membre_prenom }, ...]
  baptemes: [{ membre_id, membre_nom, membre_prenom }, ...]
  gonflage: {
    "19h45": [{ membre_id, ... }],
    "20h15": [{ membre_id, ... }],
    "21h30": [{ membre_id, ... }]
  }
  niveaux: {
    "1*": { encadrants: [{ membre_id, ... }], theme: "..." },
    "2*": { encadrants: [{ membre_id, ... }], theme: "..." },
    ...
  }
  theorie: {
    "slot": { encadrants: [{ membre_id, ... }], theme: "..." }
  }
```

**Logique de détection des nouveaux assignés**:
```javascript
function extractAssignedMembers(sessionData) {
  const members = new Map(); // membre_id -> Set<task descriptions>

  // Accueil
  (sessionData.accueil || []).forEach(a => {
    if (!members.has(a.membre_id)) members.set(a.membre_id, new Set());
    members.get(a.membre_id).add('Accueil');
  });

  // Baptêmes
  (sessionData.baptemes || []).forEach(b => {
    if (!members.has(b.membre_id)) members.set(b.membre_id, new Set());
    members.get(b.membre_id).add('Baptêmes');
  });

  // Gonflage
  for (const [slot, assignees] of Object.entries(sessionData.gonflage || {})) {
    (assignees || []).forEach(g => {
      if (!members.has(g.membre_id)) members.set(g.membre_id, new Set());
      members.get(g.membre_id).add(`Gonflage ${slot}`);
    });
  }

  // Niveaux (encadrants)
  for (const [level, data] of Object.entries(sessionData.niveaux || {})) {
    (data.encadrants || []).forEach(e => {
      if (!members.has(e.membre_id)) members.set(e.membre_id, new Set());
      members.get(e.membre_id).add(`Encadrant ${level}`);
    });
  }

  // Théorie
  for (const [slot, data] of Object.entries(sessionData.theorie || {})) {
    (data.encadrants || []).forEach(e => {
      if (!members.has(e.membre_id)) members.set(e.membre_id, new Set());
      members.get(e.membre_id).add(`Théorie ${slot}`);
    });
  }

  return members;
}
```

**Diff pour trouver les nouveaux**:
```javascript
const beforeMembers = extractAssignedMembers(event.data.before.data());
const afterMembers = extractAssignedMembers(event.data.after.data());

// Nouveaux assignés = dans after mais pas dans before (ou nouvelles tâches)
const newlyAssigned = new Map();
for (const [memberId, tasks] of afterMembers) {
  const oldTasks = beforeMembers.get(memberId) || new Set();
  const newTasks = new Set([...tasks].filter(t => !oldTasks.has(t)));
  if (newTasks.size > 0) {
    newlyAssigned.set(memberId, newTasks);
  }
}
```

**Payload par membre**:
```javascript
// Pour chaque nouveau assigné :
{
  notification: {
    title: '🏊 Piscine — Nouvelle tâche',
    body: `Tu es assigné(e) : ${[...tasks].join(', ')} — ${formattedDate}`,
  },
  data: {
    type: 'piscine_task_assigned',
    club_id: clubId,
    session_id: sessionId,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  },
}
```

**Nouveau channel Android** à ajouter côté Flutter:
```dart
// Dans NotificationService._createNotificationChannel()
channelId: 'piscine_tasks'
channelName: 'Tâches de piscine'
```

**Côté Flutter** (main.dart, tap handler):
Ajouter le case `'piscine_task_assigned'` qui navigue vers le détail de la session piscine.

#### 2.2 Corriger `onNewAnnouncementReply.js` — Thread participants uniquement

**Fichier**: `functions/src/notifications/onNewAnnouncementReply.js`
**Changement**: Au lieu d'envoyer à tous les membres, envoyer uniquement à :
1. L'auteur de l'annonce originale (`announcement.sender_id`)
2. Les personnes qui ont déjà répondu dans le thread

**Logique**:
```javascript
// 1. Récupérer l'annonce parente
const announcement = announcementDoc.data();
const threadParticipantIds = new Set();

// 2. L'auteur original reçoit toujours les réponses
if (announcement.sender_id) {
  threadParticipantIds.add(announcement.sender_id);
}

// 3. Tous les auteurs de réponses précédentes
const repliesSnapshot = await admin.firestore()
  .collection('clubs').doc(clubId)
  .collection('announcements').doc(announcementId)
  .collection('replies')
  .select('sender_id')  // Optimisation: seulement le champ nécessaire
  .get();

repliesSnapshot.docs.forEach(doc => {
  const data = doc.data();
  if (data.sender_id) threadParticipantIds.add(data.sender_id);
});

// 4. Exclure l'auteur de la réponse actuelle (pas de self-notification)
threadParticipantIds.delete(reply.sender_id);

// 5. Fetcher les membres pour les tokens FCM
const membersSnapshot = await admin.firestore()
  .collection('clubs').doc(clubId)
  .collection('members')
  .where('app_installed', '==', true)
  .get();

// 6. Filtrer pour ne garder que les participants du thread
const memberDocs = membersSnapshot.docs.filter(doc => threadParticipantIds.has(doc.id));
```

---

### Phase 3 (P3) — Préférences granulaires

#### 3.1 Nouveau champ Firestore: `notification_preferences`

**Collection**: `clubs/{clubId}/members/{memberId}`

**Nouveau champ** (à côté de `notifications_enabled`):
```javascript
notification_preferences: {
  new_events: true,           // Nouvelles sorties extérieures
  event_messages: true,       // Messages des événements auxquels je participe
  piscine_tasks: true,        // Assignation de tâches en piscine
  // announcements → PAS dans les préférences — toujours actif (toggle grisé dans l'UI)
  announcement_replies: true, // Réponses aux annonces (threads auxquels je participe)
  team_messages: true,        // Messages d'équipe (par rôle)
  session_messages: true,     // Messages de piscine
  session_reminders: true,    // Rappels de session piscine
  medical_certificates: true, // Certificats médicaux
}
```

**Valeur par défaut**: Tout à `true`. Si le champ n'existe pas, on considère tout activé (backward compatible).
**Note**: `announcements` n'est PAS stocké — les annonces du club sont toujours envoyées.

#### 3.2 Écran de préférences dans l'app Flutter

**Fichier**: `lib/screens/profile/notification_preferences_screen.dart` (NOUVEAU)
**Accessible depuis**: `settings_screen.dart` — remplacer le simple toggle par un lien vers l'écran de préférences.

**UI proposée**:
```
Notifications
├── 📢 Annonces du club                 [toggle GRISÉ — toujours actif]
│   (les annonces importantes sont toujours envoyées)
├── 🤿 Nouvelles sorties extérieures     [toggle]
├── 💬 Messages d'événements             [toggle]
│   (uniquement ceux auxquels tu participes)
├── 🏊 Tâches de piscine                [toggle]
│   (quand tu es assigné(e))
├── 💬 Réponses aux annonces            [toggle]
│   (threads auxquels tu participes)
├── 👥 Messages d'équipe                [toggle]
├── 🏊 Messages de piscine              [toggle]
├── ⏰ Rappels de piscine               [toggle]
└── 🏥 Certificats médicaux             [toggle]
```

**Flutter implementation du toggle grisé**:
```dart
SwitchListTile(
  value: true,           // Toujours true
  onChanged: null,       // null = grisé/disabled
  title: Text('Annonces du club'),
  subtitle: Text('Les annonces importantes sont toujours envoyées',
    style: TextStyle(color: Colors.grey)),
)
```

**Service**: Créer `notification_preferences_service.dart` ou ajouter à `NotificationService`:
```dart
Future<void> updatePreference(String clubId, String userId, String key, bool value);
Future<Map<String, bool>> getPreferences(String clubId, String userId);
```

#### 3.3 Mise à jour de toutes les Cloud Functions

Chaque Cloud Function doit vérifier la préférence correspondante avant d'envoyer. Ajouter dans `badge-helper.js` :

```javascript
/**
 * Filtrer les membres selon leurs préférences de notification
 */
function filterByPreference(memberDocs, preferenceKey) {
  return memberDocs.filter(doc => {
    const data = doc.data();
    const prefs = data.notification_preferences;
    // Si pas de préférences définies, tout est activé (backward compatible)
    if (!prefs || typeof prefs !== 'object') return true;
    // Si la préférence spécifique n'est pas définie, elle est activée par défaut
    if (prefs[preferenceKey] === undefined) return true;
    return prefs[preferenceKey] === true;
  });
}
```

**Mapping fonction → préférence**:

| Cloud Function | preferenceKey |
|---|---|
| `onNewOperation` | `new_events` |
| `onNewEventMessage` | `event_messages` |
| `onPiscineTaskAssigned` | `piscine_tasks` |
| `onNewAnnouncement` | _(pas de préférence — toujours actif)_ |
| `onNewAnnouncementReply` | `announcement_replies` |
| `onNewTeamMessage` | `team_messages` |
| `onNewSessionMessage` | `session_messages` |
| `sessionReminder` | `session_reminders` |
| `onMedicalCertStatusChange` | `medical_certificates` |

---

## Fichiers à modifier/créer — Résumé

### Cloud Functions (functions/)

| Action | Fichier | Effort |
|---|---|---|
| **Modifier** | `src/notifications/onNewEventMessage.js` | Petit — filtrer par inscriptions |
| **Créer** | `src/notifications/onNewOperation.js` | Moyen — nouvelle fonction |
| **Créer** | `src/notifications/onPiscineTaskAssigned.js` | Moyen — diff d'assignation |
| **Modifier** | `src/notifications/onNewAnnouncementReply.js` | Petit — filtrer par participants du thread |
| **Modifier** | `src/utils/badge-helper.js` | Petit — ajouter `filterByPreference()` |
| **Modifier** | `index.js` | Petit — enregistrer les 2 nouvelles fonctions |

### Flutter App (lib/)

| Action | Fichier | Effort |
|---|---|---|
| **Créer** | `screens/profile/notification_preferences_screen.dart` | Moyen |
| **Modifier** | `screens/profile/settings_screen.dart` | Petit — lien vers préférences |
| **Modifier** | `services/notification_service.dart` | Petit — nouveau channel Android `piscine_tasks` |
| **Modifier** | `main.dart` | Petit — nouveaux tap handlers pour `new_operation` et `piscine_task_assigned` |

### Déploiement

```bash
# 1. Déployer les Cloud Functions mises à jour
cd CalyMob/functions && npm install && firebase deploy --only functions

# 2. Build & release de l'app Flutter (pour le nouveau channel Android + écran préférences)
cd CalyMob && ./scripts/build_release.sh --bump minor
```

---

## Ordre d'implémentation recommandé

1. **P1.1** — `onNewEventMessage` → participants seulement _(impact immédiat, 80% du bruit résolu)_
2. **P1.2** — `onNewOperation` → notification nouvelle sortie _(fonctionnalité demandée)_
3. **P2.1** — `onPiscineTaskAssigned` → notification assignation tâche _(fonctionnalité demandée)_
4. **P2.2** — `onNewAnnouncementReply` → thread participants seulement _(réduction du bruit)_
5. **P3** — Préférences granulaires _(contrôle utilisateur)_

Les phases 1 et 2 (Cloud Functions) peuvent être déployées **sans nouvelle version de l'app**. La phase 3 nécessite une mise à jour de l'app Flutter.

---

## Risques et points d'attention

- **Backward compatibility**: Les préférences `notification_preferences` n'existent pas encore sur les membres existants. Le code doit traiter `undefined` comme `true` (tout activé par défaut).
- **Performance `onNewEventMessage`**: Requête supplémentaire sur `inscriptions/` avant l'envoi. Négligeable pour un petit club, mais à monitorer.
- **Performance `onPiscineTaskAssigned`**: Le trigger `onDocumentUpdated` se déclenche à **chaque** modification de la session. Le diff de membres assignés doit être rapide pour ne pas ralentir l'admin.
- **Nouveau channel Android**: `piscine_tasks` doit être créé dans `NotificationService` côté Flutter. Les utilisateurs existants ne l'auront qu'après mise à jour de l'app, mais les notifications tomberont dans le channel par défaut en attendant.
- **Tap navigation**: Les nouveaux types (`new_operation`, `piscine_task_assigned`) doivent être gérés dans `main.dart` `_handleNotificationTap`.
