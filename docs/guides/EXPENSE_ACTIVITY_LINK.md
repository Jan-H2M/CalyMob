# Lier une demande de remboursement à une activité

Dans CalyMob, ouvrez **Remboursements → Nouvelle demande**. Le champ
**Activité** est facultatif et affiche **Pas liée à une activité** par défaut.
La liste propose les événements ouverts, clôturés ou annulés des 60 derniers
jours et des 7 prochains jours. Les événements que vous organisez ou auxquels
vous êtes inscrit apparaissent en premier. La recherche filtre leurs titres.

Une fois l’activité sélectionnée, le champ **Nombre de plongeurs** reste
facultatif. Pour retirer le lien avant l’envoi, rouvrez **Activité** et
choisissez **Pas liée à une activité**. Le nombre saisi est alors effacé.

## Données échangées avec CalyCompta

| Champ | `expense_claims` | `demandes_remboursement` |
| --- | --- | --- |
| Identifiant de l’activité | `operation_id` | `operation_id` |
| Titre de l’activité | `operation_title` | `operation_titre` |
| Nombre de plongeurs | `nombre_plongeurs` | `nombre_plongeurs` |

CalyMob écrit la demande dans `expense_claims`. La Cloud Function
`mirrorCanonicalToLegacy` recopie les champs lorsque `sync.enabled` et
`sync.canonicalToLegacy` sont actifs. Les nouveaux champs sont omis si la
demande n’a pas d’activité. Si le nombre est vide, son champ est omis aussi.
CalyCompta reconnaît déjà l’identifiant et le titre. La lecture du nombre
pour le contrôle **Valid.** dépend du projet CalyCompta.

Les règles CalyCompta `dev` et `main` acceptent ces champs à la création.
Sur `main`, la liste des champs modifiables par un membre exclut les champs
d’activité. L’action de retrait ici s’applique au formulaire avant envoi.

## Vérification en DEV

Créez trois demandes avec un compte membre DEV. Envoyez-en une sans activité,
une avec activité sans nombre et une avec activité et nombre. Essayez aussi
de retirer un lien après avoir saisi un nombre, puis envoyez la demande.
Vérifiez les champs dans le document canonique et dans sa copie historique
si le miroir DEV est actif.
