# CalyMob releasewachtrij

Deze lijst bundelt afgeronde mobiele wijzigingen tot Jan een gezamenlijke
App Store- en Play Store-release goedkeurt. Een merge naar `main` publiceert
de app niet en wijzigt de Firestore-appversie niet.

## Volgende release

### Nog niet uitgebracht — lokale branch COM-065 (2026-08-31)

- Automatisch voorgestelde duiknummers krijgen een expliciete voorlopige aanduiding,
  ook in het dictatieoverzicht; handmatige nummers behouden hun bestaande gedrag.
- Branch `codex/bug-COM-065-provisional-number`; zie
  [COM-065 dossier](bug-cycle/COM-065-2026-08-31.md).
- Zes gerichte tests geslaagd; gerichte analyzer zonder issues. Visuele/functional
  review op toestel en volledige batchvalidatie blijven vereist vóór store-release.
- Geen persoonlijke tellers gerepareerd, geen backend/data aangepast, niet gemerged.

Basisversie: `1.17.0+194`

| Referentie | Wijziging | Platform | Validatie | Risico | Status |
|---|---|---|---|---|---|
| MOB-014 | Vanuit Activiteiten een interessepeiling in het algemene clubkanaal starten | Android + iOS | Flutter-analyse en tests | Laag | Releasewachtrij |
| MOB-015 | “Bug melden” hernoemen en verplaatsen naar “Remarque ou amélioration”; afmelden blijft onder instellingen | Android + iOS | Flutter-analyse en tests | Laag | Releasewachtrij |
| Technisch | Oude Linear Cloud Function en Linear-velden uit nieuwe bugrapporten verwijderen | Backend + Android + iOS | Function-loadcheck en Flutter-tests | Laag | Releasewachtrij |
| Locaties | Bij het maken van een activiteit alleen locaties tonen die in CalyCompta beschikbaar zijn gemaakt | Android + iOS | Modeltest, Flutter-analyse en volledige tests | Laag | Releasewachtrij |
| COM-048 | Duikplaatszoekfunctie zoekt accentongevoelig op naam, land, zone, type en aliassen met vaste rangschikking | Android + iOS | Utilitytest, Flutter-analyse en volledige tests | Laag | Releasewachtrij |
| COM-050 | Makers zien hun eigen eventbrouillons privacyvast in de activiteitenlijst, met een duidelijk Brouillon-label | Android + iOS | 3 regressietests, 370 volledige tests, Flutter-analyse en Android-debugbuild | Laag | Releasewachtrij |
| COM-055 | Gedeelde duiken bevestigen zonder duplicaat en opmerkingen gecontroleerd toevoegen aan een bestaand carnetrecord | Android + iOS + Cloud Function | 23 gerichte tests, 111 functiontests, 370 Fluttertests, analyse en Android-debugbuild | Laag | Releasewachtrij |
| COM-054 | Nieuwe activiteiten starten met betaling verplicht, bevestiging na betaling, alleen QR per e-mail, drie dagen betaaltermijn en automatische annulering | Android + iOS | Gerichte regressietest, 371 Fluttertests en Android-debugbuild | Laag | Releasewachtrij |
| MOB-016 | Betaalstatus wordt transactioneel tegen de actuele activiteitinstellingen gevalideerd, zodat een verouderd scherm geen betaling ter plaatse meer kan opslaan | Android + iOS | 4 gerichte regressietests, 375 Fluttertests, gerichte analyse en Android-debugbuild | Laag | Releasewachtrij |
| MOB-011 | Een expliciete notificatie-opt-out blijft behouden bij login, app-resume en FCM-tokenrotatie; alleen de gebruiker kan opnieuw inschakelen | Android + iOS | 3 gerichte regressietests, 379 Fluttertests, gerichte analyse en Android-debugbuild | Laag | Releasewachtrij |
| MOB-013 | Web- en e-maillinks in eventdiscussies openen opnieuw vanuit Markdown-berichten, met blokkering van onveilige URI-schema’s | Android + iOS | 3 gerichte regressietests, 382 Fluttertests, gerichte analyse en Android-debugbuild | Laag | Releasewachtrij |
| COM-045 | Leden kunnen bij een volle of gesloten inschrijving op de wachtlijst komen en die weer verlaten; wachtenden tellen niet mee als deelnemer | Android + iOS | 2 gerichte regressietests, Flutter-analyse en Android-debugbuild | Middel | Releasewachtrij |

## Voorgestelde Franse releasenotes

- Vous pouvez désormais lancer un sondage d’intérêt depuis les activités.
- Le parcours « Remarque ou amélioration » a été clarifié et déplacé dans le profil.
- La création d’une activité respecte désormais les lieux activés dans CalyCompta.
- La recherche de lieux de plongée est désormais plus complète et plus fiable.
- Vos brouillons d’événements sont désormais visibles et clairement identifiés dans la liste des activités.
- Les plongées partagées peuvent être confirmées sans doublon, avec un choix clair pour reprendre les remarques.
- Les nouvelles activités utilisent désormais automatiquement les règles de paiement du club.
- Un mode de paiement désactivé ne peut plus être enregistré depuis un écran resté ouvert.
- Votre choix de désactiver les notifications reste désormais respecté après le retour dans l’application.
- Les liens dans les discussions d’événements s’ouvrent à nouveau correctement.
- Vous pouvez désormais rejoindre la liste d’attente lorsqu’une activité est complète ou que les inscriptions sont clôturées.
- Diverses améliorations de stabilité et de suivi des signalements.

## Releasepoort

Voor verzending naar de stores:

1. alle opgenomen PR's moeten op `main` staan;
2. Flutter-analyse en tests moeten slagen of een gedocumenteerde baseline hebben;
3. Android- en iOS-builds moeten slagen;
4. Jan keurt versie, platformen en definitieve Franse releasenotes goed;
5. de Firestore-appversie wordt pas gepubliceerd nadat beide stores live zijn.
