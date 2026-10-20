# Boutique pool-handover mobile slice — scope

Date: 2026-10-20  
Work item: ENG-314  
Status: Scope only — no mobile administration flow is included in this change.

## Decision

Build one narrowly bounded operational flow: an authorised pool-handover
helper confirms that a prepared Boutique order is physically handed to its
buyer at a pool pickup point. The CalyMob member catalogue, cart and orders
remain member features. Catalogue, pricing, stock administration, supplier
work, order corrections, payment decisions and the general Boutique back
office remain in CalyCompta.

The first release must not be presented as a mobile Boutique administration
application. It is a controlled handover tool for a physical event.

## Existing work assessed

The unpublished `codex/mob-btq-qr-20261016` branch is useful reference work,
not a dependency to merge wholesale. Its `BoutiqueOperationsService`, QR
parsing, guarded routes, idempotent confirmation keys and server-side
transactional callable show the right safety direction. It also contains a
much larger stock-session, Jim workshop, transport, delegation, notification
and physical-stock model.

Reuse only these concepts after a fresh review against the then-current
backend:

- an RB-only entry guarded on the server as well as the client;
- QR parsing for an existing permanent article and member identifier format;
- a server preview followed by an explicit confirmation using an idempotency
  key;
- immutable handover receipt/audit data; and
- fail-closed handling for a stale, foreign, already handed-over or
  unauthorised item.

Do not reuse the branch's broad screens, its 15/30-second polling assumptions,
physical stock migration, transport missions, push-notification worker,
indexes or Firebase configuration without separate scope and review.

## Proposed v1 flow

1. A **Responsable boutique** opens **Pool handover** from the Boutique area.
   The screen states that it is for event handover only and links back to
   CalyCompta for management.
2. The helper scans or searches an already-paid, already-prepared order QR.
   The server returns a read-only preview: buyer display name, order reference,
   eligible pieces, pickup point/window, and blocking reason when applicable.
3. The helper scans the buyer's existing member QR (or selects the buyer only
   when the server exposes an equivalent verified lookup). Both scans must
   identify the same buyer.
4. The helper reviews the complete set of eligible pieces and explicitly
   confirms the handover. The app sends a random idempotency key with the
   server-validated revision/IDs.
5. The server atomically records the receipt, marks only the confirmed pieces
   handed over, and returns the receipt ID. A retry with the same key returns
   that receipt; it never creates another handover.
6. The app shows a concise success view and an error/retry state. It does not
   offer stock edits, refunds, payment changes or manual order repair.

## Roles and authorisation

| Actor | May do | Must not do |
| --- | --- | --- |
| Active member | View own member orders only | Open the handover flow or see another buyer's order |
| Responsable boutique (RB) | Preview and confirm a handover at an authorised pool event | Change products, price, stock, payment, delivery mode or history |
| Assigned event helper (optional later slice) | Confirm only explicitly delegated missions | Browse inventory or other events |
| CalyCompta manager/admin | Configure products, inventory, orders, payments and event eligibility | Bypass immutable handover audit records |

The client role gate is only a convenience. The callable/server endpoint must
look up the authenticated member's current RB/delegation right on every
preview and confirmation, including after a long-open screen.

## Minimal backend contract

The implementation should add or adapt one server-authoritative endpoint with
two actions, rather than granting CalyMob direct write access to Boutique
collections:

| Action | Input | Output | Write |
| --- | --- | --- | --- |
| `previewHandover` | order/article QR, buyer QR candidate, event ID | eligible pieces, current revisions, clear blocking code | none |
| `confirmHandover` | preview identity, piece IDs/revisions, buyer ID, event ID, idempotency key | receipt ID and final piece/order state | one atomic transaction |

Suggested immutable receipt fields: `clubId`, `orderId`, confirmed `lineId`s
and physical IDs, `buyerId`, `eventId`, `handedOverBy`, server timestamp,
idempotency/request hash and the operation result. The endpoint must reject
unpaid orders, mismatched buyer, duplicate/previously delivered pieces,
different-club data, stale revisions and a revoked RB/delegation assignment.

## Explicit non-goals

- no mobile catalogue/product/variant editor;
- no stock count, location, supplier or workshop workflow;
- no payment capture, refund, discount or accounting action;
- no generic QR generator or new permanent QR format;
- no offline-confirm queue: confirmation needs an online server transaction;
- no migration of the 16 October branch's physical-stock collections; and
- no Firestore-rule widening for direct mobile writes.

## Acceptance criteria

- An active RB can only see pool handover when the event feature flag is on.
- A non-RB cannot discover the route, and the server rejects a forged call.
- Preview is read-only and returns no unrelated buyer/order data.
- Two concurrent confirmations of the same piece result in one receipt and
  one clearly explained rejection/replay.
- Retrying a timed-out confirmation with the same idempotency key returns the
  original receipt without another mutation.
- A complete, paid, prepared order can be handed over; unpaid, incomplete,
  foreign, stale and buyer-mismatched cases fail closed.
- A receipt is visible to authorised CalyCompta staff and preserves who, what,
  where and when without exposing it to unrelated members.
- Widget, callable/emulator and concurrency/idempotency tests cover each
  outcome before any flag is enabled.

## Delivery slices and estimate

| Slice | Scope | Estimate |
| --- | --- | --- |
| 0. Contract review | Reconcile CalyCompta order schema, rules and QR formats; decide event source | 1–2 days |
| 1. Server preview/confirm | Callable, transaction, receipt schema, emulator security/concurrency tests | 3–5 days |
| 2. RB mobile UI | Guarded route, scan/search, preview/confirmation/result, widget tests | 2–3 days |
| 3. Backoffice visibility | Read-only receipt view/filter in CalyCompta and operational runbook | 1–2 days |
| 4. Pilot | Test club/event, real-device scan rehearsal and rollback verification | 1 day |

Total: **8–13 engineering days**, excluding unplanned schema cleanup. Start
with a design review because the current CalyCompta order and inventory
contracts are the authority.

## Rollout and rollback

Keep the feature off by default and enable it only for a named pilot event and
RB after server, app and backoffice changes are compatible. Roll back by
disabling the event/feature flag; never delete receipts or rewrite a completed
handover. If a serious incident occurs, perform correction through CalyCompta
with an explicit audit record rather than reopening the mobile confirmation.
