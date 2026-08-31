# COM-070 — Créneau gonflage du planning piscine

## Avant / analyse

- Application: CalyMob; problème confirmé par le chemin de lecture du modèle et
  les captures du dossier (pas de reproduction sur appareil pendant ce correctif).
- CalyCompta enregistre le troisième créneau à `22h30`, tandis que CalyMob
  affichait `21h30` et ignorait les affectations enregistrées à `22h30`.
- Attendu: afficher les trois créneaux `19h45`, `20h15`, `22h30`, avec leurs membres.
- Test de régression avant modification: **0 réussi / 9 échoués**.

## Correctif

- Branche: `codex/bug-COM-070-pool-slot`.
- `GonflageSlots.all` devient la source unique du modèle et des écrans existants.
- Lecture de `22h30` en priorité; si vide, reprise de `21h30`, puis `21h15`.
  Les anciennes données ne remplacent jamais un créneau actuel non vide.
- Ancien format tableau maintenu sur le premier créneau; données nulles maintenues
  comme trois listes vides. Sérialisation du modèle avec le créneau canonique.
- Les disponibilités et les titres des cartes utilisent déjà les constantes.
  Le commentaire de leur modèle a été actualisé; aucune migration des documents
  historiques `availabilities/time_slots` n'est effectuée.
- Les horaires des encadrants (`21h15`) ne changent pas.

## Validation après modification

- `flutter test --no-pub --reporter expanded test/models/piscine_session_gonflage_test.dart`:
  **9/9 réussis** (nouveau, ancien, mixte, priorités, vide, tableau, constantes).
- `flutter analyze --no-pub` sur les quatre fichiers Dart modifiés: aucun problème.
- `dart format --output=none --set-exit-if-changed` sur ces fichiers: aucun changement.
- Suite Flutter complète: **420 réussis / 3 échoués**. Les trois échecs de
  `operation_payment_status_integrity_test.dart` sont également reproduits sur
  `main` non modifié: `Activité introuvable` avant l'appel serveur attendu.
- Pas de test visuel sur appareil ni de build Android/iOS: vérification combinée
  prévue pour la prochaine version mobile, conformément à l'exception Flutter de Jan.

## Livraison / limites

- Aucun déploiement, changement de version, build store, fonction ou écriture live.
- Pas de commit sur main; pas de PR/push. Correctif local en attente de revue et
  d'intégration dans la version groupée. Voir `docs/MOBILE_RELEASE_QUEUE.md`.
- Revue indépendante non effectuée par cet agent implémenteur; ne pas présenter
  ces tests comme un approval Claude Code.
- Vérification de lot: ouvrir un planning avec affectations `22h30`, vérifier les
  noms, la carte et les boutons, puis les disponibilités; vérifier aussi un ancien
  planning et les créneaux encadrants. Capturer les preuves sur appareil.
- Risque résiduel: les disponibilités historiques utilisent parfois les anciens
  identifiants; leur migration éventuelle n'est pas incluse dans ce correctif.
