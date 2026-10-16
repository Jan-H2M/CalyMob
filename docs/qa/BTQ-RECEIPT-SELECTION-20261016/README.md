# BTQ-RECEIPT-SELECTION-20261016

Jan requested whole-shipment selection in CalyMob without scanning every piece,
plus individual row selection, select all and select none on the web.

## Mobile behavior

Gestion Boutique → choose current place (e.g. Jan) → Choisir une réception · sans
scanner → choose supplier receipt → Tout sélectionner or check individual pieces
→ Déplacer la sélection → destination Jim → verify and explicitly confirm.
Only received physical units at that place and in that receipt are eligible.
Elsewhere and in-transit pieces are excluded. The initial read follows every
server page; missing/cyclic pagination fails instead of presenting a partial
shipment as complete. Refresh and receipt changes clear selection.

The existing guarded, actor-bound session performs server preview, then the same
ID/revision/idempotency request is confirmed. The receipt entry offers only move,
up to 100 units; scan sessions and all other actions keep their 50-unit limit.
The fixed bottom selection summary remains reachable for long receipts.
Receipt, finishing, customer reservations and buyer notifications are separate.
No production stock operations are part of verification.

## Compatible server change

Manager-only list adds supplierBatchId, supplierOrderReference and a stable
document-ID cursor with 200 records per page and one lookahead. Existing clients
still receive their preview and assignees. Only move accepts up to 100 units;
all existing role, feature, actor, revision, source-place, transport, reservation,
idempotency and transaction guards remain. No Firestore rules, flags, minimum
version, signing, native dependencies or Firebase identity change.

## Validation

- Existing required cloud Flutter suite: 74 tests passed before the final
  management-entry test and small synchronous UI guards; final focused checks
  are recorded on completion.
- Real isolated Firestore emulator: 16 scenarios passed, including >200 record
  pagination, batch identity, manager-only read, 60-piece atomic location-only
  move, stale rejection, exact unselected remainder and idempotent replay.
- Native iOS compilation/signing/upload must run on Apple Xcode Cloud using the
  existing manual CalyMob iOS — TestFlight workflow. No local native build.
- Marketing version remains 1.26.1; actual CI_BUILD_NUMBER supplies a new unique
  build number above 520. French notes require Jan's approval before starting the
  workflow because its archive automatically uploads to internal TestFlight.
- This document does not claim TestFlight availability or a physical camera test.
