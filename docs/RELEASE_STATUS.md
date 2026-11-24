# CalyMob — current release status (source of truth)

_Last updated: 2026-11-24. Live store queries always take precedence over this dated document._

## Store state
- **App Store live:** 1.30.5 (latest verified public version before this release).
- **Google Play production:** versionCode 553 at 100%, completed on
  2026-11-24 at 19:18 Europe/Brussels. The signed AAB came from `main` merge
  commit `391e2c7f8bc0112cdaa26a78cdcd1914dbc8b7c3` and includes the redesigned
  reimbursement request form from PR #261 plus security PR #263.
- **App Store review:** 1.30.9 (555) is `WAITING_FOR_REVIEW`, verified on
  2026-11-24 at 20:43 Europe/Brussels. App Store Connect version ID
  `2732204f-6fb4-4965-9f1a-90147513c69d` has build ID
  `29915fb3-7437-4e10-a78e-4302afb79859` attached, with
  `usesNonExemptEncryption=false` and `releaseType=AFTER_APPROVAL` (automatic
  release after Apple's approval). It was built from exact `main` commit
  `6a1e5acb3c7a297c5a26205af4a08eb01c01be43` by Xcode Cloud run
  `74a65fb1-3315-4b65-8a01-b3e0f8aca06d`; both Test and Archive actions
  succeeded and the build is `VALID`. No TestFlight group assignment was used.
- **Release notes:** French and Dutch metadata describe the new type-first
  reimbursement form, optional activity link and expected-amount check. The
  App Store historically had only French base metadata, so the Dutch listing
  retains its Dutch release notes while its required description, keywords and
  support URL were copied unchanged from the live French 1.30.5 listing.
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

- Xcode Cloud is the live product-wide counter; build 555 was verified `VALID` on
  2026-11-24. `scripts/bump_version.sh` reads it and reserves exactly the next number.
- `scripts/run_fastlane.sh` and both platform Fastfiles re-read the live counters before every store mutation and
  fails clearly if local source is neither the matching latest build nor its exact next
  reservation.
- External schema-v2 release manifests record the live counter and, for iOS, the exact
  successful cloud run ID, source commit, linked App Store build ID, status, version,
  build and workflow. No local IPA can satisfy the iOS gate.
- `ci_scripts/xcode-cloud-workflow.json` is documentation-only snapshot data, never an
  applyable workflow definition.

## Xcode Cloud manual-start recovery record

Before authorizing `main` for the 1.30.9 (553) build on 2026-11-24, workflow
`D11B66EC-6E95-43A4-B345-727D1992D72A` had this exact
`manualBranchStartCondition`. Restore this JSON to return to the previous branch
scope after the release if desired:

```json
{
  "source": {
    "isAllMatch": false,
    "patterns": [
      { "pattern": "dev", "isPrefix": false },
      { "pattern": "codex/mob-xcode-cloud-20261016", "isPrefix": false },
      { "pattern": "codex/joint-bug-build-20261028", "isPrefix": false },
      { "pattern": "codex/release-next-1.29.0-missions-1101", "isPrefix": false }
    ]
  }
}
```

`main` remains appended to that condition. The workflow was unlocked only for
the condition update and was locked again before the builds started.

Build 553 failed because the cloud test script still named six test files that
were not present on `main`; PR #266 removed only those stale arguments and
reserved build 554. Build 554 then failed only in the test action after three
CocoaPods CDN timeouts; PR #267 reserved the permitted network-flake retry as
build 555. Build 555 succeeded and is the build submitted above.

## Historical documents
`APP_STORE_PUBLICATIE.md`, `docs/MOBILE_RELEASE_QUEUE.md`, `docs/RELEASE_GATE.md`
(Fastlane mapping) and `docs/PUBLICATION_REPORT_2026-01-21.md` describe earlier
releases and the older Fastlane flow. Keep them for history; do not follow them
for iOS uploads.
