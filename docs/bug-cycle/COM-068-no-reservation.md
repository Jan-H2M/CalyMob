# COM-068 — Demande sans réservation, attribution à la remise

## Décision et périmètre

Jan a choisi explicitement **aucune réservation à la demande**. Le responsable
attribue les pièces physiques lors de la remise. La caution fixe de 100 EUR,
son paiement constaté manuellement et les permissions existantes sont conservés.
Branche: `codex/bug-COM-068-no-reservation`.

## Avant

Le parcours actif mobile demandait un numéro d'inventaire pour créer un prêt QR
en attente, puis réservait immédiatement cette pièce. Un formulaire par catégories
existait ailleurs mais n'était pas relié à l'écran actif. Aucun test sur appareil
n'a été présenté comme reproduction; diagnostic établi par inspection de code.

## Après

- L'écran actif propose type et option seulement, au maximum un article par type
  (limite existante). Le catalogue inclut les pièces déjà prêtées: la demande ne
  garantit donc pas le stock et ne le bloque pas.
- Collection existante `inventory_loans`; `requested_lines` contient
  `{type_id, type_name, variant, quantity}`. `reservation_policy: none`,
  `itemIds: []`, `items_snapshot: []`, `statut: attente_caution`.
- La carte affiche les types demandés et « sans réservation ». Le QR utilise le
  prêt et la caution existants; aucun changement de backend/rules/politique.
- La remise demande de choisir les pièces réelles et de cocher le paiement
  constaté. La transaction relit les articles, vérifie type/option actuels,
  disponibilité, propriétaire, nombre et unicité, puis écrit IDs, snapshots,
  numéro de série, propriétaire, statut `prete` et prêt `actif`/caution `paid`.
- Les anciennes réservations restent compatibles. Une nouvelle demande ne peut
  pas réutiliser un objet appartenant déjà à un autre prêt.
- Après création du prêt, les champs sont verrouillés; un nouvel essai reprend
  le même prêt et ses lignes, sans modifier silencieusement une demande existante.
- Annuler la boîte de remise ne remet aucun matériel. L'annulation définitive
  d'un prêt et les remboursements ne sont pas ajoutés dans ce changement.

## Validation

- 17 tests ciblés réussis (12 nouveaux service, 2 nouveaux widget, 3 existants).
- Les widgets vérifient sélection physique + paiement obligatoires et bouton
  désactivé sans stock; les tests service couvrent demande sans mutation de stock,
  demandes concurrentes de capacité, types/options, propriétaire, double remise,
  compatibilité legacy, catalogue prêté et validation des lignes.
- Un scénario de deux remises réellement concurrentes est **non vérifié**:
  le FakeFirestore 4.0.1 implémente `runTransaction` via `_DummyTransaction`, sans
  détection des conflits ni retry. L'essai y a autorisé les deux opérations;
  le test est conservé explicitement ignoré en attendant l'émulateur Firestore.
  Les contrôles transactionnels du code ne constituent pas une preuve de ce test.
- Analyse des fichiers Dart modifiés: aucun problème. Formatage Dart appliqué.
- Suite complète: **425 réussis / 3 échoués / 1 ignoré**;
  trois échecs préexistants `operation_payment_status_integrity_test.dart` ont été
  reproduits sur main pendant le cycle COM-070 (Activité introuvable).

## Revue / release

Pas de release, de version bump, de push/main merge, de build store ni d'écriture
live. Pas de modification des fonctions, règles ou autorisations.
Revue indépendante de code: deux remarques Codex intégrées (texte e-mail et
verrouillage de la demande persistée). Ce n'est pas un approval Claude Code.
Revue visuelle/fonctionnelle sur Android+iOS à effectuer sur le lot mobile avant
release, avec connexion réelle de test et QR simulé: création email/sur-place,
réouverture, stock épuisé, remise et retour. Aucun paiement réel à déclencher.

## Limites

- Aucun nouveau portail membre ou nouvelle permission sur `inventory_loan_requests`.
- Émulateur requis pour prouver le conflit entre deux remises simultanées.
- Les règles existantes restent la frontière d'autorisation; le booléen local
  de confirmation n'est pas une preuve bancaire automatique.
