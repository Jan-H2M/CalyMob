# CalyMob — current release status (source of truth)

_Last updated: 2026-10-29. When this file and older release notes disagree, this file wins._

## Store state
- **App Store live:** 1.27.0 (523), live since 2026-10-17.
- **In flight:** 1.27.1, App Store build **535** built with **Xcode Cloud** from
  `codex/joint-bug-build-20261028` (the current DEV content, already tested as 534).
  Build 534 was an internal-only TestFlight build and cannot be submitted.
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

## Historical documents
`APP_STORE_PUBLICATIE.md`, `docs/MOBILE_RELEASE_QUEUE.md`, `docs/RELEASE_GATE.md`
(Fastlane mapping) and `docs/PUBLICATION_REPORT_2026-01-21.md` describe earlier
releases and the older Fastlane flow. Keep them for history; do not follow them
for iOS uploads.
