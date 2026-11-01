# MOB-054 — current Boutique transfer details and payment mail

Extends the DEV confirmation fix in PR194. Both bank and email checkout choices
show an EPC QR and separate IBAN, amount and free-communication copy actions.
The chosen presentation is sent to the server, stored on the order and returned
on idempotent retries; legacy clients remain explicitly `unspecified`.

The payment panel projects the current own-order server snapshot independently
of `getBoutiqueOrderPayment`. It regenerates EPC data from current amounts and
the current payment-plan request; it never displays a historical QR, cached or
uncommitted snapshot. A received or superseded request removes the old payment
actions, including an expanded QR. The shared Dart/server fixture covers split
receipts, original transfers reported but not yet received, supplements and
invalid plans. The existing ownership/session/access rules remain required.

New orders automatically receive a payment email even from older apps that
always set `deferPaymentEmail=true`. Checkout retries do not resend. Provider
failure preserves the saved order with `email_status=failed`. Email rendering
regenerates the current QR and includes beneficiary, IBAN, amount and free
communication, including when an old/custom template omits them. The request
is rechecked immediately before sending, including initial orders.

No historical order backfill or resend is part of this change. Existing orders
and receipts are read only. Tests replace delivery with a local capture; no
member message is sent during validation. Future automatic order mail is the
intended feature behavior.

Production rollout is limited to `createBoutiqueOrder`,
`getBoutiqueOrderPayment` and `sendBoutiqueOrderPaymentEmail`. Compare live
rules/config first; no rules or CalyCompta web change is required. The client
screen changes must be included in the prepared release branch; this work does
not start Xcode Cloud, submit to stores or publish `settings/app_version`.
