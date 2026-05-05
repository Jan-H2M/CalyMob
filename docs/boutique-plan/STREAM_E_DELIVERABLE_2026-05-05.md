# Stream E Deliverable — 2026-05-05

## Scope

Nieuwe Cloud Functions toegevoegd onder:

- `functions/src/boutique/createOrder.js`
- `functions/src/boutique/markOrderPaid.js`
- `functions/src/boutique/notifySupplier.js`
- `functions/src/boutique/generateReceipt.js`
- `functions/src/loans/onLoanCreated.js`
- `functions/src/cotisations/createCotisationPayment.js`
- `functions/src/boutique/shared.js` (gedeelde helper voor deze stream)

Ook exports toegevoegd in `functions/index.js`.

## Per file

### `functions/src/boutique/shared.js`

Bevat gedeelde helpers voor:

- Gen2 region constant
- migration/backfill guard check (`migration_source` / `_backfill`)
- domein- en input-errors voor callable functions
- eenvoudige OGM extractie/parsing voor bank communication
- counter helper
- placeholder OGM builder

Geïmplementeerd:

- OGM extractie uit `+++123/4567/89072+++` of 12-digit plain text
- uniforme error mapping voor `INVALID_INPUT`, `OUT_OF_STOCK`, `PRODUCT_NOT_FOUND`, `PRODUCT_ARCHIVED`

TODO:

- geen echte OGM-generatie/service-koppeling; deze repo heeft daar vandaag geen gedeelde utility voor

### `functions/src/boutique/createOrder.js`

Callable function die:

- auth vereist
- input valideert (`clubId`, non-empty `items`, buyer basisvelden)
- per item product + variant inline ophaalt uit `clubs/{clubId}/products`
- `PRODUCT_NOT_FOUND` en `PRODUCT_ARCHIVED` afdwingt
- tracked stock reserveert in een Firestore transaction
- `OUT_OF_STOCK` retourneert met `{ productId, variantId, requested, available }`
- `awaiting_restock` zet bij preorder/backorder
- ordernummer genereert via `clubs/{clubId}/settings/order_counter`
- totals berekent
- order doc schrijft met `status='awaiting_payment'`, `payment.status='pending'`, `expiresAt=+72h`, `migration_source=null`, `_backfill=false`

Geïmplementeerd:

- echte validatie
- echte stock decrement
- echte order counter
- echte order write

TODO:

- echte OGM-generatie en `payment_references` write; momenteel placeholder `TODO_OGM_GENERATE_*`
- inventory mutation audit docs
- uitgebreidere buyer/member validation

### `functions/src/boutique/markOrderPaid.js`

Firestore v2 `onDocumentWritten` trigger op `clubs/{clubId}/bank_transactions/{txId}`.

Geïmplementeerd:

- `_backfill` / `migration_source` guard
- communication field extractie
- OGM extractie
- lookup in `clubs/{clubId}/payment_references/{ogm}`
- skip tenzij `context_type='BOUTIQUE_ORDER'` en `status='NEW'`
- minimale order update naar paid
- minimale payment reference update naar `MATCHED`

TODO:

- amount validation/tolerance
- inventory mutation flip
- receipt queue
- supplier batching
- buyer push/email

### `functions/src/boutique/notifySupplier.js`

Bevat:

- callable `notifySupplier`
- scheduled `notifySupplierScheduler` (`every 1 hours`)

Geïmplementeerd:

- callable auth check
- supplier load uit `clubs/{clubId}/fournisseurs`
- skeleton threshold-plan object
- scheduled scan van clubs + suppliers met `weekly_digest`

TODO:

- admin authorization
- echte pending-items query per supplier
- echte threshold logic op orderlijnen
- mail verzending
- persistence van `last_sent_at` / `next_scheduled_at`

### `functions/src/boutique/generateReceipt.js`

Callable skeleton voor boutique receipt generatie.

Geïmplementeerd:

- auth check
- `clubId` / `orderId` validation
- order existence check

TODO:

- echte PDF generatie
- Storage upload naar `clubs/{clubId}/orders/{orderId}/receipt.pdf`
- return van echte signed/public URL

### `functions/src/loans/onLoanCreated.js`

Firestore v2 `onDocumentCreated` trigger op `clubs/{clubId}/inventory_loans/{loanId}`.

Geïmplementeerd:

- `_backfill` / `migration_source` guard
- skip bij reeds betaalde caution
- caution amount detectie op `montant_caution` of legacy `caution_montant`
- placeholder OGM write op de loan doc

TODO:

- echte OGM-generatie + `payment_references` write
- QR email volgens bestaand payment pattern
- push notification naar lid

### `functions/src/cotisations/createCotisationPayment.js`

Callable skeleton voor cotisation payment creatie.

Geïmplementeerd:

- auth check
- member ownership check via `clubs/{clubId}/members`
- period computation: `jan_dec` voor 1 september UTC, anders `sept_dec`
- `cotisation_payments` doc write met placeholder OGM en status `awaiting_payment`

TODO:

- categorie-afleiding uit `member.clubStatuten`
- actieve saison/tariff lookup in `membership_seasons`
- amount + validity computation
- QR email verzending
- echte OGM-generatie + `payment_references` write

## Hergebruikte bestaande patterns / utilities

- Gen2 callable pattern uit `functions/src/payment/sendPaymentReminder.js`
- Gen2 Firestore trigger pattern uit `functions/src/notifications/onNewOperation.js`
- migration/backfill-guard patroon (`migration_source` / `_backfill`) uit `functions/src/notifications/onNewOperation.js`
- payment QR email patroon inhoudelijk gerefereerd voor latere TODO’s, maar niet direct hergebruikt omdat de bestaande helper event-specifiek is

## Nieuwe Firestore writes in deze stream

`createOrder.js`

- `clubs/{clubId}/products/{productId}` update van inline `variants[*].stockCount`
- `clubs/{clubId}/settings/order_counter`
- `clubs/{clubId}/orders/{orderId}`

`markOrderPaid.js`

- `clubs/{clubId}/orders/{orderId}` update naar paid
- `clubs/{clubId}/payment_references/{ogm}` update naar `MATCHED` wanneer zo’n ref al bestaat

`notifySupplier.js`

- geen writes in MVP skeleton

`generateReceipt.js`

- geen writes in MVP skeleton

`onLoanCreated.js`

- `clubs/{clubId}/inventory_loans/{loanId}` merge update met caution OGM placeholder

`createCotisationPayment.js`

- `clubs/{clubId}/cotisation_payments/{cotisationPaymentId}`

## OGM status

In deze functions-repo bestond vooraf geen gedeelde OGM service of utility zoals in CalyCompta `ogmService.ts`. Daarom is in deze stream bewust:

- OGM parsing voor inbound bank communication wel lokaal toegevoegd
- OGM generation voor nieuwe boutique/cotisation/loan refs nog placeholder/TODO gebleven

Dit houdt de stream deployable zonder een nieuwe, ongeverifieerde OGM-writer in de functions-repo te introduceren.

## Syntax check

Uit te voeren / uitgevoerd:

```bash
node -c functions/src/boutique/shared.js
node -c functions/src/boutique/createOrder.js
node -c functions/src/boutique/markOrderPaid.js
node -c functions/src/boutique/notifySupplier.js
node -c functions/src/boutique/generateReceipt.js
node -c functions/src/loans/onLoanCreated.js
node -c functions/src/cotisations/createCotisationPayment.js
node -c functions/index.js
```

Resultaat:

- `node -c functions/src/boutique/shared.js` → exit 0
- `node -c functions/src/boutique/createOrder.js` → exit 0
- `node -c functions/src/boutique/markOrderPaid.js` → exit 0
- `node -c functions/src/boutique/notifySupplier.js` → exit 0
- `node -c functions/src/boutique/generateReceipt.js` → exit 0
- `node -c functions/src/loans/onLoanCreated.js` → exit 0
- `node -c functions/src/cotisations/createCotisationPayment.js` → exit 0
- `node -c functions/index.js` → exit 0
