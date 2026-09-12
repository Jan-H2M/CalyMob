# CalyMob — geconsolideerde releasekandidaat

Dit document is de actuele releasebron voor de gezamenlijke CalyMob-release van
12 september 2026. Het vervangt de oude wachtrijstatussen in dit bestand; die
beschreven afzonderlijke branches en oudere versievoorstellen, niet de huidige
geïntegreerde kandidaat.

## Versie en bron

- Huidig in App Store en Play Store: **1.21.1+206**.
- Volgende kandidaat: **1.22.0+207**.
- Integratiebranch: `codex/integrate-calymob-ready-20260912`.
- Gevalideerde productcode loopt tot `c3705ee9afe7c0c8bfd022c1420d46e4bee77418`;
  de daaropvolgende wijziging aan dit document verandert geen productcode.
- De bron bevat nog `version: 1.21.1+206`. De bump naar `1.22.0+207` gebeurt als
  afzonderlijke releasehandeling vóór de ondertekende storebuilds.
- Niets uit deze kandidaat is door dit document naar `main`, Firebase of de
  stores gepubliceerd.

## Exacte inhoud van 1.22.0+207

| Onderdeel | Geconsolideerde inhoud |
|---|---|
| Actions / Evaluations | Eén centrum met correcte filters voor open en afgewerkte acties/evaluaties, duurzame correctiehistoriek, papieren-kaartactie met rechtencontrole, meldingen en navigatie zonder verlies van communicatie-items. |
| Piscine safety / autofill | Veilige dagelijkse selectie van werkelijk open/afgelopen sessies, 18-uursgrens op de gezaghebbende sessiedatum, v2-herverwerking buiten de scheduler, datumherstel en persoonlijke carnetregel zonder foutieve validatietaak. |
| COM-075 | Verjaardagsprivacy via een atomische callable; publieke projecties worden fail-closed opgeschoond en Who's Who toont geen private of verouderde verjaardagsdata. |
| COM-076 | Transactionele inschrijving en gasten, server-eigen prijs- en capaciteitsbeslissing, idempotente receipts, wachtlijst en uitsluitend serverreceipt-gestuurde betaalfeedback. |
| COM-082 / COM-083 | Boutique-kaart herschikt; clublogo verplicht en niet uitschakelbaar, correcte naam-/brevetkeuzes, naam-hydratatie en wissen, gescheiden teller/prijs en vaste naamprijs door UI, winkelmand en server. |
| COM-084 | Parcours-hub, contextvaste evaluatieaanvragen, servergevalideerde monitorrechten, duurzame beslissingen/correcties, buddy-deduplicatie en juiste reminders. |
| COM-085 | Deterministische carnetnummering en kopieerflow zonder piscine-mismatch of verouderd match-ID; transactionele nummerallocatie blijft idempotent. |
| COM-086 | Canonieke en legacy piscine-identiteit lossless samengevoegd, duplicaten veilig verwijderd/hersteld, correcte peer-/carnet-/taakartefacten en fail-closed uur-/groep-/cursusvalidatie. |
| COM-090 | Uitschrijven gebruikt exact de zichtbare inschrijving, faalt dicht bij ontbrekend ID, respecteert deadline/guest/wachtlijst en herlaadt resterende eigen inschrijvingen deterministisch. |
| MOB-024 | Ook een lege oefeningenkeuze wordt opgeslagen; late reads en saves overschrijven geen nieuwere lokale keuze en feedback toont de werkelijk bewaarde snapshot. |
| Android-profielcropper | Android 15 edge-to-edge-veilige uCrop-theme, systeemeigen fotokiezer zonder brede mediapermissie, platformveilige bytes-upload en opruiming bij annuleren/fouten; dezelfde profielingang blijft voor Android, iOS en web. |

Niet in deze kandidaat: andere oude lokale branches of wachtrij-items die niet in
de hierboven vastgelegde integratie-HEAD zitten.

## Reeds uitgevoerde kandidaatcontroles

- Functions: **379 geslaagd**, 5 expliciete emulator-skips.
- Flutter: **652 geslaagd**, 1 expliciete Firestore-emulator-skip.
- Gerichte COM-086/piscine Functions-tests: **79 geslaagd**.
- Beide Firestore-rulesuites geslaagd.
- Verjaardagsprivacy via Auth + Firestore + Functions-emulators geslaagd.
- COM-085 transactionele Firestore-emulatortests: **5 geslaagd**.
- Flutter Web releasebuild geslaagd.
- Gewijzigde Flutterbestanden hebben geen analyzerfouten of waarschuwingen; het
  scannerbestand bevat 11 bestaande info-lints buiten de gewijzigde regels.
- `git diff --check`, conflictmarkeraudit en finale worktreestatus waren schoon.

Dit bewijs vervangt geen ondertekende Android- of iOS-releasebuild en geen echte
toestelcontrole.

## Verplichte publicatievolgorde

De volgorde hieronder is onderdeel van de veiligheidsgrens. Niet herschikken.

### 0. Voorbereiding zonder productiewrites

1. Bevestig dat beide stores nog **1.21.1+206** tonen.
2. Maak een releasecommit die uitsluitend `pubspec.yaml` en de gegenereerde
   versieartefacten naar **1.22.0+207** brengt.
3. Herhaal Functions-, Flutter-, rules- en webcontroles op die exacte release-HEAD.
4. Bevestig dat Cloud Scheduler-job
   `firebase-schedule-autoClosePoolSessions-europe-west1` in project `calycompta`,
   locatie `europe-west1`, **PAUSED** is.
5. Voer geen pool-carnet-backfill met `--apply` uit.

### 1. Compatibele Functions eerst

Deploy exact deze niet-schedulerfuncties:

```bash
firebase deploy --project calycompta --only functions:joinEventWaitlist,functions:registerForEvent,functions:addGuestToEvent,functions:leaveEventWaitlist,functions:unregisterFromEvent,functions:promoteEventWaitlistEntry,functions:createBoutiqueOrder,functions:syncMemberProjections,functions:updateBirthdaySharing,functions:processFormationTaskReminders,functions:requestExerciseEvaluation,functions:decideExerciseEvaluation,functions:onBuddyConfirmationTask,functions:onMonitorObservationCompleted,functions:onPoolCheckinCompleted,functions:assignDiveNumber,functions:backfillMyDiveNumbers,functions:onLogbookDiveBuddiesChanged,functions:respondToLogbookDiveConfirmation
```

Controleer daarna per naam regio, runtime, actieve revisie en foutlogs. De callable
`backfillMyDiveNumbers` is de bestaande per-lid carnetnummeringsfunctie; dit is
niet de verboden historische piscine-backfill.

### 2. Piscine-Functions terwijl de scheduler gepauzeerd blijft

Deploy eerst de fan-outtrigger en controleer hem afzonderlijk:

```bash
firebase deploy --project calycompta --only functions:onPoolSessionClosed
```

Deploy pas daarna de veilige schedulerfunctie:

```bash
firebase deploy --project calycompta --only functions:autoClosePoolSessions
```

Verifieer in gedeployde bron/logs dat de dagelijkse job alleen werkelijk open
sessies selecteert en nooit gesloten v2-historiek als migratiepad gebruikt. De
Scheduler-job blijft na deze deploy **PAUSED**. Niet handmatig triggeren en niet
opnieuw inschakelen zonder een nieuwe, expliciete toestemming van Jan.

### 3. Echte native releasepoorten

Android:

1. Bouw een ondertekende release-AAB van exact **1.22.0+207**.
2. Bevestig `compileSdk`/`targetSdk` minimaal API 35; de huidige kandidaat gebruikt
   36 en voldoet dus pas na een geslaagde echte Android-compile.
3. Test op een echt API-35-toestel of -emulator: profiel → foto kiezen/camera →
   croppen → bevestigen, plus annuleren en opnieuw proberen. Controleer dat de
   uCrop-knoppen niet onder de statusbalk vallen en geen brede fotopermissie wordt
   gevraagd.
4. Controleer signing, package `club.caly.calymob`, versionCode 207 en de Play
   pre-launchresultaten vóór productiepromotie.

iOS:

1. Maak een ondertekend Release-archive/IPA van exact **1.22.0+207** met het juiste
   team, bundle-ID, distributiecertificaat en provisioning profile.
2. Test op een echt iPhone-toestel: foto kiezen/camera, crop, upload, annuleren en
   fout/herproberen; controleer ook de privacyteksten en profielingang.
3. Upload naar TestFlight, wacht op verwerking en voer een installatie-/starttest
   uit vóór App Store-indiening.

Een eerder geslaagde losse APK-build is ondersteunend bewijs, maar vervangt deze
release-AAB-, signing- en echte-toestelpoorten niet.

### 4. Client publiceren vóór de restrictieve regels

1. Upload en publiceer **1.22.0+207** in beide stores volgens de goedgekeurde
   gefaseerde store-uitrol.
2. Bevestig dat de build in beide stores werkelijk beschikbaar en installeerbaar
   is; een upload- of reviewstatus alleen volstaat niet.
3. Controleer callable-metrics voor de nieuwe transactionele inschrijving en
   gastenflow.
4. Verhoog pas daarna de minimale ondersteunde CalyMob-build naar 207. Oude
   clients mogen niet meer rechtstreeks kunnen registreren wanneer de nieuwe
   Firestore-regels actief worden.

### 5. Firestore-regels na clientadoptie en in onderhoudsvenster

1. Zet nieuwe eventregistraties kort in onderhoudsmodus en laat lopende oude
   schrijfacties uitdoven.
2. Controleer capaciteit en openstaande inschrijvingen.
3. Deploy de geïntegreerde regels; deze release wijzigt geen indexes:

```bash
firebase deploy --project calycompta --only firestore:rules
```

4. Verifieer onmiddellijk:

```bash
npm run test:rules:evaluation
npm run test:rules:event-registration
```

5. Test met build 207 verjaardag aan/uit, evaluatiecorrectie, inschrijven,
   gast toevoegen, wachtlijst en exact uitschrijven. Open registraties pas daarna
   opnieuw.

### 6. Scheduler en backfill blijven buiten deze release

- `firebase-schedule-autoClosePoolSessions-europe-west1` blijft **PAUSED**.
- Geen handmatige scheduler-run.
- Geen `backfill_pool_session_carnet_v2.cjs --apply`, ook niet voor een kleine
  selectie.
- Een preview zonder writes mag alleen ter voorbereiding worden gebruikt. Iedere
  apply, allowlist, scheduler-herinschakeling en productienameting vereist een
  aparte expliciete toestemming en een nieuw uitvoeringsplan.

## Historische context

De oude tekst in dit bestand verwees onder meer naar het voorstel
`1.21.0+203/204` en naar losse statussen zoals “nog niet geïntegreerd” of
“geïntegreerd op main” voor COM-075, COM-084, MOB-025, COM-046, COM-065,
COM-068, COM-070 en COM-073. Die momentopnames zijn niet langer een geldige
releasewaarheid en zijn uit de actieve wachtrij verwijderd.

De consolidatie van 31 augustus blijft herkenbaar als historisch document in
[`MOBILE_RELEASE_CONSOLIDATION_2026-08-31.md`](MOBILE_RELEASE_CONSOLIDATION_2026-08-31.md).
Ticketdossiers en Gitgeschiedenis blijven de bron voor hun oorspronkelijke
branches en bewijs; alleen de scope en poorten in dit document gelden voor de
huidige **1.22.0+207**-kandidaat.
