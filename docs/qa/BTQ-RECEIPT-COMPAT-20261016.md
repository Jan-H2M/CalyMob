# Receipt / later plain-control compatibility

Jan's corrected workflow receives a parcel at its actual current location without an embroidery choice. The related web release 0121d03930e823659eaa4f20e987708259fcc32e also selects a received supplier shipment at one location and moves that group without individual scanning.

QR backend source 731ef96475283a0899227b3772dcb183887b018e keeps unknown stock conservative at receipt. Only a later explicit reviewPlain action with its required note may confirm unknown stockPurchaseOrderId pieces as not requiring embroidery. Known required embroidery, unknown historical origin and customer personalization remain protected. That action retains location and records its requirement decision at control time.

Independent exact-source review approved. Fifteen isolated Firestore emulator cases pass, including unknown-stock plain-control success and known/customer-embroidery rejection. Only boutiquePhysicalOperations was deployed to calycompta/europe-west1. ACTIVE updateTime 2026-10-16T14:16:19.547863530Z, immutable source generation1792160057850672; all260 tracked function files match. Unauthenticated access returns HTTP401. Private proof files are in /private/tmp/btq-late-plain-backend-* and contain no published credential output.

No notification function, flag, rules, published minimum version, signing or iOS binary changed. Existing CalyMob1.26.1(520) retains its scanner and later control actions. The new select-entire-shipment UI is in the Calypso web interface. Verification submitted no real stock operation or buyer notification.
