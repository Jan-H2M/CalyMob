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
activity inscription. The app shows **Payé** from the canonical inscription
accounting fields: `paye: true`, `payment_status` equal to `paid` or `settled`,
or `transaction_matched: true`. A transaction ID on its own is only a link and
is not proof of settlement.

**MOB-044 correction (28 October 2026):** the previous inline-intent rule was
not safe and is superseded. `payment_intent_status`,
`event_payment_intent_status` and the nested `payment_intent.status` on an
inscription are not protected accounting fields in the canonical CalyCompta
rules. The mobile reader ignores all three completely, including `paid`,
`settled` and `manual_review`. They cannot replace a canonical review state,
hide a payment action, or make an inscription paid. This does not read or
change the server-owned payment-intent collection or change Firestore rules.
No existing alias values are migrated or rewritten.

The paired CalyCompta MOB-044 rules candidate also closes the pre-existing
own/guest-create gap for canonical `payment_status` and installment maps.
That independently reviewed rule change must be deployed with separate
approval before this mobile status contract is accepted for release. Merely
removing the three aliases is not a claim that older live rules already
guarantee server-owned canonical values on creation.

When CalyCompta identifies a participant for an event-linked transaction but
cannot settle it safely, it projects `payment_status: manual_review` together
with `payment_review_transaction_id` and `payment_review_reason`. CalyMob shows
**Vérification bancaire** and disables new QR/payment confirmation actions for
that participant. This includes payment-plan activities: the review card
replaces the installment plan and its QR action until CalyCompta resolves the
review. This state takes precedence over old QR communication wording and does
not grant mobile access to private bank transactions or payment intent
collections.

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
