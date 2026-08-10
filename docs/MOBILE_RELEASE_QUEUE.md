# CalyMob releasewachtrij

Deze lijst bundelt afgeronde mobiele wijzigingen tot Jan een gezamenlijke
App Store- en Play Store-release goedkeurt. Een merge naar `main` publiceert
de app niet en wijzigt de Firestore-appversie niet.

## Volgende release

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

## Voorgestelde Franse releasenotes

- Vous pouvez désormais lancer un sondage d’intérêt depuis les activités.
- Le parcours « Remarque ou amélioration » a été clarifié et déplacé dans le profil.
- La création d’une activité respecte désormais les lieux activés dans CalyCompta.
- La recherche de lieux de plongée est désormais plus complète et plus fiable.
- Vos brouillons d’événements sont désormais visibles et clairement identifiés dans la liste des activités.
- Les plongées partagées peuvent être confirmées sans doublon, avec un choix clair pour reprendre les remarques.
- Les nouvelles activités utilisent désormais automatiquement les règles de paiement du club.
- Diverses améliorations de stabilité et de suivi des signalements.

## Releasepoort

Voor verzending naar de stores:

1. alle opgenomen PR's moeten op `main` staan;
2. Flutter-analyse en tests moeten slagen of een gedocumenteerde baseline hebben;
3. Android- en iOS-builds moeten slagen;
4. Jan keurt versie, platformen en definitieve Franse releasenotes goed;
5. de Firestore-appversie wordt pas gepubliceerd nadat beide stores live zijn.
