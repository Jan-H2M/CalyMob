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

## Participant payment presentation — 26 October 2026

> **Superseded (2026-10-26):** the former mobile presentation rule that
> rendered `paye: true` without a second matched-transaction flag as “Payé via
> CalyMob / En attente banque” is retained here for history but no longer
> applies. It caused a settled inscription to remain amber when CalyCompta's
> denormalised fields did not update in the same write.

`ParticipantOperation.isPaymentSettled` is the single display contract for an
activity inscription. The app shows **Payé** when any authoritative Firestore
signal says the inscription is settled: `paye: true`, `payment_status` equal to
`paid` or `settled`, `transaction_matched: true`, or a denormalised payment
intent status equal to `paid` or `settled`. A transaction ID on its own is only
a link and is not proof of settlement.

When CalyCompta identifies a participant for an event-linked transaction but
cannot settle it safely, it projects `payment_status: manual_review` together
with `payment_review_transaction_id` and `payment_review_reason`. CalyMob shows
**Vérification bancaire** and disables new QR/payment confirmation actions for
that participant. This review state takes precedence over old QR communication
wording and does not grant mobile access to private bank transactions or payment
intent collections.

## Server responsibilities

Cloud Functions in `functions/src/payment/` validate the member, operation,
charge revision and amount. They create immutable payment intents for both
flat and installment QR flows. CalyCompta settles incoming bank receipts and
owns Firestore accounting rules.

The exported legacy Noda event-payment functions (`createNodaPayment`,
`checkNodaPaymentStatus` and `nodaWebhook`) are fail-closed. They no longer
write `operation_participants`; historical Noda records require manual review.

## Change checklist

When changing a payment flow, update the canonical document above, add a Dart
or Function regression test, add the corresponding CalyCompta contract test,
and add the change to [`MOBILE_RELEASE_QUEUE.md`](./MOBILE_RELEASE_QUEUE.md).

Do not deploy a mobile release or publish a mobile app version as part of a
payment-ledger code change without explicit release approval.
