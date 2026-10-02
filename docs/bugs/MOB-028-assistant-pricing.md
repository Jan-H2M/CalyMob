# MOB-028 — Tarif encadrant appliqué aux assistants piscine

## Constat confirmé

- L'activité « Barrages de l'Eau d'Heure » du 4 octobre 2026 configure le tarif Membre à 6 EUR et le tarif Encadrants à 2 EUR.
- Les profils « Encadrants et assistants » sont des assistants piscine : ils partagent les capacités de planning piscine, mais pas l'autorité carrière/LIFRAS d'un encadrant officiel.
- L'application recalculait néanmoins leur prix affiché à 2 EUR, et la fonction d'inscription pouvait appliquer la même classification aux nouvelles inscriptions.

## Cause

Le client Flutter et la fonction `registerForEvent` recherchaient la sous-chaîne `encadrant` dans les fonctions du membre. Cette règle confondait « Encadrants et assistants » ou « Encadrant Piscine » avec le rôle officiel Encadrant.

## Comportement remplacé

**Superseded:** toute fonction contenant le texte `encadrant` reçoit le tarif encadrant.

Le tarif encadrant est désormais réservé aux libellés officiels exacts `Encadrant`, `Encadrants`, `E` et `Encadrant Carrière`, qu'ils proviennent de `clubStatuten` ou du rôle par défaut historique `fonction_defaut`. Les rôles piscine `Encadrants et assistants`, `Encadrant Piscine` et `P` utilisent le tarif membre, sauf futur contrat tarifaire explicite distinct.

## Portée et données

- Le prix affiché avant inscription et le prix serveur des nouvelles inscriptions suivent la même séparation de rôles.
- Les inscriptions existantes conservent leur prix enregistré; aucune migration ou écriture de production n'est effectuée par ce correctif.
- Les tarifs configurés sur les activités ne sont pas modifiés.
