# Carnet de Formation — Catalogue des situations, rôles & messages

> But de ce document : lister **toutes** les situations possibles du système Carnet,
> avec à chaque fois le rôle concerné, la tâche créée, la fiche affichée dans
> l'app, le titre, la notification, et les effets en aval.
> C'est la base pour construire un écran d'aperçu (« galerie ») qui permet de
> tester chaque cas sans attendre un vrai événement.
>
> Statut : inventaire du code au 2026-06-18 (inclut la nouvelle fiche encadrant piscine).

---

## 0. Vue d'ensemble — les briques

| Brique | Rôle |
|---|---|
| `formation_tasks/{id}` | la file de tâches qui alimente l'inbox de chaque membre |
| `pool_checkin` | check-in après une séance piscine |
| `logbook_completion` | compléter son carnet après une sortie |
| `monitor_observation` | évaluation holistique d'un élève par le validateur (clôture piscine) |
| `monitor_validation` | valider un exercice déclaré par un élève |
| `external_proof_review` | examiner une preuve externe (autre club / brevet papier) |
| `historical_validation` | vérifier une carte papier existante |
| `logbook_dive_confirmations/{id}` | confirmation de plongée entre binômes (collection à part, pas une formation_task) |

**Types de fiches (écrans) référencés via `target_screen` :**
`pool_checkin` · `logbook_entry` · `monitor_observation` · `monitor_validation` · `external_proof_review`

---

## 1. Séance PISCINE

**Déclencheur :** un membre scanne à l'entrée → un `attendee` est créé → la fonction
`onPiscineAttendeeCreated` décide quelle tâche créer.

| # | Situation / rôle | Condition | Tâche créée | Fiche | Titre | En aval |
|---|---|---|---|---|---|---|
| P1 | **Élève en formation** | `formation_active=true`, `plongeur_code` → niveau cible (NB→1★, P1→2★…) ; un cours existe pour ce niveau | `pool_checkin` (élève) | PoolCheckin élève | « Piscine à compléter — Formation 2★ » | voir P1a/b/c |
| P1a | ↳ il choisit **Formation** | outcome=`training` | — | — | — | à la clôture : entrée carnet + tâche `monitor_observation` au validateur |
| P1b | ↳ il choisit **Service** | outcome=`service_only` | — | — | — | rien (pas de carnet) |
| P1c | ↳ il choisit **Nage libre** | outcome=`nage_libre` | — | — | — | rien |
| P2 | **Encadrant — 1 groupe** *(nouveau)* | le membre est dans `encadrants[]` d'un cours | `pool_checkin` `role=encadrant` | PoolCheckin **encadrant** | « Piscine encadrant à compléter » | outcome=`encadrant` → rapport sur l'attendee, **pas** d'entrée carnet |
| P3 | **Encadrant — plusieurs groupes** *(nouveau)* | membre encadrant de ≥2 cours le même soir | idem, `encadrant_groups[]` multiple | idem, liste à cocher | idem | idem |
| P4 | **Encadrant — aucun groupe retrouvé** *(edge)* | role=encadrant mais `encadrant_groups` vide | idem | idem, message « ajoute une remarque » | idem | idem |
| P5 | **Pas de cours pour son niveau** | aucun cours planifié pour le niveau cible | `pool_checkin` `status=blocked`, assignée à un admin | (vue admin) | « Piscine à compléter — pas de groupe Formation X planifié » | un responsable assigne manuellement |
| P6 | **Moniteur sans rôle ce soir** | `plongeur_code`=AM/MC/MF/MN sans override **et** pas encadrant | **aucune tâche** (skip) | — | — | — |
| P7 | **Membre non-formation** | `formation_active=false` (garde temporaire) et pas encadrant | **aucune tâche** (skip) | — | — | — |
| P8 | **Séance introuvable** | doc session absent | `pool_checkin` `status=blocked` | (vue admin) | « …pas de groupe planifié » | — |

**Clôture de la séance** (`onPoolSessionClosed`, chef d'école passe la séance en `closed`) :

| # | Situation | Condition | Tâche créée | Fiche | Titre |
|---|---|---|---|---|---|
| P9 | **Validateur d'un groupe** | élève avec outcome=`training` + `validatorId` résolu | `monitor_observation` (au validateur) | MonitorObservation | « Évaluer {nom} (2★ {thème}) » |
| P10 | Élève sans validateur résolu | training mais aucun validateur | **rien** (warn) + aucune entrée carnet | — | — |

---

## 2. SORTIE / PLONGÉE

**Déclencheur :** une opération passe en « terminée » → `onOperationFinished`.

| # | Situation / rôle | Condition | Tâche créée | Fiche | Titre | Remarque |
|---|---|---|---|---|---|---|
| S1 | **Participant (plongeur)** | participant confirmé + `formation_active=true` | `logbook_completion` | logbook_entry | « Carnet {sortie} à compléter » | palanquée pré-remplie ; **DP / serre-file auto** depuis `palanquee.planned_role[userId]` |
| S2 | Participant non confirmé | statut ≠ confirmé/présent | aucune tâche | — | — | — |
| S3 | Participant non-formation | `formation_active=false` | aucune tâche | — | — | — |
| S4 | **Encadrant / moniteur de la sortie** | il plonge aussi → traité comme S1 | `logbook_completion` | logbook_entry | idem | ⚠️ **pas** de fiche encadrant dédiée : il log sa propre plongée. Son rôle de validateur passe par les claims (§3) |

**Déclencheur :** l'instructeur planifie des exercices sur une palanquée → `onPalanqueeSaved`.

| # | Situation | Condition | Effet |
|---|---|---|---|
| S5 | Exercices planifiés pour des plongeurs | `planned_exercises` non vide + `monitor_validator_id` | crée des `exercise_claims` **DRAFT** pré-remplis (l'élève confirmera après la plongée) |

**Déclencheur :** un membre enregistre une plongée avec des binômes Calypso → `onLogbookDiveBuddiesChanged`.

| # | Situation / rôle | Condition | Effet | Notification |
|---|---|---|---|---|
| S6 | **Binôme à confirmer** | la plongée liste des membres dans `binomes[]` | crée `logbook_dive_confirmations` (statut pending) | push : « {X} vraagt je duik te bevestigen » → réponse (copier / identique / remplacer / refuser) |
| S7 | Résultat de confirmation | le binôme répond | met à jour la confirmation | push retour à l'émetteur : « {X} heeft je duik beantwoord » |

---

## 3. DÉCLARATION & VALIDATION D'EXERCICES

**Déclencheur :** un `exercise_claim` est soumis (`status=submitted`) → `onClaimSubmitted`.

| # | Situation / rôle | Condition | Tâche créée | Fiche | Titre | Assigné à |
|---|---|---|---|---|---|---|
| E1 | **Moniteur Calypso valide** | `validation_mode=calypso_monitor` | `monitor_validation` | monitor_validation | « Valider exercice {code} ({nom}) » | claim.monitor_id → settings → chef palanquée → 1er admin |
| E2 | **Preuve externe à examiner** | `validation_mode=external_monitor` | `external_proof_review` | external_proof_review | « Examiner preuve externe {code} ({nom}) » | reviewer configuré → 1er admin |
| E3 | Record perso / binôme | `buddy_only` / `personal_only` | aucune tâche | — | — | — |
| E4 | **Carte papier à vérifier** | l'élève déclare des exercices d'une carte papier existante | `historical_validation` | (à confirmer) | « Carte papier » | un moniteur vérifie la carte physique |

---

## 4. RAPPELS & NOTIFICATIONS

| # | Situation | Mécanisme | Note |
|---|---|---|---|
| N1 | Tâche ouverte non traitée | `processFormationTaskReminders` (planifié) | **max 1 push / membre / jour**, et cap 1 par séance piscine |
| N2 | Confirmation de plongée | push direct (voir S6/S7) | textes en NL |

---

## 5. Matrice « dans quel rôle suis-je ? » (pour Jan)

Les cas que **tu** peux rencontrer selon ton rôle du soir :

| Ton rôle | Fiche que tu reçois | Scénario |
|---|---|---|
| Tu plonges en formation (piscine) | PoolCheckin élève | P1 |
| Tu es encadrant piscine | PoolCheckin **encadrant** | P2/P3/P4 |
| Tu es en service (accueil/gonflage) sans cours | PoolCheckin élève → « Service » | P1b |
| Tu valides un groupe (clôture piscine) | MonitorObservation | P9 |
| Tu participes / encadres une sortie | logbook_entry (avec DP auto) | S1/S4 |
| On te demande de confirmer une plongée commune | confirmation binôme | S6 |
| Un élève déclare un exercice que tu dois valider | monitor_validation | E1 |
| Une preuve externe t'est assignée | external_proof_review | E2 |

---

## 6. Prochaine étape proposée

À partir de ce catalogue, construire un **écran « Galerie d'aperçu »** (dev only) dans
CalyMob qui liste ces scénarios et, au tap, ouvre la vraie fiche avec des données
fictives — pour voir le rendu sans attendre un vrai événement ni être dans le bon rôle.

Cas faciles (fiche autonome, mock léger) : **P1, P1a-c, P2, P3, P4** (PoolCheckin).
Cas plus lourds (la fiche lit Firestore : palanquée, claims…) : **S1, P9, E1, E2** —
nécessitent soit un mock de provider, soit un mode « données injectées ».

---

## 7. Décisions de design (2026-06-19)

Décisions prises avec Jan pendant la revue des maquettes. À implémenter quand on
passera au code (rien de tout ceci n'est encore dans l'app, sauf le bouton turquoise).

### Fiche piscine
- **Pas d'outcome « Apnée »** — on reste sur Formation / Service / Nage libre.
- **« Groupe suggéré » est modifiable** : la suggestion (déduite du `plongeur_code`)
  n'est qu'un défaut ; la section « Dans quel groupe étais-tu ? » permet de corriger.
- **Échappatoire encadrant → élève** : sur la fiche encadrant, lien « Je n'étais pas
  encadrant ce soir » qui bascule vers le choix normal (planning peut avoir changé).
- **Échappatoire élève → encadrant, à partir de 3★ seulement** : un plongeur ≥ 3★
  peut avoir encadré un groupe non prévu au planning → lien « J'ai aussi encadré un
  groupe » avec saisie manuelle (niveau + thème). Masqué en dessous de 3★.

### Modèle de responsabilités — partagé (révise décision 1)
- **L'élève remplit les faits** : présence + groupe + ce qu'il a fait. Ça crée
  **son** entrée carnet, statut « en attente de validation ». Le carnet est son
  document → c'est lui le propriétaire.
- **L'encadrant ajoute le verdict** (A/P/R + commentaire) via un roster, par-dessus.
  Le verdict fait passer les entrées à « validé par moniteur ».
- **Découplage = pas de point de blocage** : si l'encadrant oublie/ne fait rien,
  l'entrée de l'élève reste (statut « en attente »), rien n'est perdu. La validation
  peut venir plus tard (ou via QR/claim). Le verdict est une couche, pas une condition.

### Déclenchement de la tâche encadrant — différé
- L'encadrant **ne reçoit PAS sa tâche tout de suite**. Elle se déclenche **quand la
  plupart des élèves de son groupe ont rempli** leur fiche, pour qu'il valide tout
  son roster en une seule passe (pas au compte-gouttes).
- Seuil à fixer (p.ex. ≥ ~70 % du groupe, ou à la clôture de séance / lendemain matin
  comme filet de sécurité). + rappel si l'encadrant ne valide pas.

### Roster de validation (remplace `monitor_observation` par élève)
- Au lieu d'**une tâche séparée par élève**, l'encadrant a **un seul écran roster**
  de son groupe, **auto-rempli à partir des élèves qui se sont déclarés dans sa
  groupe** (+ ajout manuel d'un élève oublié, ajustement présent/absent).
- Par élève, en un geste : **verdict** (A = Acquis / P = En progrès / R = À revoir)
  + **commentaire optionnel** (popup par personne, icône qui se colore si note).
- Un seul « Enregistrer le groupe » → pose le verdict sur l'entrée carnet de chaque
  élève (~1 s/élève).
- Le roster se branche sur la fiche encadrant (P2).
- **Photo de profil ronde par élève** dans le roster (la vraie photo du membre,
  rognée en cercle) — pas d'initiales.
- **Granularité** : verdict grossier par élève par soirée suffit pour la piscine.
  La validation fine **par exercice** (LIFRAS) reste l'exception, via le flux claim
  ou le QR « reprise de carte papier ».

### Source du roster & édition
- **Le planning est la source par défaut** : le roster est pré-rempli à partir des
  élèves assignés au groupe dans le planning.
- **PRÉREQUIS** ⚠️ : aujourd'hui le planning n'assigne par groupe que les
  **encadrants + un thème** ; les élèves y sont en **texte libre**. Il faut ajouter,
  côté CalyCompta, une **assignation structurée élève → groupe** (vrais membres liés).
  Sans ça, le roster ne peut pas être pré-rempli depuis le planning.
- **Les deux peuvent ajuster** : l'élève peut changer son groupe dans sa check-in,
  l'encadrant peut ajouter/retirer/déplacer dans son roster (le planning change
  souvent le soir même).
- **L'encadrant a le dernier mot** : son roster est autoritaire pour la validation ;
  l'auto-placement de l'élève n'est qu'une proposition / pré-remplissage.
- **Élève oublié (n'a rien rempli)** : quand l'encadrant l'ajoute à son roster, ça
  **crée une mini-entrée carnet** (présent + groupe + thème + verdict). L'élève reçoit
  une notif « ta séance est validée — complète les détails » et peut l'enrichir plus
  tard. Rien n'est perdu, la flow reste rapide.

### QR (rappel du fonctionnement existant)
- Le QR sert à la **reprise de carte papier** (`historical_validation`) : l'élève
  présente un QR, le moniteur le scanne et valide tout le lot d'un coup. Ce n'est pas
  le mécanisme des exercices piscine courants.

### Sortie / plongée — validation (même modèle partagé)
- **Même principe que la piscine** : l'élève déclare d'abord ce qu'il a fait, puis
  l'encadrant confirme. La grille de l'encadrant est la **couche de confirmation**,
  **pré-remplie avec ce que les élèves ont déclaré** (pas de saisie à blanc).
- **Granularité = par exercice** : une plongée est l'endroit où les **exercices
  LIFRAS** s'officialisent.
- **Layout = liste, PAS une matrice** : pour chaque élève, on liste **l'exercice
  (ou les exercices) qu'il a déclaré(s)**, et à côté de chaque exercice les **3 boutons
  A / P / R** (acquis / en progrès / à revoir — les 3 mêmes verdicts que la piscine).
  Un élève qui a déclaré 3 exercices = 3 lignes. Pas de cases vides : on ne montre que
  ce que l'élève a déclaré.
  - Ex. : « Sophie — Remontée assistée [A][P][R] », « Marc — Lâcher-reprise [A][P][R] ».
- **L'encadrant a le dernier mot** : il peut confirmer, rétrograder, ou ajouter un
  exercice non déclaré. Un seul « Enregistrer la palanquée ».
- **Oubli = pas de perte** : exercices déclarés mais non validés restent « en
  attente » (comme la piscine).
- **Pas de prérequis ici** : la palanquée est **déjà structurée** (membres +
  `planned_exercises` + `monitor_validator_id`, via `onPalanqueeSaved`). Contrairement
  à la piscine, rien à ajouter côté données.
- Remplace le ping-pong d'**une tâche `monitor_validation` par claim** par **une
  grille par palanquée**.
- **Côté élève (déclaration)** : après la plongée, l'élève coche dans sa fiche les
  exercices qu'il a faits (pré-listés depuis le plan de la palanquée, + ajout depuis
  le catalogue LIFRAS). Ça crée des déclarations `statut: a_valider` qui remontent
  comme points turquoise « à valider » dans la grille de l'encadrant. La boucle :
  **élève déclare → encadrant confirme**.

### Décisions techniques (implémentation)
- **Sortie — réutiliser `exercise_claims`** : la déclaration élève + la grille de
  validation s'appuient sur la chaîne existante (draft → submitted → accepted). Pas
  de nouvelle structure ; compatible avec les flux claim + QR existants.
- **Piscine — verdict sur la `student_logbook_entries`** : le verdict (acquis /
  en progrès / à revoir) + commentaire sont des champs sur l'entrée carnet de la
  séance. L'élève remplit les faits, l'encadrant ajoute le verdict. Remplace la
  tâche `monitor_observation`.
- **Trigger de la tâche encadrant = horaire fixe, le lendemain matin** (piscine et
  sortie). Prévisible et simple ; pas de logique de seuil. + rappels ensuite si pas
  validé.
- **Transition = couper les tâches par-pièce** : dès que le roster/grille groupé est
  live, on arrête de créer les `monitor_observation` (par élève) et `monitor_validation`
  (par claim) individuels. Remplacement propre, pas de double tâche.

### Assignation élève → groupe dans le planning (CalyCompta)
- **Nouveau champ `eleves[]`** (membres liés) sur chaque groupe (`LevelCourse`) —
  aujourd'hui il n'y a que les encadrants + thème, les élèves sont en texte libre.
- **Auto-suggestion par niveau-cible** : le planning propose automatiquement les
  plongeurs de ce niveau (via `computeTargetLevel`, donc 1★→Formation 2★ etc. ;
  moniteurs AM/MC… exclus). C'est un **point de départ**, pas une liste figée.
- **Groupes parallèles (Groupe 1 / Groupe 2) : PAS de split dans le planning.**
  L'élève choisit lui-même son groupe dans sa check-in (le sélecteur « Groupe 1/2 »
  existe déjà dans `pool_checkin_screen.dart`). Le roster de l'encadrant = ceux qui
  ont déclaré son niveau + son n° de groupe ; l'encadrant a le dernier mot.
- **Absents / no-shows** : l'auto-suggestion peut lister des absents, mais la présence
  réelle est confirmée par la check-in élève / le roster encadrant le soir même.

### ⚠️ Sécurité cross-app (CalyMob ↔ CalyCompta)
Backend partagé : un changement de Cloud Function ou de forme de données peut casser
l'autre app. Règles pour ce chantier :
- **Avant tout changement** d'une function ou d'un champ : grep dans **les DEUX** apps
  (CalyMob + CalyCompta) qui lit/écrit ce champ/cette collection, et lister l'impact.
- **Additif d'abord** : ajouter de nouveaux champs / comportements à côté ; ne jamais
  supprimer ou changer la forme d'un champ existant d'un coup.
- **Couper les anciennes tâches `monitor_observation`/`monitor_validation` = en
  DERNIER**, de façon coordonnée sur les deux apps, une fois la nouvelle flow validée
  des deux côtés (la web-admin a des écrans bâtis dessus).
- **Aucun deploy functions / firestore rules sans go explicite de Jan**, diff en revue
  d'abord. Attention aux triggers (risque de tempête de push).

**Constat cross-app (2026-06-19)** ⚠️ : `CalyCompta/src/me/PoolCheckinForm.tsx` est la
version WEB de la check-in et ne connaît que `outcome` ∈ {training, service_only,
nage_libre} — **pas `role: 'encadrant'`**. Donc :
- Les champs ajoutés (`context.role`, `context.encadrant_groups`, `outcome:'encadrant'`)
  sont **additifs → ne cassent pas** la lecture web (et `onPoolSessionClosed` filtre
  `outcome==='training'`, donc l'encadrant est naturellement exclu du fan-out).
- MAIS une tâche encadrant ouverte sur le web afficherait le **mauvais formulaire**
  (chooser élève). → **Avant de déployer la branche encadrant de
  `onPiscineAttendeeCreated`**, soit (a) faire gérer `role:'encadrant'` à
  `PoolCheckinForm.tsx`, soit (b) router les tâches encadrant vers le mobile uniquement.
- Statut : code mobile écrit, **non déployé**.
- ✅ **Gate web fermée (2026-06-19)** : `PoolCheckinForm.tsx` détecte désormais
  `role === 'encadrant'` et affiche un avis « à compléter dans l'app mobile » au lieu
  du formulaire élève (typecheck OK). Le déploiement de la branche encadrant des
  functions ne casse donc plus la web — il reste soumis au go explicite de Jan.

### État de release (2026-06-19)
- **Android 1.9.12 (versionCode 169) SOUMIS pour review** (track production, status
  `completed`, commit `10957918871778272408`). Auto-publish après approbation Google.
- iOS : ✅ **1.9.12 (169) SOUMIS pour App Store review** — soumission confirmée le
  2026-06-20 via fastlane (« Successfully submitted the app for review! 🎉 », auto-release
  après approbation Apple). PLA accepté ; certificat **Apple Distribution** créé
  (exp 2027/06/19, clé privée importée dans le trousseau) + profil
  **« CalyMob AppStore 169 »** généré et installé ; IPA exportée (signing manuel) et
  binaire uploadé sur App Store Connect, release notes posées, build traité par Apple
  puis soumis via fastlane. Tâche planifiée `calymob-ios-169-submit-when-processed`
  désactivée (mission accomplie).
- Functions encadrant : ✅ **DÉPLOYÉES le 2026-06-21**. Android 1.9.12 (169) confirmé
  LIVE (track production serving, status `completed`) + iOS 1.9.12 (169) approuvé par
  Apple (submission ID `475b7f6a-5641-49ae-a99a-c0a8d71a9b8c`, « eligible for
  distribution »). Deploy ciblé par nom :
  `firebase deploy --only functions:onPiscineAttendeeCreated,functions:onPoolCheckinCompleted`
  → « Successful update operation » pour les deux (europe-west1). Le travail non lié
  dans `functions/` n'a PAS été déployé (les 2 functions n'importent aucun util modifié ;
  les autres functions n'ont pas été reciblées). Tâche planifiée
  `calymob-169-golive-then-deploy-functions` désactivée (mission accomplie).

### ⚠️ Ordre de release (critique)
- **L'app mobile doit être en production AVANT de déployer la branche encadrant des
  functions.** Sinon, un encadrant reçoit une tâche `role:'encadrant'` que son app
  installée (sans la fiche encadrant) rend comme le formulaire élève — régression.
  Aujourd'hui les moniteurs ne reçoivent aucune tâche ; déployer avant la release
  changerait ça en mauvaise fiche.
- Séquence : (1) app → stores, (2) app approuvée + live, (3) deploy
  `onPiscineAttendeeCreated` + `onPoolCheckinCompleted` (ciblé par nom, jamais blanket).
- **Tree pollué (2026-06-19)** : du travail non commité non lié existe dans
  `functions/` (eventPaymentReminder, communicationTemplates, emailDelivery) et
  CalyCompta (OperationDetailView.tsx) — probablement Codex. Ne PAS déployer en bloc ;
  coordonner avant.

### UI globale
- **Bouton d'action principal uniformisé** : turquoise (`lichtblauw #6BCBE8`), texte
  bleu foncé (`donkerblauw`), pleine largeur. Appliqué via le thème global
  (`ElevatedButton` + `FilledButton`) dans `main.dart`. ✅ déjà en place.
  Les boutons à couleur explicite (vert « confirmé », rouge destructif) gardent la leur.
