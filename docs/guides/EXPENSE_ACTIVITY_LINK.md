# Lier une demande de remboursement à une activité

Dans CalyMob, ouvrez **Remboursements → Nouvelle demande**. Le champ
**Activité** est facultatif et affiche **Pas liée à une activité** par défaut.
La recherche filtre les titres. Le sélecteur utilise une variante enrichie
des cartes de l’agenda, dans les rubriques **Plongées**, **Piscine**, puis
**Sorties**. Elle montre la date et l’heure locales, l’organisateur, les
inscrits, les présences disponibles et les informations financières lisibles
par le membre. Seules les rubriques contenant des résultats sont affichées.
Chaque rubrique regroupe les cartes par mois, du mois le plus récent au
plus ancien, et présente les dates dans l’ordre de l’agenda au sein d’un mois.

> Description supersédée après la version 1.30.8.
> Le sélecteur affiche les mêmes cartes et dates que l’agenda, sans détails
> propres au choix d’une activité.

Le sélecteur reprend les sources et la visibilité de l’agenda sur les
60 derniers jours et les 7 prochains jours. Il comprend les événements
ouverts, clôturés et annulés, les brouillons du membre et les séances
publiées de piscine ou de théorie. Les anciennes opérations de catégorie
piscine sont représentées par les séances de l’agenda.

> Description supersédée après la version 1.30.7.
> La liste propose les événements ouverts, clôturés ou annulés des 60 derniers
> jours et des 7 prochains jours. Les événements que vous organisez ou auxquels
> vous êtes inscrit apparaissent en premier. La recherche filtre leurs titres.

Une fois l’activité sélectionnée, le champ **Nombre de plongeurs** reste
facultatif. Pour retirer le lien avant l’envoi, rouvrez **Activité** et
choisissez **Pas liée à une activité**. Le nombre saisi est alors effacé.

Pour une plongée dont le site possède un tarif membre unique ou un tarif
membre par défaut, CalyMob calcule le **remboursement attendu** avec la même
logique que le contrôle **Valid.** de CalyCompta : inscriptions actives,
exclusion des tarifs « Non plongeur », puis nombre de plongeurs multiplié par
le tarif du site. Les encadrants et organisateurs plongeurs sont compris dans
ce nombre, puisque le club prend leur part en charge. Le montant apparaît sur
la carte du sélecteur et dans le formulaire. Si le montant saisi est différent,
un message demande simplement de le revérifier ; il ne bloque jamais l’envoi.

Les paiements affichés sur la carte correspondent aux états de paiement déjà
enregistrés sur les inscriptions. Ils sont informatifs et ne remplacent pas le
rapprochement bancaire de CalyCompta. Les séances piscine affichent leurs
présences scannées, mais pas un nombre d’inscrits ni un remboursement attendu,
car ces sources n’existent pas sur la séance. Une information financière est
omise lorsqu’aucun site ou tarif membre non ambigu ne permet le calcul.

## Données échangées avec CalyCompta

| Champ | `expense_claims` | `demandes_remboursement` |
| --- | --- | --- |
| Identifiant d’un événement | `operation_id` | `operation_id` |
| Identifiant d’une séance piscine ou théorie | `piscine_session_id` | `piscine_session_id` |
| Titre de l’activité | `operation_title` | `operation_titre` |
| Nombre de plongeurs | `nombre_plongeurs` | `nombre_plongeurs` |

CalyMob écrit la demande dans `expense_claims`. La Cloud Function
`mirrorCanonicalToLegacy` recopie les champs lorsque `sync.enabled` et
`sync.canonicalToLegacy` sont actifs. Les nouveaux champs sont omis si la
demande n’a pas d’activité. Si le nombre est vide, son champ est omis aussi.
Une séance référence `clubs/{clubId}/piscine_sessions/{sessionId}` et
sa demande contient son titre et le nombre de plongeurs s’il est renseigné.
Le champ `operation_id` est réservé aux événements de
`clubs/{clubId}/operations/{operationId}`.

Le contrôle **Valid.** de CalyCompta DEV lit `operation_id` et
`nombre_plongeurs` pour les événements. La prise en charge de
`piscine_session_id` dans ce contrôle et sa conservation lors des
réécritures côté CalyCompta restent à ajouter dans CalyCompta.

> Information supersédée dans la première version du guide.
> CalyCompta reconnaît déjà l’identifiant et le titre. La lecture du nombre
> pour le contrôle **Valid.** dépend du projet CalyCompta.

Les règles CalyCompta `dev` et `main` acceptent ces champs à la création.
Les règles `dev` autorisent aussi un membre du club à lire les opérations,
leurs inscriptions, les séances piscine, leurs présences et les sites de
plongée nécessaires à l’affichage enrichi ; aucun changement de règle n’est
requis.
Sur `main`, la liste des champs modifiables par un membre exclut les champs
d’activité. L’action de retrait ici s’applique au formulaire avant envoi.

## Vérification en DEV

Créez trois demandes avec un compte membre DEV. Envoyez-en une sans activité,
une avec activité sans nombre et une avec activité et nombre. Essayez aussi
de retirer un lien après avoir saisi un nombre, puis envoyez la demande.
Vérifiez les champs dans le document canonique et dans sa copie historique
si le miroir DEV est actif.
Sélectionnez également une séance **Piscine** et vérifiez qu’elle enregistre
`piscine_session_id` sans `operation_id`.
