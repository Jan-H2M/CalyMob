# CalyMob — current release status (source of truth)

_Last updated: 2026-11-24. Live store queries always take precedence over this dated document._

## Store state
- **App Store live:** 1.30.5 (latest verified public version before this release).
- **Google Play production:** versionCode 553 at 100%, completed on
  2026-11-24 at 19:18 Europe/Brussels. The signed AAB came from `main` merge
  commit `391e2c7f8bc0112cdaa26a78cdcd1914dbc8b7c3` and includes the redesigned
  reimbursement request form from PR #261 plus security PR #263.
- **iOS blocker:** 1.30.9 (553) is reserved but has not been built or submitted.
  Xcode Cloud rejected the manual start before creating a run because branch
  `main` is not associated with workflow `D11B66EC-6E95-43A4-B345-727D1992D72A`.
  The latest successful run remains 552 (`VALID`). Add `main` to that workflow's
  manual branch start condition, then start build 553 from exact merge commit
  `391e2c7f8bc0112cdaa26a78cdcd1914dbc8b7c3` and submit it with automatic
  release after approval. No TestFlight group wait is required for this public
  release.
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
