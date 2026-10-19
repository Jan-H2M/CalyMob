# BTQ-SELECT-20261019 — selection before action

Existing unnumbered Signalements suggestion `yLxCaTuLekzQiqTyBNMu` (17 October).
This is a local extension of the reviewed but unpublished mobile Boutique QR
candidate `19987ad45a05ecc84dca99e822095500e676603e`, not a separate release.
Current remote main/dev and existing worktrees were inspected first; neither
remote branch yet includes this physical-session implementation. No merge,
upload, feature activation or deployment is implied by this candidate.

## Behaviour

- First select one/many scanned physical pieces, or an entire order. No default
  action is selected. The existing six actions appear only after a selection.
  Changing the selection clears the chosen action.
- The order picker reads paginated, club-scoped open orders (30 per page), not
  the inventory preview's first 200 units. Search explicitly covers loaded
  orders; subsequent pages remain reachable. No contact/payment fields are
  returned to this picker.
- Selecting an order freshly reads its exact reservations and physical pieces
  under the existing server RB/active-member/feature-flag checks. Helpers and an
  admin without RB cannot list/select orders. No read endpoint writes anything.
- All remaining pieces must exist, belong to the exact order/line, be at the
  current session location and not be in transit. Missing allocations, duplicate
  reservations, uncertain previous handovers or more than 50 remaining pieces
  reject the entire selection, with guidance to scan pieces individually. A
  proven earlier QR handover is excluded; digital and closed lines are not stock.
- Adding an order is local and atomic. Existing scans are not duplicated or
  silently refreshed; exceeding the total 50-piece session cap leaves the
  previous selection untouched.
- Selecting does not confirm physical presence or execute an action. The server
  preview and separate confirmation still name the selected piece count. Exact
  piece revisions, actor binding and idempotency/retry identity remain enforced
  by the existing mutation path. Full paid-order pickup notification policy is
  distinct from choosing pieces from an order.

## Proportionate checks

Use only fictitious in-memory widgets and `demo-boutique-qr` on
`127.0.0.1:8087`. The emulator tests refuse other hosts/projects. The new read
tests wrap the transaction API to reject any write attempt.

```sh
flutter test --no-pub test/models/boutique/boutique_scan_selection_test.dart test/screens/boutique_stock_selection_flow_test.dart test/screens/boutique_qr_confirmation_lifecycle_test.dart test/screens/boutique_qr_access_test.dart
FIRESTORE_EMULATOR_HOST=127.0.0.1:8087 GCLOUD_PROJECT=demo-boutique-qr node --test functions/test/boutique/orderSelection.emulator.cjs functions/test/boutique/physicalOperations.emulator.cjs
flutter build web --no-pub --target test/qa/boutique_qr_preview.dart --no-wasm-dry-run
```

The functional widget flow covers selection before an explicit action, all six
actions, duplicate order selection, pagination, role withdrawal, preview cancel,
explicit apply and ambiguous-response retry. The 390×844 phone viewport uses
real scroll gestures to reach the confirmation; it is not a camera/device test.
The local web preview has no production transport or Firebase initialization.

## Still separate

Independent exact-commit review, integration with the current grouped mobile
target and paired web compatibility, real camera/device acceptance and the
previously documented QR backend/index/flag rollout remain separate steps. No
real orders, stock, payments, member data or customer messages are modified by
development/QA. Keep the board ticket open until integrated acceptance/delivery;
do not claim this suggestion is already available in an installed app.
