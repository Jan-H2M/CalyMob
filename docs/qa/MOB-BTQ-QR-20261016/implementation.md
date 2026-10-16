# MOB-BTQ-QR-20261016 — CalyMob physical Boutique sessions

Released rollout: CalyMob 1.26.1 (520) is available in the approved internal TestFlight group. Jan subsequently explicitly authorized the necessary production QR backend and Gestion Boutique activation. Both server functions and their two indexes are live; boutiqueQrEnabled was enabled for Calypso on 2026-10-16 at 12:13:13 UTC (14:13 Brussels). The received-piece QR printouts use this permanent v1 article URL contract. No live pickup mission was created during verification.

## Operational behavior

- Active members with the RB function get Gestion Boutique when boutiqueQrEnabled is true. An admin role alone is insufficient. Existing shopping and section permissions remain separate.
- Several selected members (Accueil first, searchable) share one concrete seven-day pickup mission. Their entry is Mes remises; they cannot browse the inventory, prices, procurement or other missions. RB withdrawal, membership withdrawal, expiry and revocation are checked on the server on every request. Client membership/flag withdrawal hides guarded screens immediately; assignment changes refresh within 30 seconds, mission lists within 12–15 seconds or by manual refresh.
- Scan up to 50 distinct physical pieces at one location, choose one action, review one server preview and confirm the lot. Duplicate, foreign-club, sold and different-location scans fail closed. Every mutation binds the confirmation to its original authenticated actor and checks exact piece revisions, physical reservations and current rights in one Firestore transaction.
- Jim completion does not move pieces or notify buyers. Dispatch creates an explicit in-transit state. Arrival is a separate physical confirmation. Stock becomes sale-ready only after arrival/inspection; revoked transport keeps its last recorded physical location, requiring RB recovery.
- Pickup notifications are created atomically with actual arrival, one deterministic history document and outbox per eligible order/unit set. Full paid orders are the default; RB can explicitly authorize partial pickup. Unpaid, additional-payment, incoherent or shipping orders are held. Worker rechecks current payment/place/mission before one push attempt, respects push opt-out, and never modifies legacy badge counters or duplicates history. Ambiguous push responses are marked unknown for human review rather than automatically repeated.
- Existing Calypso stock reservation and Jim completion can finish the remaining pieces after a mobile partial handover. Only a sold peer with immutable QR proof for that exact buyer/order/line counts as completed; that sold piece is never written again. A new paper handover for a partial mobile line is disabled with a clear CalyMob continuation.
- Handover scans article labels and the buyer's existing raw member-ID QR, followed by a separate staff confirmation. Full-order missions reject missing article scans. Proof records actual helper, recipient, pieces, place and time as member_qr, not a signature. Concurrent helpers cannot deliver the same piece twice. Exact confirmation keys let a retry retrieve the first committed result.

## Source and compatibility

Callable boutiquePhysicalOperations and Firestore trigger sendBoutiquePickupNotification live in the existing Firebase europe-west1 backend. New operational collections are server-only: boutique_stock_operations, boutique_pickup_missions, boutique_pickup_notifications, boutique_handover_receipts. No direct client rules are broadened. Do not deploy CalyMob's old full firestore.rules over current Calypso rules.

CalyCompta's paired local worktree mob-btq-qr-web-20261016 adds the new event/proof display and protects transport-managed pieces from conflicting web edits. Those compatibility changes need their own reviewed web publication before mobile rollout.

## Validation and review

Independent final review found no remaining blockers for application commit 989a77e5967e1002306be5d04d3de3099ec2f124 and paired web commit 5218507cfd86d74f09fdf58e8decb4a62a3642ca. Reviewer reran 61 web tests, 13 emulator cases and 8 Flutter tests successfully; real camera, production push and store packages remain device/release checks.

Application candidate: `989a77e5967e1002306be5d04d3de3099ec2f124`. Paired web candidate: `5218507cfd86d74f09fdf58e8decb4a62a3642ca`. Current final checks: 65 Flutter tests passed, 13 real-emulator scenarios passed, modified Boutique/guard/notification Dart analysis clean; paired web 433 tests across 39 suites, TypeScript and production build passed. The local Flutter web compilation displays the actual mobile widgets, without Firebase production initialization. Native phone camera, signed app packages and real push are intentionally still device/release checks.


- QR parser tests use the exact URL independently decoded from the real printed Calypso A4 PDF.
- Real local Firestore emulator demo-boutique-qr on 127.0.0.1:8087 exercises 25-piece atomic completion/dispatch/arrival, eight complete paid buyer messages, held unpaid orders, wrong recipient, explicit physical confirmation, duplicate retries, two helpers racing, role withdrawal, wrong club, stale selection, shipping hold, expiry, revocation/recovery and idempotent outbox delivery.
- Flutter regression set covers parser/25-piece selection, current Boutique guards, existing shopping policy, QR-only RB access, scoped helper entry, live revocation, own-order notification routing and stable retry identity.
- Local UI entry test/qa/boutique_qr_preview.dart uses only fictive in-memory responses and no Firebase initialization. It is review evidence, not a backend emulator or production mode. Screens were inspected at 390×844, including management, delegation and handover.
- Physical phone camera, real print hardware, actual FCM transport and store packages still require device/release verification. No customer message has been sent by this work.

## Explicit rollout order

1. Independent review of exact candidate commits, including CalyCompta compatibility.
2. Add only the two mission indexes defined in functions/config/boutique-qr-indexes.json to the existing production index set; wait for readiness. The helper query filters active status and future expiry before cursor pagination, so closed/expired history cannot hide current work. Do not replace or deploy an old full CalyMob rules/index set.
3. Publish reviewed web compatibility separately.
4. Deploy only the two new Firebase functions, preserving existing functions and rules.
5. Build/sign and test a new CalyMob version on a real authorized RB device; verify camera and scanned printed labels, then test a scoped helper device and actual push using dedicated test members.
6. Publish store version and enable boutiqueQrEnabled for Calypso only after separate authorization. Do not enable the flag before the server functions and compatible app version exist.

## Reproduce

Start Firebase Firestore emulator with firebase.boutique-qr.json and demo project demo-boutique-qr. Then:

    FIRESTORE_EMULATOR_HOST=127.0.0.1:8087 GCLOUD_PROJECT=demo-boutique-qr node --test functions/test/boutique/physicalOperations.emulator.cjs

The test refuses any other host/project, creates only synthetic data and removes that test club afterwards. Dependency symlinks, emulator logs and local build output are excluded from the candidate.


## Authorized production activation — 2026-10-16

Jan explicitly authorized the necessary QR backend and activation after the
initial TestFlight-only release. This supersedes the earlier no-backend boundary
for these exact QR functions, required indexes, web compatibility and one flag.

Backend source 349ff91758cacb4445d8d9f346189122e479632c was independently reviewed;
QR functional files remain identical to reviewed feature source 989a77e. Only
boutiquePhysicalOperations and sendBoutiquePickupNotification were deployed to
calycompta / europe-west1 / Node.js 22. Both are ACTIVE. The actual immutable
uploaded ZIP generations were downloaded and all 214 runtime/package source files
in each matched the reviewed commit byte-for-byte. The notification trigger is a
created-document pattern on the default database in eur3, with idempotent retries.

Only the two exact mission indexes from functions/config/boutique-qr-indexes.json
were added; both are READY. Read-back comparison confirms all 76 pre-existing
indexes are unchanged (78 total). Function metadata comparison confirms all 121
pre-existing functions are unchanged (123 total). No Firestore rules, published
minimum app version, certificates or member roles were changed.

Paired live web source 3b6dbb5169b4c9041f7e42d110cf2f4f46568957 is the exact
independently verified combination of reviewed compatibility 5218507 and the
supplier print fix 0486044. Production deployment dpl_8ZSqA8Hn3NjTFJskgqsUQCpgxBLd
is READY and serves caly.club. The received-piece QR print panel is preserved.

After all readiness checks, a compare-and-set PATCH changed only
clubs/calypso/settings/feature_flags.boutiqueQrEnabled to true. The field was
previously absent. A read-back verified all other settings unchanged. The final
activation helper also received independent review. The public callable rejects
an unauthenticated request with HTTP 401 / UNAUTHENTICATED.

Fresh verification: 13 emulator scenarios passed using only demo-boutique-qr;
170 focused web tests / 5 suites passed, with 175 / 6 independently passing;
TypeScript and Vite production build passed. A broader default Jest run had
16 failed suites / 119 failed tests; its old assistant mock failure was reproduced
on the previous live print source. Do not report the broad run as green.

Read-only production domain checks confirm the real RB account can manage,
the actual printed physical unit resolves, the initial stock list loads and the
mission query succeeds. These checks did not move stock, create a mission or send
a buyer message. Physical iPhone camera and scan feedback was requested after
activation; do not claim device-camera proof before that result arrives. The
existing TestFlight build 520 is sufficient; no extra native build was performed.
