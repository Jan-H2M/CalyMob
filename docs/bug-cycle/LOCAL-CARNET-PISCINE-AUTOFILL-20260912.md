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
- legacy: `status == open`.

Resultaten uit beide zoekopdrachten worden per sessie gededupliceerd. De bestaande
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
- Volledige Functions-suite: 31 suites, 208 tests groen.
- `node --check` en `git diff --check` groen.

## Publicatiegrens

De codewijziging en tests zijn lokaal. Deploy van Cloud Functions en een eventuele
productiebackfill vereisen afzonderlijke expliciete toestemming en live verificatie.
