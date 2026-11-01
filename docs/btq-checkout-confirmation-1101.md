# BTQ-CHECKOUT-1101 — bank-transfer receipt, DEV only

## Reproduction

Selecting bank transfer creates the order with `deferPaymentEmail: true`, then
empties the device cart. The current-payment panel separately asks the server for
fresh instructions. If that endpoint is unavailable, the old screen emphasizes
that no historical QR will be shown and hides the creation total. This can make a
successful order look lost. Mail is not automatically sent by either choice;
sending requires the explicit current-payment email action.

Two new full-checkout widget regressions failed on the previous behavior. The
tests use a fake catalogue/access store, fictional identity, real local cart and
injected server responses. No Firebase app or production backend is initialized.

## Repair

- Retain an explicit saved-order receipt, number and clearly historical creation
  total even when current-payment loading fails. Explain why the cart is empty
  and warn against creating the same order again.
- State the chosen bank/email mode honestly; never claim automatic mail delivery.
- Manual transfer uses the existing validated current instructions and copy
  actions without displaying a QR. The other payment surfaces keep their QR.
- Provide a guarded route to Mes commandes.
- Clear the cart only after a successful response with order ID and number;
  failed/incomplete responses keep the cart and its retry idempotency key.
- Preserve server refresh, obsolete-instruction, auth/ownership and supplement
  guards. Never fall back to historical QR, amount or communication after a load
  failure. No payment receipt is fabricated and no mail is sent by checkout.

## Boundaries

This is a client-only DEV repair. No Functions/rules/metadata/version changes,
production deploy or order/payment/member writes. A current-payment endpoint
which returns404 needs a separate production compatibility/deployment decision;
the confirmation repair does not silently deploy it or bypass it. No native
acceptance/store availability is claimed from widget/Chrome tests.

The live bug-board creation conflicts with the investigation's blanket
no-production-writes limit; a narrow card-only exception was asked separately.
Until clarified the signalement is this local work item, not an invented MOB ID.
