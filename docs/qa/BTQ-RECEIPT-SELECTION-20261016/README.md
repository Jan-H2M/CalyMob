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

## Verified release — 2026-10-16

- Exact independently reviewed source: 7894cf34e394f0265af6bd07efe389361d5cd0b9.
  Final focused Flutter run: six tests passed; static analysis: no issues.
- Jan explicitly approved the committed French WhatToTest text and upload to the
  existing internal CalyMob Testing team in this chat before the cloud run.
- Reused manual workflow CalyMob iOS — TestFlight,
  D11B66EC-6E95-43A4-B345-727D1992D72A; run
  2688cb4c-0ff0-4b77-9c96-c14f2ddf24db, build 521, marketing version 1.26.1.
  Both required TEST and ARCHIVE actions completed SUCCEEDED; full run completed
  SUCCEEDED at 2026-10-16T15:39:48.13Z. No local native build/archive was used.
- Both Apple workers passed all 75 Flutter tests. Native
  RunnerTests.testProductionBundleConfiguration passed on iPhone 15/iOS 17.5.
  Native archive log records ARCHIVE SUCCEEDED at 15:18:21.340879462Z.
- Real internal upload: ASC build 42c7daaf-380e-4f09-8358-1bf3efc8ef08,
  uploaded at 15:22:30Z, processed VALID, INTERNAL_ONLY, non-expired. The final
  cloud archive action closed after the binary itself had already processed;
  the uploader guard remained intact and group assignment waited for full success.
- The actual Apple app-store IPA export identifies be.calypsodc.calymob,
  1.26.1/521, profile team 53455KKD9G and get-task-allow=false. Its IPA SHA-256 is
  a5432ab926d304bcb066d568bf8aef79ccc9eecdd95c9462a1ac3e9143160bd5.
  Profile metadata was read without altering keychains, certificates or signing.
  Apple processing VALID is separate from that metadata inspection.
- Exact approved fr-FR notes were saved and read back; the existing internal
  CalyMob Testing team membership was explicitly assigned and verified.
- Only boutiquePhysicalOperations was redeployed in calycompta/europe-west1;
  ACTIVE updateTime 2026-10-16T15:02:41.635658299Z, source generation
  1792162863598057. All 260 tracked function files match the reviewed source ZIP.
  The exact production list and cursor queries passed read-only. No index, rule,
  feature flag, minimum version or notification function changed. No business
  stock/receipt/finishing/notification operation was performed during validation.
- Web individual/all/none selection is live separately at caly.club from
  fe8dda10dac4e6bff72e7e8d136d4e609b24876e,
  deployment dpl_4BAHgdTUm1tkYQgWQsda51wLsmTg. The live Jan account confirmed
  16 pieces at Jan and one elsewhere; all-minus-one and clearing were verified
  without submitting a move. Unrelated concurrent invoice CI work was preserved.
- Functional Flutter-web screenshots use fictitious data and remain outside Git.
  Physical phone installation/selection feedback remains a separate user check;
  cloud simulator success does not prove a physical device test.
