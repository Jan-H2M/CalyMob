# MOB-026 — Téléphone du responsable précédent

## Cause confirmée

Le téléphone n'est pas dénormalisé sur l'activité. CalyMob affiche le nom
`organisateur_nom`, puis charge le téléphone du profil public identifié par
`organisateur_id`.

Le sélecteur actuel remplace déjà ces deux champs ensemble. Les activités
créées ou modifiées avant cette correction peuvent toutefois conserver un nom
et un identifiant appartenant à deux personnes différentes. Le détail gardait
également le profil précédent en mémoire pendant le rechargement; si la nouvelle
lecture échouait, son téléphone restait affiché.

## Comportement remplacé

**Superseded:** afficher le téléphone résolu par `organisateur_id` sans vérifier
qu'il correspond au nom du responsable affiché, et conserver le profil chargé
pendant un changement de responsable.

Le profil en mémoire est désormais effacé avant chaque résolution. Une réponse
asynchrone obsolète est ignorée. Un rechargement en erreur efface aussi
l'activité sélectionnée au lieu de réutiliser son ancienne projection. Le
téléphone n'est affiché que si le nom du profil est compatible avec
`organisateur_nom`. Les formes abrégées historiques, l'ordre prénom/nom et les
accents restent acceptés. Un conflit d'identité masque le téléphone au lieu
d'afficher les coordonnées d'une autre personne. Le geste de rafraîchissement
recharge aussi l'activité, et le consentement `share_phone` est revérifié avant
tout affichage.

## Données existantes et réparation proposée

L'audit en lecture seule du 2 octobre 2026 trouve 11 activités dont le nom et
l'identifiant du responsable désignent des membres différents, dont 3 ouvertes.
Aucune donnée n'a été modifiée.

Une réparation séparée pourra être proposée sous forme d'un script à sec par
défaut. Il recevra une table explicite `operationId -> expectedOrganisateurId`,
relira chaque activité et le membre cible, refusera les noms ambigus, affichera
le diff, puis exigera `--write`, un `--run-id` unique et la confirmation des
valeurs précédentes pour écrire atomiquement `organisateur_id` et
`organisateur_nom`. Le script ne doit être exécuté qu'après approbation de Jan.
