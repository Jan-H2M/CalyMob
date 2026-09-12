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
evaluatietaken blijven behouden. Aanwezigen zonder geldige `groupAssignment` en
validator worden nog altijd niet als training verwerkt.

## Acceptatiebewijs

- Gerichte Jest-test: actuele en legacy status, reeds gesloten, recent, ongeldige
  datum, Firestore Timestamp, deduplicatie en exacte close-update.
- Bestaande `onPoolSessionClosed`-tests blijven groen.
- Volledige Functions-suite: 31 suites, 208 tests groen.
- `node --check` en `git diff --check` groen.

## Publicatiegrens

De codewijziging en tests zijn lokaal. Deploy van Cloud Functions en een eventuele
productiebackfill vereisen afzonderlijke expliciete toestemming en live verificatie.
