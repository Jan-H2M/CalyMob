# COM-073 — Copier la communication de paiement

## Base et récupération

L’implémentation part de `origin/main` au commit `171fee8`, qui contient déjà la
PR #56. L’ancienne worktree `/private/tmp/calypso-com073` a été inspectée comme
source récupérable mais n’a pas été modifiée ni reprise en bloc : elle changeait
également les modes de paiement et reposait sur une base antérieure.

## Correction limitée

Un composant partagé affiche partout le libellé explicite
**Copier la communication**. Il copie la valeur exacte dans le presse-papiers et
confirme : la communication est copiée et doit être collée dans le champ
communication de l’application bancaire.

Le composant est utilisé dans :

- la fiche de paiement d’une activité ;
- la confirmation d’une commande Boutique ;
- le détail d’une commande Boutique ;
- le paiement de la cotisation.

Les modes de paiement existants restent inchangés. Aucun backend, prix, statut
de paiement ou donnée Firestore n’est modifié.

## Validation

- `flutter test test/widgets/payment_communication_copy_button_test.dart` :
  2 tests réussis (valeur exacte, confirmation/instruction, état désactivé).
- Analyse ciblée : aucune erreur ni avertissement nouveau ; 13 remarques `info`
  préexistantes dans `participant_payment_card.dart`.
- `git diff --check` : réussi.

## Livraison

- Branch : `codex/bug-COM-073-copy-communication-v2`
- Commit code : `3abc0bc`
- Pas de push, déploiement, build de release, upload ou soumission store.

## Revue encore nécessaire

Sur la prochaine version groupée, vérifier visuellement sur un appareil que le
bouton tient sur une ligne, reste lisible avec la taille de texte agrandie, et
que le presse-papiers et la confirmation fonctionnent dans les quatre parcours.

