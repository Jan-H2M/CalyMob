# Payment repair and independent Codex review — 2026-08-31

## Scope and cause

The payment server boundary introduced in August was lost when merge `9ca5d97`
replaced `operation_service.dart` with the older waitlist branch version. This
reintroduced client accounting writes. The repair restores the three callables,
retains activity payment-method restrictions, and matches confirmation permissions
to server roles. This audit does not prove historical financial loss or the source
commit of a store binary. No historical payment migration is part of this repair.

## Changes

- Mobile calls `recordOnSitePayment`, `recordInstallmentPayment`, and
  `recordPaymentCommunication`; no direct client accounting writes in these paths.
- Only admins/superadmins and the existing organizer club statuten can confirm
  payments. Guest/scanner rights do not grant accounting authority.
- The server transaction rechecks authorization, activity policy and registration.
  Cancelled registrations, invalid amounts, bank receipts and waivers are protected.
- Whole-payment confirmation rejects tranche maps: confirm each tranche separately.
  Each onsite tranche retains its own actor/time/source; the final parent remains
  `transaction_matched=false` until bank settlement actually completes.
- The payment sheet prevents repeated clicks and handles dismissal safely.
  A partial group failure refreshes authoritative state and does not claim that
  everyone was paid or that nothing changed.
- CalyCompta recognizes explicit provisional onsite evidence during later bank
  reconciliation; unknown historical paid rows remain protected. Bank allocations
  and failure reporting are checked transactionally to avoid overwriting winners.

## Independent reviewer comments addressed

The reviewer was a separate **Codex** agent, not the implementing agents.

1. Payment-sheet processing state reset on rebuild, allowing repeat clicks: fixed,
   with widget regression tests and dismissal coverage.
2. Group payment can partially succeed: truthful warning and authoritative refresh.
3. Whole-call parent closure could leave open tranches: reject that call for tranches.
4. Missing per-tranche provisional evidence: added actor/time/source and bank-pending
   parent state; ambiguous legacy rows are not silently migrated.
5. Waived or bank-linked records could be changed by QR/onsite actions: preserved.
6. Allocation lookup could block a legitimate different tranche: distinguish its
   existing bank evidence without weakening duplicate guards.
7. A stale failure handler could overwrite concurrent successful reconciliation:
   conditional transactional failure write, with interleaving regression.
8. Test output incorrectly implied clean-commit provenance: now explicitly labels
   a tested working tree; a store upload requires separate reviewed provenance.
9. Android upload-only authority could also submit a release: separate upload and
   submission permissions are now mandatory. Manifest test evidence must also
   name the exact source commit and a passing run; it remains an unsigned attestation.

Independent code review accepted mobile `0353264`, server `35c4528`, web `65a68bc`,
and upload guard `ca6ad8f`, with the explicit limitations below. Follow-on root
changes wire the Codemagic hold and require source-bound automated test evidence.

## Verification evidence

- Full Flutter suite: **487 passed, 1 pre-existing skip, 0 failures**.
- Flutter analyzer: **0 errors**, 955 existing nonblocking warnings/information.
  CI does not suppress errors; warning cleanup is outside this financial repair.
- Full Cloud Functions Jest suite: **170 passed** (35 new callable guard cases).
- Independent reviewer reran 51 focused Flutter cases and all 35 callable cases.
- CalyCompta API suite initially 80 passed; follow-on review regressions are recorded
  in the web dossier and final handoff, rather than rewriting this initial count.
- Real Firestore emulator: callable repeated/concurrent tranche confirmations and
  bank evidence preservation passed; separate settlement same/competing receipt
  contention passed. Reviewer independently reran both. Only unique synthetic
  documents in local `demo-payment-repair` were written.

## Release gates and remaining acceptance

`scripts/verify_payment_release.sh` runs locked dependency resolution, analyzer,
all Flutter tests and all function tests. GitHub Actions and supported APK/AAB and
Codemagic builds use it. A test failure stops the build. GitHub required-branch
checks must be verified separately; adding a workflow does not enable protection.

Store-upload guards require an external, explicit release manifest. It is a local
safety interlock, not a signed approval system or cryptographic proof of build
origin. Never manufacture Jan approval, native review, source provenance, or
uploaded-build evidence to satisfy the guard. No approved manifest is created by
this repair. Existing binaries are not certified by passing source tests.

Outstanding before release: deploy the three Firebase functions with Jan's separate
approval, verify deployed code and authorized behavior, build the approved combined
version, inspect it visually and functionally on iOS/Android, bind artifact hashes
to exact tested source and approved French notes, then submit as authorized.
`settings/app_version` remains manual for Jan after store availability. Source-code
review is not native visual approval, production acceptance, or store approval.
