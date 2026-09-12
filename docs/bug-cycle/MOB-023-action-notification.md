# MOB-023 — Notification d'actions introuvables

## Intake

- App : CalyMob + Cloud Functions.
- Ticket : `MOB-023` — notification indiquant 2 actions à vérifier, mais actions difficiles à retrouver dans l'app.
- Run ID : `codex-20260907-MOB023-action-notification`.
- Branche : `codex/bug-MOB-023-action-notification`.
- Go : Jan, révision d'analyse `ff215142-8535-4e56-99ac-1ed5f8ffc73e`.

## Before

- `processFormationTaskReminders` titrait les pushes multi-tâches avec le nombre de tâches dues dans la passe de rappel, par exemple `2 actions t'attendent`.
- L'app ouvrait ensuite l'inbox générale (`communication:inbox`).
- Ce nombre ne correspond pas nécessairement au nombre total d'actions ouvertes visibles dans l'app, car d'anciennes actions peuvent être ouvertes sans être dues pour un rappel à cet instant.

## Fix

- Le push multi-tâches ne promet plus un nombre exact visible dans l'inbox : titre générique `Des actions t'attendent`.
- Le payload multi-tâches cible explicitement l'onglet Actions via `communication:actions` et `target_tab=actions`.
- L'app interprète les anciens payloads multi-tâches comme une demande d'ouverture de l'onglet Actions, afin que les notifications déjà envoyées restent utiles.
- `CommunicationHubScreen` peut s'ouvrir directement avec le filtre Actions sans modifier le parcours normal depuis l'accueil.
- Les pushes à tâche unique continuent d'ouvrir la tâche exacte.

## Validation

- `functions`: Jest ciblé `processFormationTaskReminders.test.js` — 10/10 réussi.
- Flutter: `flutter test test/services/notification_navigation_service_test.dart` — 13/13 réussi.
- `dart analyze` sur les fichiers Dart modifiés — aucun problème.
- `node --check src/training/processFormationTaskReminders.js` — réussi.

## Impact attendu

- Samuel ne reçoit plus une notification qui semble promettre exactement deux cartes introuvables.
- Un tap sur une notification multi-actions ouvre directement l'endroit où chercher : l'onglet Actions.
- Les notifications anciennes avec `communication:inbox` et plusieurs tâches sont aussi redirigées vers Actions côté app.

## Release / review

- Contient une modification Cloud Function et une modification app Flutter.
- Nécessite review puis déploiement Functions + release CalyMob selon le processus habituel.
- Aucune donnée Firestore n'a été modifiée.
