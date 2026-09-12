# COM-084 — Parcours-hub voor carnet en formation

## Status

- Ticket: COM-084 (`BKw6Mf52Ox5ZTBYuae0o`)
- Analyse-revisie goedgekeurd door Jan: `b4280422-0ecd-48f8-9b4c-f1b76c3ac0f5`
- Werkbranch: `codex/bug-COM-084-parcours-hub`
- Scope: CalyMob, geen backenddeploy, geen storebuild, geen app-versie-publicatie

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

## Validatie

- `flutter analyze --no-fatal-infos --no-fatal-warnings lib/screens/training/parcours_hub_screen.dart lib/screens/home/landing_screen.dart lib/screens/communication/communication_hub_screen.dart lib/screens/training/mon_carnet_screen.dart test/screens/parcours_hub_screen_test.dart`
- `flutter test test/screens/parcours_hub_screen_test.dart`

Beide controles slagen in de tijdelijke worktree.

## Release-opmerking

Deze wijziging staat in de mobiele releasewachtrij. Er is geen version bump,
geen Android/iOS build, geen upload naar stores en geen Firestore
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
