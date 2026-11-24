# CalyMob — current release status (source of truth)

_Last updated: 2026-11-24. Live store queries always take precedence over this dated document._

## Store state
- **App Store live:** 1.30.5 (latest verified public version before this release).
- **Google Play production:** versionCode 551 at 100% before this release.
- **Prepared release:** 1.30.9 (553), containing the redesigned reimbursement
  request form from PR #261 and the security hardening already merged in PR #263.
- **iOS:** build 553 is reserved from the live Xcode Cloud counter (latest run
  552). It must be built from the exact merged `main` commit, then submitted for
  App Store review with automatic release after approval. TestFlight group
  assignment is intentionally not part of this public release.
- **Android:** the signed AAB must come from that same exact `main` commit and
  be released to production at 100% as versionCode 553.
- **Release notes:** French and Dutch metadata describe the new type-first
  reimbursement form, optional activity link and expected-amount check.
- **Backend/data scope:** no Firebase deployment or Firestore write belongs to
  this store release.

## iOS build flow (current)
1. iOS builds are produced **only via Xcode Cloud** (App Store Connect → Xcode Cloud).
   Local Fastlane/Transporter uploads and Codemagic are no longer used for iOS.
2. Internal TestFlight builds are not App Store eligible; start an App Store
   build for anything that will be submitted for review.
3. Create or update the App Store version in App Store Connect, attach the build,
   publish French and Dutch notes, answer the required declarations, then submit
   for review with automatic release after approval.
4. Store submission, backend deploys and rules deploys each need Jan's explicit approval.

## Build-number source of truth

- Xcode Cloud is the live product-wide counter; run 552 was observed read-only on
  2026-11-24. `scripts/bump_version.sh` reads it and reserves exactly the next number.
- `scripts/run_fastlane.sh` and both platform Fastfiles re-read the live counters before every store mutation and
  fails clearly if local source is neither the matching latest build nor its exact next
  reservation.
- External schema-v2 release manifests record the live counter and, for iOS, the exact
  successful cloud run ID, source commit, linked App Store build ID, status, version,
  build and workflow. No local IPA can satisfy the iOS gate.
- `ci_scripts/xcode-cloud-workflow.json` is documentation-only snapshot data, never an
  applyable workflow definition.

## Historical documents
`APP_STORE_PUBLICATIE.md`, `docs/MOBILE_RELEASE_QUEUE.md`, `docs/RELEASE_GATE.md`
(Fastlane mapping) and `docs/PUBLICATION_REPORT_2026-01-21.md` describe earlier
releases and the older Fastlane flow. Keep them for history; do not follow them
for iOS uploads.
