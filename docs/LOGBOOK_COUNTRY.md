# Pays de la plongée — contrat et UX

## Décision canonique

`clubs/{clubId}/dive_locations/{locationId}.country` reste le pays canonique
du site. Une plongée conserve aussi une copie optionnelle dans
`clubs/{clubId}/student_logbook_entries/{entryId}.country`.

Cette copie est un snapshot historique et une override par plongée. Elle est
nécessaire pour les lieux libres, les imports XLSX/OCR, le mode hors ligne et
les partages avec un binôme. La relation vers le site reste `location_id`.

## Format et compatibilité

- stockage: ISO 3166-1 alpha-2 en majuscules (`BE`, `NL`, `HR`, `EG`);
- affichage: nom localisé + code, jamais un drapeau seul;
- langues du catalogue: français, néerlandais et anglais;
- champ facultatif: les anciennes plongées sans `country` restent valides;
- aucune migration destructive n'est requise;
- les anciens noms (`Belgique`, `Kroatië`, `Croatia`) sont normalisés à la
  lecture/import, mais une valeur inconnue n'est jamais enregistrée en silence.

## Comportement

Le choix d'un site connu pré-remplit son pays. Le plongeur voit cette valeur et
peut la modifier ou l'effacer uniquement pour la plongée. Un lieu saisi librement
ne déclenche aucune géolocalisation ni déduction implicite. Le sélecteur est
embarqué dans l'application, fonctionne sans réseau et place les pays récents,
puis `BE`, `NL` et `FR`, en tête.

Le pays est conservé par Firestore (y compris sa file d'écriture hors ligne),
les imports XLSX/OCR, le partage binôme, la recherche web et les exports. Les
statistiques mobiles regroupent les pays côté client, sans index Firestore.
