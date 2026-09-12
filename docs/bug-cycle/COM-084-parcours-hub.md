# COM-084 — Parcours-hub voor carnet en formation

## Status

- Ticket: COM-084 (`BKw6Mf52Ox5ZTBYuae0o`)
- Analyse-revisie goedgekeurd door Jan: `b4280422-0ecd-48f8-9b4c-f1b76c3ac0f5`
- Werkbranch: `codex/bug-COM-084-parcours-hub`
- Scope: CalyMob en bijbehorende training-callables; geen deploy,
  storebuild of app-versie-publicatie in deze branch

## Probleem

De functies rond het persoonlijke duikparcours waren verspreid over het
`Mon carnet`-scherm: carnet, open bevestigingen, LIFRAS-progressie,
papieren kaart en statistieken zaten als losse header-iconen bij elkaar. Dat
maakte het scherm druk en gaf geen duidelijke plaats voor nieuwe
opleidingstaken en evaluaties.

## Oplossing

- De landing-tile `Mon carnet` is vervangen door `Parcours`.
- `Parcours` opent een nieuwe centrale hub met duidelijke kaarten voor:
  - `Mon carnet`
  - `Plongées à confirmer`
  - `Mes exercices`
  - `Mes demandes`
  - `Actions & évaluations`
  - `Statistiques`
  - `Reprendre ma carte papier`
- De kaarten `Plongées à confirmer` en `Actions & évaluations` tonen een badge
  wanneer er werk openstaat.
- `Mon carnet` blijft het pure logboekscherm en houdt alleen de bestaande
  add-dive actie; de oude header-shortcuts zijn weggehaald.
- `CommunicationHubScreen` kan nu optioneel rechtstreeks openen op de filter
  `Actions`, zodat de Parcours-hub niet eerst alle communicatie toont.

## Volledige evaluatieworkflow

- Een leerling kan vanuit `Mes exercices` een evaluatie aanvragen met één
  oefening, een eigen zwembad- of duikregel uit het carnet en een bevoegde
  MC/MF/MN-monitor met Encadrantstatus.
- `requestExerciseEvaluation` controleert die keuzes server-side en maakt de
  claim en monitortaak atomisch met een deterministische identiteit. Dubbel
  tikken en transactionele retries maken geen dubbele aanvragen.
- `decideExerciseEvaluation` bewaart `acquis`, `en_progres` of `a_revoir` in
  een officiële observatie. Dezelfde monitor kan via de tab `Fait` zijn eigen
  historische beslissing corrigeren; elke wijziging verhoogt de revisie en
  actualiseert dezelfde observatie.
- Evaluatietaken volgen het beperkte schema van drie herinneringen (dag 3, 8
  en 12) en escaleren pas op dag 14.
- Buddybevestigingen gebruiken één deterministische aggregatietaak per lid.
  Gelijktijdige triggers kunnen daardoor geen dubbele open taak meer maken;
  oudere toevallige dubbels worden afgesloten en blijven als historiek staan.

## Validatie

- `flutter analyze --no-fatal-infos --no-fatal-warnings lib/screens/training/parcours_hub_screen.dart lib/screens/home/landing_screen.dart lib/screens/communication/communication_hub_screen.dart lib/screens/training/mon_carnet_screen.dart test/screens/parcours_hub_screen_test.dart`
- `flutter test test/screens/parcours_hub_screen_test.dart`
- `flutter test --no-pub test/screens/parcours_hub_screen_test.dart test/screens/actions_evaluations_screen_test.dart test/screens/evaluation_request_screen_test.dart test/services/exercise_claim_evaluation_test.dart`
- `jest src/training/evaluationRequests.test.js src/training/onBuddyConfirmationTask.test.js src/training/processFormationTaskReminders.test.js --runInBand`
- volledige Functions- en Flutter-regressies

Alle vermelde controles slagen in de tijdelijke worktree.

## Release-opmerking

Deze wijziging staat in de mobiele releasewachtrij. Publicatie vereist eerst de
twee nieuwe callables (`requestExerciseEvaluation` en
`decideExerciseEvaluation`), daarna de bijbehorende CalyMob-versie. Er is geen
deploy, version bump, Android/iOS build, upload naar stores of Firestore
`app_version`-wijziging uitgevoerd.

## Integratiecontrole — 12 september 2026

- De oorspronkelijke wijziging is opnieuw toegepast op mobiele `main`
  `c0ace3e`, na de recente communicatie- en notificatieverbeteringen.
- `CommunicationHubScreen(initialActionsOnly: true)` bestond inmiddels al op
  `main`; de actuele filtertabs en notificatiehistoriek zijn ongewijzigd
  behouden.
- Gerichte Flutter-analyse en de Parcours-, formation-, oefeningen- en
  communicatiefiltertests slagen samen.
- De onafhankelijke herreview gaf een merge-GO na reparatie van een dubbele
  buddybevestiging in de generieke Actions-lijst; visuele browser-QA blijft de
  laatste poort vóór samenvoegen naar `main`.

## Nieuwe bugs gescand tijdens deze ronde

Jan vroeg tijdens COM-084 om ook nieuwe bugs te bekijken. De nieuwe tickets
zijn read-only bekeken en niet in deze branch gefixt:

- COM-088 — blocking, `linking does not work again !!!`; screenshot wijst op
  Ponto/betalingslinking en lijkt functioneel samen te hangen met COM-087.
- COM-089 — planning piscine: kandidaat-groep/instructeurs, créneau gonflage
  en notificaties bij functietoewijzing; waarschijnlijk opsplitsen of als
  gezamenlijke planning-oplossing behandelen.
- COM-090 — uitschrijven van Croisette 12/09; lijkt te raken aan mobiele
  event-inschrijving/annulatie en mogelijk aan de betaalflowtickets.

Volgende prioriteit na COM-084: de oudste goedgekeurde tickets/clusters eerst,
met COM-088 als blocking item bovenaan en COM-087 als waarschijnlijke gekoppelde
analyse.
