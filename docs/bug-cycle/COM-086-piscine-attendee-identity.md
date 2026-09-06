# COM-086 — identité unique des présences piscine

Date: 2026-09-06. Run: `codex-20260906-COM086-parcours-foundation`.
PR: https://github.com/Jan-H2M/CalyMob/pull/61.

## Avant / diagnostic

COM-086 fait partie de la base technique du futur Parcours (COM-084): une séance
piscine doit avoir une seule présence par membre, sinon les rosters et les fiches
formation se construisent sur des données instables.

Le diagnostic confirmé montrait deux producteurs sur la même sous-collection
`piscine_sessions/{sessionId}/attendees`:

- CalyMob ajoutait une présence avec un identifiant Firestore aléatoire et les champs
  `memberId`, `memberName`, `scannedAt`, `scannedBy`.
- `onPoolCheckinCompleted` écrivait ensuite le résultat de la fiche sur
  `attendees/{userId}`. Quand ce document n'existait pas, cela créait une deuxième
  présence pour le même membre, parfois sans nom.

La suppression depuis l'interface pouvait donc retirer seulement un des deux
documents; le doublon restant faisait revenir la personne dans la liste.

## Après / périmètre

La correction est additive et sans migration live automatique:

- les nouveaux ajouts CalyMob de vrais membres utilisent maintenant le document
  canonique `attendees/{memberId}`;
- les invités restent sur un document généré séparé;
- le modèle mobile tolère les anciens champs `membre_id` / `member_name` et un ancien
  document dont l'id est déjà le memberId;
- la lecture mobile déduplique les présences legacy pour n'afficher qu'une carte par
  membre;
- la suppression mobile d'un vrai membre efface aussi les doublons legacy du même
  membre dans la séance;
- `onPoolCheckinCompleted` écrit d'abord sur `context.attendee_id`, puis sur un
  attendee existant par `memberId`/`membre_id`, et seulement en dernier recours sur
  `attendees/{memberId}`. L'écriture ajoute `memberId`/`memberName` quand ils sont
  disponibles.

Aucune donnée historique n'a été modifiée. Aucun déploiement de Cloud Function,
règle Firestore, build store, version bump ou écriture `settings/app_version` n'a été
réalisé.

## Validation

- `node -c functions/src/training/onPoolCheckinCompleted.js`: réussi.
- `npm test -- onPoolCheckinCompleted --runInBand`: 5/5 tests réussis.
- `npm test -- onPoolCheckinCompleted onPoolSessionClosed --runInBand`: 8/8 tests réussis.
- `flutter analyze lib/models/piscine_attendee.dart lib/services/piscine_session_service.dart test/services/piscine_session_service_test.dart`: aucun problème.
- `flutter test test/services/piscine_session_service_test.dart test/widgets/manual_attendee_routing_test.dart`: 6/6 tests réussis.
- `git diff --check`: réussi.

Notes d'environnement: `npm install` dans la worktree temporaire signale une mismatch
Node locale (repo demande Node 22, shell en Node 25) et des vulnérabilités audit npm
existantes; cela n'a pas empêché les tests ciblés. `flutter pub get` signale des
packages plus récents disponibles, sans impact sur cette correction.

## Risques / suite

- Les anciennes séances peuvent encore contenir des documents doublons en base;
  l'app les tolère et les supprime proprement au cas par cas, mais un dédoublonnage
  massif live reste une opération de données séparée qui requiert accord explicite.
- La Cloud Function modifiée doit être déployée séparément pour que la partie backend
  soit active en production. Ce dossier ne constitue pas une autorisation de deploy.
- La partie mobile doit attendre la prochaine release CalyMob groupée.

État: code préparé sur branche `codex/bug-COM-086-piscine-attendee-identity`,
PR draft https://github.com/Jan-H2M/CalyMob/pull/61, non publié, à intégrer dans
la revue mobile/fonctions groupée du chantier Parcours.
