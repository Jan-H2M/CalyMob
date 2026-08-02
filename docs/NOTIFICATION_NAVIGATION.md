# Navigation depuis les notifications

## Contrat

Toutes les interactions passent par `NotificationNavigationRequest`, quelle
que soit l’origine : notification distante en arrière-plan, lancement à froid
ou notification locale affichée au premier plan. Les valeurs de payload sont
normalisées en chaînes avant le routage.

| Type | Identifiant requis | Destination |
| --- | --- | --- |
| `formation_reminder` (une tâche) | `formation_task_id` ou `deeplink=formation_task:<id>` | Écran natif correspondant à la tâche |
| `formation_reminder` (plusieurs tâches) | `task_count` | Boîte Actions |
| `claim_rejected` | `formation_task_id` | Correction de la déclaration refusée |
| `exercice_declared` | `member_id`, `exercice_valide_id` | Validation de l’exercice pré-sélectionné |
| `exercice_digest` | aucun objet unique | Boîte Actions |

Les autres types existants (sorties, annonces, équipes, piscine, certificat
médical et confirmations de carnet) conservent leurs écrans dédiés.

## Démarrage et sécurité

- Un tap est conservé en mémoire jusqu’à ce que le navigator, l’authentification
  et le contexte membre soient prêts. Le changement de mot de passe obligatoire
  reste prioritaire.
- Un identifiant de message, ou à défaut une clé stable type/objet, empêche les
  doubles ouvertures pendant 30 secondes.
- Une tâche est relue depuis Firestore et doit toujours être assignée à
  l’utilisateur connecté. Une tâche réassignée n’est jamais ouverte.
- Les objets supprimés, déjà traités, inaccessibles ou expirés produisent un
  message utilisateur neutre. Les payloads et données personnelles ne sont pas
  copiés dans les logs.

## Payload serveur recommandé

Une notification de tâche unique doit contenir `type`, `club_id`,
`task_count=1`, `formation_task_id`, `deeplink=formation_task:<id>` et
`click_action=FLUTTER_NOTIFICATION_CLICK`. Un digest ne contient pas
`formation_task_id` et utilise `deeplink=communication:inbox`.

Les tests ciblés se trouvent dans
`test/services/notification_navigation_service_test.dart`,
`test/services/formation_task_notification_lookup_test.dart` et
`functions/src/training/processFormationTaskReminders.test.js`.
