# Stream G Deliverable — 2026-05-05

- Toegevoegd: `functions/src/shared/ogm.js` met pure CommonJS OGM utilities.
- Toegevoegd: `functions/src/shared/ogmService.js` met gedeelde SAMS OGM-counter op `clubs/{clubId}/settings/ogm_counter` en `payment_references`.
- `functions/src/boutique/createOrder.js` gebruikt nu echte OGM-generatie, stock-reservatie, `payment_references`, EPC payload en QR data URL.
- `functions/src/boutique/shared.js` bevat nu `buildEpcQrPayload()` volgens EPC069 v002 SCT-structuur.
- `functions/src/boutique/markOrderPaid.js` matcht op echte OGM, controleert bedrag met tolerantie van 1 cent, schrijft mismatches naar `clubs/{clubId}/manual_review_queue`, en flipt orders transactioneel naar betaald.
- `functions/src/loans/onLoanCreated.js` genereert echte OGM/payment reference voor cautions.
- `functions/src/cotisations/createCotisationPayment.js` doet season/tariff lookup, amount-bepaling, validity-datum en payment reference creatie.
- Geen deploys of package-wijzigingen uitgevoerd.
