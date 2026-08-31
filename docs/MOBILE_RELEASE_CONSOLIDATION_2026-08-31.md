# Mobile consolidation — 2026-08-31

## Scope and version

Jan requested one combined mobile build for Android and iOS. This branch combines
the three newly authorized fixes with current `origin/main` (64e58a8).
Proposed release: **1.21.0 (204)**, pending Jan's version/text approval.
Current pubspec remains **1.21.0+203**. No version bump, build, upload, push or
Firestore app-version publication has been performed by this consolidation.

| Original fix | Consolidated commit | Scope |
|---|---|---|
| COM-065 8b0f1a7 | c9122fb | Explicitly provisional automatic dive numbers |
| COM-070 bcbb93b | cbadb75 | Pool gonflage 22h30, legacy assignments preserved |
| COM-068 708a567 | 7840fe8 | Type/option loan request without reservation; physical assignment at handover |

All original branches/worktrees are preserved. Only release-queue documentation
conflicted during cherry-pick; all three dossier entries were retained.

## Changes after store build 202

Repository marker for build 202: 1870d88 (`1.20.4+202`). Since then main contains
70734cb and restoration 1b52293 via PRs 54/55:

- Shared emergency contacts accessible from Who's Who to authorized staff/CA.
- Emergency-contact sharing defaults on for unspecified preferences; explicit
  refusal remains respected. This is existing main behavior, not changed here.
- Profile completion reminders for photo/emergency contact.
- Cancelled activities remain accessible, discussion retained, registration blocked.
- Visibility/registration checks for activity drafts and cancelled activities.
- Complete operation detail screen restored after the first profile change.
- The three fixes above complete the intended new batch.

### Proposed French notes — NOT approved/uploaded

- Contacts d’urgence partagés accessibles aux encadrants et au CA.
- Rappels pour compléter votre profil.
- Activités annulées consultables, sans nouvelle inscription.
- Carnet : numéros proposés signalés comme provisoires.
- Piscine : gonflage à 22h30, anciennes affectations conservées.
- Prêts : demande sans réservation et choix des pièces lors de la remise.

## Historical remote branches retained

Read-only fetch completed; main unchanged. There are 23 origin refs including
origin/HEAD/main. Patch uniqueness is not proof of missing functionality: squash
merges and later changes alter patch IDs. Nothing was deleted or blindly merged.

| Branch group | Finding / disposition |
|---|---|
| agent/active-members-only, agent/internal-ticket-alerts, bug-com-043-reference-search, bug-remove-unpaid-auto-cancel | Patch-equivalent changes on main; retained pending coordinated cleanup |
| bug-com-045-event-waitlist, bug-com-059-material-loan, bug-com-059-material-loan-incidents, bug-zeeland-payment-ledger, calymob-feedback-fixes, emergency-contacts-whoiswho, release-calymob-1.19.0, feat/com-062-inscription-log | No unique commits relative to main; retained |
| bug-com-046-notification-regression | Real unmerged routing/unread work (057aae1); separate evaluation required, not silently included |
| bug-com-045-default-waitlist | Real enabled-default behavior + function changes (330b032), main currently false; separate product/backend approval, not included |
| agent/logbook-country / reference-location-matching | Mixed older country/reference feature history plus missing GPS/import scripts; preserve, no data scripts executed |
| material-layout-refresh / release-calymob-1.20.1-199 | Material UI/model files match main; release/version metadata from older builds must not overwrite current version |
| remove-legacy-linear | Bug-report service/profile/widget changes already match main; other later source differences retained, not blindly replayed |
| review-dive-location-cleanup | Historical Fastlane key correction already present in main |
| release-1.18.0 | Old version/notes and optional Fastlane environment overrides; not a mobile application feature; preserved |

## Release blocker: reverted payment command boundary

The three failing `operation_payment_status_integrity_test.dart` tests must NOT
be suppressed as stale fixtures. Merge **9ca5d97** replaced the server command
boundary with direct client accounting writes. Its first parent still contains
the correct server calls; the issue is already present at build 202.

Minimal proposed restoration (awaiting Jan approval because financial path):

| Method, unchanged signature | Restore existing callable (europe-west1) | Arguments |
|---|---|---|
| markParticipantAsPaid | recordOnSitePayment | clubId, operationId, participantId |
| markInstallmentAsPaid | recordInstallmentPayment | same + installmentId |
| updatePaymentStatus | recordPaymentCommunication | same + status |

Replace only those method bodies with the pre-merge implementations from
`git show 9ca5d97^:lib/services/operation_service.dart`. Keep current waitlist,
profile and registration checks. Remove their direct `payment_status`, `paye`,
`installment_payments` writes; server owns validation and accounting projections.
The callable exports exist in source; verify deployed availability separately.
No new backend code/rules required by the proposed restoration.

**Recommendation: do not upload this batch until restoration is approved,
implemented, and payment-boundary tests pass.** No protected code changed yet.

## Remaining release gates

Consolidated validation: **436 passing / 3 failing / 1 skipped** Flutter tests.
The three failures are the protected payment-boundary regression described above.
Targeted analyzer across ten changed Dart files: **no issues**. The browser-only
real-emulator test was run separately and passed; the remaining skip is its
unsupported FakeFirestore contention counterpart, not missing real evidence.

- Version and French text approval.
- Protected payment restoration and complete test run.
- Real Firestore concurrency: **1/1 passed** with the actual Dart service,
  headless Chrome and local demo Firestore emulator 1.20.4. Exactly one of two
  competing handovers acquired the item; the loser remains pending with no IDs.
- Independent full code/visual/functional review of the combined mobile version.
- Android/iOS signing and store submissions by the lead after approval.
- Firestore app-version publication remains Jan's separate manual action.

### Reproduce real concurrency check (no production)

Use Android Studio's bundled Java 21 on PATH, then:

```sh
firebase emulators:exec --only firestore --project demo-calypso-release \
  --config scripts/emulator/mobile-release.firebase.json \
  'flutter test --no-pub --platform chrome --dart-define=RUN_FIRESTORE_EMULATOR=true --reporter expanded test/integration/material_handover_emulator_test.dart'
```

The fixture binds to 127.0.0.1:8087 and grants access only to the
`emulator_handover` test club. Never deploy this test rules file. Both the
emulator and browser were shut down by emulators:exec after successful completion.
The FakeFirestore concurrency test remains skipped because that package does
not implement contention; the separate real emulator test now supplies the evidence.
