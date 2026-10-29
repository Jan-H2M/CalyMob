# CalyMob — current release status (source of truth)

_Last updated: 2026-10-29. When this file and older release notes disagree, this file wins._

## Store state
- **App Store live:** 1.27.0 (523), live since 2026-10-17.
- **In flight:** 1.27.1, App Store build **535** built with **Xcode Cloud** from
  `codex/joint-bug-build-20261028` (the current DEV content, already tested as 534).
  Build 534 was an internal-only TestFlight build and cannot be submitted.
- **Next build reservation:** local `dev` records **1.27.1+536**. Xcode Cloud must
  consume build 536 exactly. This reservation comes from the live Xcode Cloud run
  counter (latest run 535), not merely the latest uploaded App Store build. Failed,
  canceled and skipped runs consume numbers too; stale reservations are blocked by
  `ci_post_clone.sh`.
- **Next:** 1.28.0 = PR #166 (`codex/release-1.28.0`, draft, do not merge) once the
  COM-147/MOB-044 backend (Functions + rules) is live.
- **Security:** runtime dependency patch (handlebars, proxy-addr, body-parser, qs)
  in its own PR from `codex/functions-runtime-security-dev-20261029`. Not deployed.

## iOS build flow (current)
1. iOS builds are produced **only via Xcode Cloud** (App Store Connect → Xcode Cloud).
   Local Fastlane/Transporter uploads and Codemagic are no longer used for iOS.
2. Internal TestFlight builds are not App Store eligible; start an App Store
   build for anything that will be submitted for review.
3. Create the App Store version in App Store Connect, attach the build, answer the
   age-rating questions, then submit for review. Release notes are French only.
4. Store submission, backend deploys and rules deploys each need Jan's explicit approval.

## Build-number source of truth

- Xcode Cloud is the live product-wide counter; run 535 was observed read-only on
  2026-10-29. `scripts/bump_version.sh` reads it and reserves exactly the next number.
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
