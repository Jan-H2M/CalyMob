# COM-076 — wachtlijst bij duikevents

Canoniek dossier: `CalyCompta/docs/bugs/COM-076.md`.

- Codecommits: `ab77cdf`, `6b52ff1`, `9a0c954`
- Branch: `codex/bug-COM-076-waitlist`
- FIFO-positie wordt aan het wachtende lid getoond.
- Nieuwe duikevents met een eindige positieve capaciteit krijgen in CalyMob
  standaard een actieve wachtlijst; de zichtbare keuze en waarschuwing worden
  altijd als expliciete boolean opgeslagen. Bestaande ontbrekende/`false`
  waarden blijven uitgeschakeld; er is geen migratie.
- Afmelding, verwijderen of overdragen van gekoppelde gasten en alle FIFO-
  promoties gebeuren samen in callable `unregisterFromEvent`. De client voert
  vooraf geen gedeeltelijke gastwrites meer uit.
- Alleen de payload van de finaal gecommitte transaction-attempt stuurt
  promotienotificaties; een Firestore-retry kan geen verouderde notificatie
  meer lekken. Dit geldt ook voor handmatige promotie.
- Function-tests: 27/27 suites en 177/177 tests groen, inclusief auth,
  transaction-retry, gastverwijdering/-overdracht, drie gelijktijdige FIFO-
  promoties en notificaties.
- Gerichte Flutter-tests: 5/5 groen (create-defaults, expliciete keuze,
  betaaldefault, filtering en FIFO-positie).
- Gerichte analyzer: geen nieuwe melding; de bestaande geselecteerde bestanden
  bevatten 170 baseline-meldingen (waarvan 4 warnings buiten deze wijziging).
- Geen build, upload, store-inzending of deployment uitgevoerd.
- Harde releasevolgorde: eerst de nieuwe callable deployen en verifiëren, pas daarna de mobiele build distribueren.
