# Carnet Piscine automatische aanvulling

Werkitem: `LOCAL-CARNET-PISCINE-AUTOFILL-20260912`

## Probleem

CalyCompta markeert afgeronde zwembadtrainingen met `statut: termine`. De
dagelijkse CalyMob-functie zocht uitsluitend naar het oudere `status: open` en
zette daardoor de overgang naar `status: closed` niet. Zonder die overgang werd
`onPoolSessionClosed` niet gestart en verschenen geldige trainingen niet in het
carnet.

## Oplossing

`autoClosePoolSessions` leest beide ondersteunde schema's voor de gewone,
dagelijkse afsluiting:

- huidig: `statut == termine`, ouder dan 18 uur en nog niet
  `status == closed`;
- legacy open: `status == open`, ouder dan 18 uur.

Resultaten uit de twee zoekopdrachten worden per sessie gededupliceerd. Een document
dat al `status == closed` heeft, wordt door de scheduler altijd geweigerd, ook als
`carnet_processing_version` ontbreekt of lager dan 2 is. Zo kan de dagelijkse
scheduler nooit stilzwijgend een historische backfill uitvoeren. De bestaande
18-uursgrens, `status: closed`-overgang en idempotente fan-out naar carnetregels en
evaluatietaken blijven behouden.

De historische versie-2-verwerking is afgesplitst naar het expliciete script
`functions/scripts/backfill_pool_session_carnet_v2.cjs`:

- zonder `--apply` is het altijd een read-only preview;
- preview zonder allowlist toont alle gesloten sessies met
  `carnet_processing_version < 2`;
- schrijven vereist zowel `--apply` als minstens één exacte `--session=<id>`;
- een onbekend, gewijzigd of intussen verwerkt allowlist-ID weigert de hele run
  vóór de eerste write;
- bij apply wordt de volledige allowlist nogmaals in één Firestore-transactie
  gecontroleerd. Alleen de versiemarkering wordt verhoogd; die expliciete update
  activeert vervolgens de bestaande idempotente `onPoolSessionClosed`-fan-out.

Een tweede productiecontrole toonde dat geldige trainingen met een
`groupAssignment` maar zonder `validatorId` volledig werden overgeslagen. Die krijgen
nu wel een persoonlijke carnetregel met een optionele validator; alleen de
evaluatietaak wacht op een echte validator. Reeds gesloten sessies worden éénmalig
herverwerkt via `carnet_processing_version: 2`. Daarbij worden ook carnetdatums
hersteld op basis van het echte `session.date`-veld, omdat actuele sessiedocumenten
willekeurige IDs gebruiken.

## Acceptatiebewijs

- Gerichte Jest-test: actuele en legacy status, reeds gesloten, recent, ongeldige
  datum, Firestore Timestamp, deduplicatie en exacte close-update.
- Backfilltests: gesloten/version<2-selectie, standaard dry-run zonder writes,
  verplichte apply-allowlist, onbekende IDs, transactionele hercontrole en exacte
  allowlist-write.
- Gerichte trigger-test: persoonlijke carnetregel zonder validator, geen foutieve
  evaluatietaak en gebruik van de echte sessiedatum.
- Bestaande `onPoolSessionClosed`-tests blijven groen.
- Volledige Functions-suite: 33 suites, 227 tests groen.
- `node --check` en `git diff --check` groen.

## Publicatiegrens

De Scheduler-job blijft **PAUSED** totdat Jan apart toestemming geeft voor deploy
en opnieuw inschakelen. Deze lokale wijziging deployt of activeert niets.

De veilige toekomstige volgorde is:

1. deploy de veilige `autoClosePoolSessions`-code terwijl de Scheduler-job gepauzeerd
   blijft;
2. verifieer dat de gedeployde scheduler geen query op `status == closed` meer doet;
3. schakel de dagelijkse job alleen met aparte toestemming opnieuw in;
4. voer historische verwerking uitsluitend via de aparte preview/allowlist-route
   uit, opnieuw met aparte productietoestemming.

## Productie-uitvoering — 12 september 2026

De Functions-kandidaat `6c5af62f4a6da7ee9de555a8123a935ab67a28cf`
werd in de toen geplande volgorde gepubliceerd:

1. `onPoolSessionClosed` werd afzonderlijk gedeployd en daarna live bevestigd als
   `ACTIVE`, Node.js 22, regio `europe-west1`, op
   `clubs/{clubId}/piscine_sessions/{sessionId}` updates;
2. pas daarna werd `autoClosePoolSessions` afzonderlijk gedeployd en live bevestigd
   als Function `ACTIVE`, Node.js 22, regio `europe-west1`, gekoppeld aan de
   Scheduler-job van 04:00 `Europe/Brussels`;
3. beide functies rapporteren bronhash
   `fdf0942b7d1213d05a8b6733aacfb6ebf3ca209a`.

Er is geen handmatige scheduler-run gestart. Uit de productielogs bleek wel dat de
toenmalige automatische schedulerrevisie op `2026-09-12T08:31:27Z` al zelfstandig
had gelopen. Die run gebeurde vóór de later uitgerolde versie-2-selectie en
rapporteerde `scanned=48, closed=46`. Het bijbehorende triggerbewijs telde 5 nieuwe
carnetregels en 6 nieuwe monitortaken. Dit zijn gemeten productieresultaten; uit de
beschikbare logs kan niet met zekerheid per afzonderlijk document worden afgeleid
welke van de 46 close-updates precies tot elk van die 11 fan-outwrites leidde.

Na ontdekking dat de later uitgerolde scheduler ook reeds gesloten/version<2-
sessies zou selecteren, is de Scheduler-job gepauzeerd. De Function kan in Cloud
Functions nog `ACTIVE` heten terwijl de gekoppelde Scheduler-job **PAUSED** is; dat
zijn twee verschillende statussen. De job blijft gepauzeerd tot de veilige code is
gedeployd én Jan apart toestemming geeft om hem opnieuw in te schakelen.

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

Deze 48 documenten worden na deze veiligheidsfix niet meer door de dagelijkse
scheduler geselecteerd. Ze blijven uitsluitend zichtbaar in de aparte dry-run:

```bash
cd functions
npm run backfill:pool-carnet-v2 -- --club=calypso
```

Een beperkte preview kan met één of meer `--session=<id>`-argumenten. Een apply is
alleen technisch mogelijk met de combinatie `--apply --session=<id>` en blijft een
productiewrite waarvoor aparte toestemming, een gecontroleerde allowlist en een
nameting vereist zijn.

De vereiste eindmeting — Jans twee regels zichtbaar, 0 ontbrekende persoonlijke
carnetregels en 0 verkeerde datums — is dus terecht nog niet als geslaagd gemarkeerd.

## Reflectie

- Oorzaak: de oorspronkelijke scheduler selecteerde alleen legacy `status: open`;
  de eerste correctie bracht daarna dagelijkse afsluiting en historische
  versieherverwerking in dezelfde geplande functie samen.
- Gemiste controle: tests en review controleerden aanvankelijk geen volledige matrix
  van open, `statut: termine`, gesloten, ontbrekende versie en actuele versie tegen
  een productie-inventaris.
- Preventie: dagelijkse queries bevatten geen gesloten sessies; historische
  versie-2-herverwerking heeft een aparte standaard-dry-run route, een verplichte
  exacte allowlist en transactionele apply-hercontrole.
- Overdraagbare regel: een migratieveld dat op historische documenten ontbreekt,
  vereist een expliciet selectiepad, een idempotente versiemarkering en live
  inventarisbewijs; lokale tests alleen bewijzen geen productiegedrag.
- Open grens: eerst apart toestemming voor deploy en re-enable van de veilige
  dagelijkse scheduler. Een historische backfill gebeurt nooit meer via die
  scheduler, maar alleen na aparte toestemming via het allowlist-script en wordt
  pas afgerond wanneer de eindinventaris alle drie de vereiste
  nul-/zichtbaarheidschecks bevestigt.

De private Calypso-learningreflectie bevestigde hiervoor
`CALY-LEARN-0006/r1` en `CALY-LEARN-0011/r2`; er was geen nieuwe algemene les nodig.
