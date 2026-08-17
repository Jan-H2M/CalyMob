# CalyMob releasewachtrij

Deze lijst bundelt afgeronde mobiele wijzigingen tot Jan een gezamenlijke
App Store- en Play Store-release goedkeurt. Een merge naar `main` publiceert
de app niet en wijzigt de Firestore-appversie niet.

Payment-ledger wijzigingen volgen het canonieke contract in
[`docs/PAYMENT_LEDGER_ARCHITECTURE.md`](./PAYMENT_LEDGER_ARCHITECTURE.md) en
de gedeelde CalyCompta-documentatie. Voeg iedere mobiele betaalwijziging hier
toe vóór merge.

Deze wijzigingen zijn geen release totdat accounting/auth/rules-review en
end-to-end Firestore-tests afgerond zijn. Geen versie- of deployactie vanuit
deze wachtrij zonder aparte goedkeuring.

## Huidige productieversie

`1.20.0+197` staat op Android in productie. Dezelfde build is naar App Store
Connect verzonden en staat daar op `WAITING_FOR_REVIEW` (build `197`, valid).
De Firestore-sleutel `settings/app_version` wordt pas bijgewerkt nadat iOS
ook live is. Daarna worden `version: 1.20.0` en
`minSupportedVersion: 1.20.0` samen gepubliceerd; zo worden oude mobiele
versies bij betaalacties uitgefaseerd zonder een Store-review te omzeilen.
Gebruik na de Apple-goedkeuring:
`node scripts/update_firestore_version.cjs 1.20.0 197 1.20.0`.

## Volgende release

Basisversie: `1.20.0+197`

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

| COM-044 | Cloud Functions respecteren `member_status` als canonieke ledenstatus; legacyvelden zijn alleen fallback tijdens de migratie | Cloud Functions | 10 gerichte tests en 115 volledige functiontests | Middel | Deploy na review |

| PAY-LEDGER-2026-08-17 | Canonieke payment ledger, server-only betaalcommando's, Gozo-installmentcompatibiliteit, historische Zeeland/Gozo-reparaties en fail-closed legacy Noda-routes | Android + iOS + Cloud Functions + Firestore rules | 8 ledger-tests, 5 Function-tests, 11 Flutter-tests, build-check, live Zeeland/Gozo-invariant-audit | Hoog | Android productie; iOS `WAITING_FOR_REVIEW`; app-version publicatie na iOS-live |

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
- Diverses améliorations de stabilité et de suivi des signalements.

## Releasepoort

Voor verzending naar de stores:

1. alle opgenomen PR's moeten op `main` staan;
2. Flutter-analyse en tests moeten slagen of een gedocumenteerde baseline hebben;
3. Android- en iOS-builds moeten slagen;
4. Jan keurt versie, platformen en definitieve Franse releasenotes goed;
5. de Firestore-appversie wordt pas gepubliceerd nadat beide stores live zijn.
