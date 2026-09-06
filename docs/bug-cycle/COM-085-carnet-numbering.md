# COM-085 — numérotation du carnet

Date: 2026-09-06. Run: `codex-20260906-COM085-carnet-numbering`.
PR: https://github.com/Jan-H2M/CalyMob/pull/62.

## Avant / diagnostic

COM-085 prolonge COM-065 et prépare le chantier Parcours/COM-084 sans le modifier.
COM-065 avait déjà corrigé l’affichage trompeur du numéro proposé côté mobile en
le marquant comme provisoire. Il restait deux points fragiles côté backend:

- l’attribution automatique n’indiquait pas si un numéro venait du trigger serveur
  ou du backfill historique; quand un numéro apparaissait après fermeture/ouverture
  de Mon carnet, il était donc difficile de distinguer une vraie action utilisateur
  d’une synchronisation backend;
- les chemins de confirmation binôme n’avaient pas de test explicite verrouillant
  que `decline` et `confirm_no_import` ne créent pas d’entrée carnet. Sans création
  d’entrée, le trigger `assignDiveNumber` ne peut pas consommer de numéro.

Le code existant ne créait déjà une nouvelle entrée que pour `confirm_copy`, mais
cette règle n’était pas centralisée/testée. Le backfill ignorait déjà les entrées
`source: piscine`; la même règle est maintenant partagée avec le calcul du plus
grand numéro existant pour éviter qu’un ancien artefact piscine numéroté pèse dans
la décision d’allocation.

## Après / périmètre

La correction reste limitée et traçable:

- extraction de helpers testables pour la politique d’allocation `dive_number`;
- le trigger `assignDiveNumber` et le callable `backfillMyDiveNumbers` utilisent
  la même validation des numéros positifs;
- le calcul du plus haut numéro existant ignore explicitement l’entrée en cours et
  les artefacts `source: piscine`;
- les numéros attribués automatiquement reçoivent maintenant
  `dive_number_source` (`assignDiveNumber` ou `backfillMyDiveNumbers`) et
  `dive_number_allocated_at`;
- la création d’une entrée via confirmation est centralisée dans
  `createsLogbookEntryForConfirmationAction`: seul `confirm_copy` peut créer une
  nouvelle entrée, donc `decline` et `confirm_no_import` ne consomment pas de
  numéro.

Aucune donnée carnet live n’a été auditée ou renumérotée. Aucun deploy Cloud
Functions, build mobile, version bump ou écriture `settings/app_version` n’a été
réalisé.

## Validation

- `node -c src/training/assignDiveNumber.js`: réussi.
- `node -c src/training/logbookDiveConfirmations.js`: réussi.
- `npm test -- assignDiveNumber logbookDiveConfirmations --runInBand`: 2 suites,
  30/30 tests réussis.
- `npm test -- assignDiveNumber logbookDiveConfirmations onBuddyConfirmationTask --runInBand`:
  3 suites, 33/33 tests réussis.
- `npm test -- --runInBand`: 29 suites, 195/195 tests réussis.
- `flutter test test/utils/dive_number_policy_test.dart`: 6/6 tests réussis.

Notes d’environnement: `npm ci` signale que la repo demande Node 22 tandis que la
session locale utilise Node 25.8.2; les tests restent verts. `npm audit` signale
des vulnérabilités existantes. `flutter test` signale des packages plus récents
disponibles et modifie `android/local.properties`; ce fichier a été restauré dans
la worktree avant commit.

## Risques / suite

- Pour corriger des numéros historiques d’un membre précis, il faudra un exemple
  concret et un audit dry-run séparé; aucune renumérotation live n’est incluse ici.
- La partie backend ne sera active en production qu’après deploy Cloud Functions
  explicitement autorisé.
- La partie mobile/COM-065 reste à valider dans la prochaine release groupée.
- COM-084 doit rester après ces fondations, car il dépend d’une identité de
  présence stable et d’un carnet dont les effets de bord sont mieux verrouillés.

État: code préparé sur branche `codex/bug-COM-085-carnet-numbering`, PR draft
https://github.com/Jan-H2M/CalyMob/pull/62, non publié, à intégrer dans la revue
mobile/fonctions groupée du chantier Parcours.
