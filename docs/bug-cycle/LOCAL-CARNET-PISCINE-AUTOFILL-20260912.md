# Carnet Piscine automatische aanvulling

Werkitem: `LOCAL-CARNET-PISCINE-AUTOFILL-20260912`

## Probleem

CalyCompta markeert afgeronde zwembadtrainingen met `statut: termine`. De
dagelijkse CalyMob-functie zocht uitsluitend naar het oudere `status: open` en
zette daardoor de overgang naar `status: closed` niet. Zonder die overgang werd
`onPoolSessionClosed` niet gestart en verschenen geldige trainingen niet in het
carnet.

## Oplossing

`autoClosePoolSessions` leest voortaan beide ondersteunde schema's:

- huidig: `statut == termine` en nog niet `status == closed`;
- legacy open: `status == open`;
- legacy gesloten: `status == closed` met een verouderde
  `carnet_processing_version`, uitsluitend voor de eenmalige herverwerking.

Resultaten uit de drie zoekopdrachten worden per sessie gededupliceerd. De bestaande
18-uursgrens, `status: closed`-overgang en idempotente fan-out naar carnetregels en
evaluatietaken blijven behouden.

Een tweede productiecontrole toonde dat geldige trainingen met een
`groupAssignment` maar zonder `validatorId` volledig werden overgeslagen. Die krijgen
nu wel een persoonlijke carnetregel met een optionele validator; alleen de
evaluatietaak wacht op een echte validator. Reeds gesloten sessies worden éénmalig
herverwerkt via `carnet_processing_version: 2`. Daarbij worden ook carnetdatums
hersteld op basis van het echte `session.date`-veld, omdat actuele sessiedocumenten
willekeurige IDs gebruiken.

## Acceptatiebewijs

- Gerichte Jest-test: actuele en legacy status, reeds gesloten, recent, ongeldige
  datum, Firestore Timestamp, deduplicatie, versieherverwerking en exacte close-update.
- Gerichte trigger-test: persoonlijke carnetregel zonder validator, geen foutieve
  evaluatietaak en gebruik van de echte sessiedatum.
- Bestaande `onPoolSessionClosed`-tests blijven groen.
- Volledige Functions-suite: 31 suites, 214 tests groen.
- `node --check` en `git diff --check` groen.

## Publicatiegrens

Deploy en productiebackfill worden alleen in de veilige volgorde uitgevoerd: eerst
de trigger `onPoolSessionClosed`, daarna de scheduler `autoClosePoolSessions`, en
ten slotte een gecontroleerde eenmalige scheduler-run met live verificatie.

## Productie-uitvoering — 12 september 2026

De goedgekeurde Functions-kandidaat `6c5af62f4a6da7ee9de555a8123a935ab67a28cf`
is in de vereiste volgorde gepubliceerd:

1. `onPoolSessionClosed` werd afzonderlijk gedeployd en daarna live bevestigd als
   `ACTIVE`, Node.js 22, regio `europe-west1`, op
   `clubs/{clubId}/piscine_sessions/{sessionId}` updates;
2. pas daarna werd `autoClosePoolSessions` afzonderlijk gedeployd en live bevestigd
   als `ACTIVE`, Node.js 22, regio `europe-west1`, met een actieve Scheduler-job om
   04:00 `Europe/Brussels`;
3. beide functies rapporteren bronhash
   `fdf0942b7d1213d05a8b6733aacfb6ebf3ca209a`.

De handmatige scheduler-run is **niet gestart**. De productiebeveiliging weigerde
de mutatie omdat één run alle historische gesloten sessies met een ontbrekende of
verouderde verwerkingsversie kan bijwerken en daardoor carnetregels en
evaluatietaken kan creëren. Hiervoor is nog Jans expliciete bevestiging van precies
die productiebackfill vereist; er is geen alternatieve of indirecte run geprobeerd.

### Read-only nulmeting vóór de backfill

Inventaris op `2026-09-12T08:58:03.762Z`:

- 55 sessiedocumenten, waarvan 48 historische gesloten/afgeronde sessies in scope;
- 48 gesloten sessies hebben nog een verouderde verwerkingsversie;
- 34 trainingskoppelingen met een `groupAssignment` werden gecontroleerd;
- 10 persoonlijke carnetregels ontbreken;
- 22 bestaande piscine-carnetregels hebben nog een datum die niet gelijk is aan
  de gezaghebbende `session.date`;
- 0 dubbele persoonlijke carnetregels voor dezelfde combinatie lid/sessie;
- Jans trainingskoppelingen van 25 augustus en 1 september 2026 bestaan, maar
  hebben vóór de backfill nog geen overeenkomende carnetregel.

De vereiste eindmeting — Jans twee regels zichtbaar, 0 ontbrekende persoonlijke
carnetregels en 0 verkeerde datums — is dus terecht nog niet als geslaagd gemarkeerd.

## Reflectie

- Oorzaak: de oorspronkelijke scheduler selecteerde alleen legacy `status: open`;
  de eerste correctie selecteerde daarna nog niet de reeds gesloten documenten
  waar `carnet_processing_version` ontbreekt.
- Gemiste controle: tests en review controleerden aanvankelijk geen volledige matrix
  van open, `statut: termine`, gesloten, ontbrekende versie en actuele versie tegen
  een productie-inventaris.
- Preventie: expliciete schemaqueries, versie-2-herverwerking, deduplicatie per
  sessiedocument, 214 groene Functions-tests en een verplichte read-only voor-/nameting.
- Overdraagbare regel: een migratieveld dat op historische documenten ontbreekt,
  vereist een expliciet selectiepad, een idempotente versiemarkering en live
  inventarisbewijs; lokale tests alleen bewijzen geen productiegedrag.
- Open grens: na expliciete backfilltoestemming één Scheduler-run uitvoeren en pas
  afronden wanneer de eindinventaris alle drie de vereiste nul-/zichtbaarheidschecks
  bevestigt.

De private Calypso-learningreflectie bevestigde hiervoor
`CALY-LEARN-0006/r1` en `CALY-LEARN-0011/r2`; er was geen nieuwe algemene les nodig.
