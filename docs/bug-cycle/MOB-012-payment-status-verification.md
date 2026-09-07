# MOB-012 — Statut de paiement après un QR EPC

## Intake
- App : CalyMob.
- Priorité/statut : `annoying`, `en_cours`; Go confirmé pour une vérification locale.
- Reporter/time : signalement du 27/05/2026; aucune donnée d'identité n'a été reprise dans ce dossier.
- Route/version/device : écran d'activité, CalyMob `1.8.0+156`, Android 16.
- Evidence : capture signalée dans le ticket, non ouverte ni téléchargée pendant cette intervention afin de ne pas traiter de donnée personnelle de production. Diagnostic limité au code Git et à une inscription entièrement fictive représentant un membre de 13 ans.
- Classification : `needs-more-info` pour le paiement historique; la chaîne d'affichage actuelle est vérifiable sans accès live.
- Assumptions/confidence : confiance élevée sur le contrat mobile actuel; confiance faible sur l'état bancaire exact du cas de mai, faute de transaction, de référence bancaire et d'horodatage de rapprochement dans le ticket.

## Before
- Reproduction steps : créer en mémoire une inscription fictive `synthetic-member-aged-13`, afficher un QR EPC sans reçu bancaire, puis simuler une confirmation et enfin un rapprochement bancaire.
- Expected : l'affichage ne doit jamais considérer le simple affichage/scannage du QR comme une preuve de règlement; après écriture serveur des preuves de rapprochement, le flux temps réel doit passer de l'attente bancaire à `Payé`.
- Actual : sur `origin/main` (`97968cf5f9de2e7c54088f89c5183acde5b08665`), le QR seul reste non soldé; `paye=true` sans lien bancaire donne `pending_bank`; l'ajout d'un rapprochement donne `paid` sur l'émission suivante du stream.
- Reproduced : non pour le défaut décrit après rapprochement; oui pour l'état provisoire sûr avant rapprochement.
- Baseline test : aucun test ciblé ne couvrait ensemble un profil fictif de 13 ans, le statut QR, l'attente bancaire, le rapprochement et la mise à jour temps réel.

## Analysis
- Affected path : `ParticipantOperation.fromFirestore` et ses états dérivés, puis `OperationService.getParticipantsStream`.
- Root cause : non démontrée pour le dossier historique. Le QR EPC est une instruction de virement, pas un retour de paiement; CalyMob ne peut donc pas solder l'inscription au scan. Le correctif temps réel `1c523bf0bfd0141eb41de6420c3468b8e496cbb0` et la tolérance au lien bancaire `f5cf8244ff1886ea9f19d4e86bd0f1baeb82354c` sont tous deux ancêtres de la build 156. Les attribuer à une réparation postérieure serait incorrect.
- Scope and risks : paiement sensible. Aucun héritage parent-enfant, aucun statut inventé depuis `payment_status=paid` seul et aucune écriture financière mobile ne sont ajoutés. Les champs `paye`, `transaction_id` et `transaction_matched` restent sous autorité serveur/CalyCompta.
- Duplicates/related tickets : MOB-012 reste canonique; MOB-008 est un doublon symptomatique. COM-030 et COM-036 décrivent respectivement le même affichage et la fraîcheur du statut. Les travaux COM-081/COM-087/COM-088 sur le ledger ne prouvent pas l'état de la transaction historique et ne justifient aucune écriture live.

### Champs d'analyse proposés
- `classification: needs-more-info`
- `duplicateCheck: { outcome: canonical, rationale: "MOB-012 reste le cas de référence du symptôme; aucune preuve ne démontre une seconde cause mobile.", comparedReportIds: ["3nwrPpMZSSSwSx0VCJO9", "ozHXnduHCVmG5NuVfvbW", "05kUKVflm6fslBCbJ3Ej"], canonicalReportId: "xbw00zpu3Wbl3maotQfG" }`
- `scope: calymob-payment-status-verification`
- `effort: small`
- `risk: high`
- `needsStoreRelease: false`

## Fix
- Branch : `codex/bug-MOB-012-payment-status-verification` dans la worktree propre `/private/tmp/caly-mob012-payment-status`.
- Changed files : ajout d'un test de régression ciblé et de ce dossier; aucun changement de logique financière ou d'interface.
- Behavior : la logique de `origin/main` est conservée, car le défaut n'est pas reproductible avec des preuves bancaires cohérentes. Le QR seul reste non payé, l'état confirmé mais non rapproché reste en attente, et le rapprochement serveur devient `Payé` en temps réel.
- Regression test : fixture Firestore en mémoire, exclusivement fictive, couvrant QR sans règlement, transition `pending_bank` vers `paid` et fallback legacy par `transaction_id`.

## Validation
- Targeted tests : `flutter test test/models/participant_operation_payment_status_test.dart test/services/operation_payment_status_integrity_test.dart` — 27 réussites, zéro échec et zéro test ignoré.
- Full suite : `flutter test --no-pub` — 503 réussites, zéro échec et un test existant ignoré parce qu'il exige le véritable émulateur Firestore pour vérifier la contention de transactions.
- Build/analyzer/lint : `flutter analyze --no-pub test/models/participant_operation_payment_status_test.dart lib/models/participant_operation.dart lib/services/operation_service.dart` — aucun problème. Aucun build store, car aucun code de production n'est modifié et aucune publication n'est autorisée.
- Manual or browser QA : non applicable; aucune donnée de production ni capture utilisateur n'a été ouverte. La vérification fonctionnelle utilise le double Firestore en mémoire.
- Baseline failures : aucune. Les avertissements de fixture existants sur l'absence d'`eventNumber` dans `participant_payment_card_test.dart` n'échouent pas la suite et ne concernent pas la fixture MOB-012, qui reste strictement synthétique.

## After
- Evidence : le test prouve la transition temps réel avec les seuls champs autoritatifs produits par le serveur. Il prouve également qu'un QR communiqué sans reçu ne devient jamais `Payé` côté mobile.
- Residual risk : le ticket ne contient pas les preuves permettant de savoir si, le 27/05, le reçu bancaire était absent, non importé, non rapproché, rapproché vers une autre inscription ou correctement lié. Une correction automatique de données anciennes serait dangereuse et reste exclue.
- PR : aucun, conformément au périmètre.
- Merge commit : aucun; commit local de vérification présent sur la branche, non poussé.
- CalyCompta deployment or CalyMob release-queue entry : aucun déploiement et aucune publication. `needsStoreRelease=false`, car aucune logique livrée à l'utilisateur n'est modifiée.
- Ticket transition : aucune écriture ticket. Recommandation : ne fermer MOB-012 qu'avec une preuve fictive/QA de la chaîne complète ou une preuve de rapprochement historique expurgée; sinon conserver `needs-more-info`.
