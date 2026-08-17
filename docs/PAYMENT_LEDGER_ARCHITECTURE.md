# Payment ledger integration

The canonical payment-ledger contract lives in
[`CalyCompta/docs/PAYMENT_LEDGER_ARCHITECTURE.md`](https://github.com/Jan-H2M/CalyCompta/blob/main/docs/PAYMENT_LEDGER_ARCHITECTURE.md)
in the CalyCompta repository. This file is the mobile-facing index and must
be updated whenever a mobile payment screen or Cloud Function changes.

## Mobile responsibilities

- Display server-returned amounts and derived settlement states.
- Request registration, QR, reminder or refund commands with authenticated
  identity.
- Keep communication state (`qr_issued`, `qr_on_site`) separate from payment
  settlement (`paid`, `partial`, `unpaid`).
- Never write `paye`, `transaction_id`, `transaction_montant`,
  `transaction_matched`, allocation data or refund totals directly.

## Server responsibilities

Cloud Functions in `functions/src/payment/` validate the member, operation,
charge revision and amount. They create immutable payment intents for both
flat and installment QR flows. CalyCompta settles incoming bank receipts and
owns Firestore accounting rules.

## Change checklist

When changing a payment flow, update the canonical document above, add a Dart
or Function regression test, add the corresponding CalyCompta contract test,
and add the change to [`MOBILE_RELEASE_QUEUE.md`](./MOBILE_RELEASE_QUEUE.md).

Do not deploy a mobile release or publish a mobile app version as part of a
payment-ledger code change without explicit release approval.
