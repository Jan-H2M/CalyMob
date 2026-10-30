# CalyMob — current release status (source of truth)

_Last observed: 2026-10-30 (1030T/1030U). Live store queries always take precedence over this dated document._

## Store state
- **App Store:** 1.27.1 (535), Ready for Distribution / Ready for Sale,
  downloadable, review COMPLETE. Submitted 2026-10-29T15:38:00.375Z; exact
  approval/publication times were not returned and remain unknown.
  Xcode Cloud run `dddd599f-512f-455d-b47f-b1f82b4e6a92` binds public build
  `1c3b529b-5e24-4042-801b-9ae7121c01b1` to `eb33add9`. Build 534 remains
  internal-only and is not the public submission.
- **Google Publisher:** production 1.27.0 (523), completed, maximum observed
  bundle code 523 on 30 October. This counter read is not a new console/storefront
  public-availability verification.
- **Next build reservation:** this release branch records **1.28.0+536**. Xcode Cloud must
  consume build 536 exactly. This reservation comes from the live Xcode Cloud run
  counter (latest run 535), not merely the latest uploaded App Store build. Failed,
  canceled and skipped runs consume numbers too; stale reservations are blocked by
  `ci_post_clone.sh`.
- **Preparation:** `codex/release-next-1030U` consolidates restored DEV (MOB-043
  PR #181) with the complete source from protected PR #166. The protected PR
  itself remains unchanged. This new package is PR/CI-only: no release-branch
  merge, distribution build or submission is approved by task 1030U.
- **Dependencies:** verify the Boutique top-up, COM-147/MOB-044 and palanquée
  CalyCompta/Functions/rules counterparts before any eventual public release.
  Their production compatibility/deploy state is not established by this package.
- **Security:** runtime dependency patch (handlebars, proxy-addr, body-parser, qs)
  in its own PR from `codex/functions-runtime-security-dev-20261029`. Protected
  commit `084507c` is not included or authorized for deployment by this package.

## iOS build flow (current)
1. iOS builds are produced **only via Xcode Cloud** (App Store Connect → Xcode Cloud).
   Local Fastlane/Transporter uploads and Codemagic are no longer used for iOS.
2. Internal TestFlight builds are not App Store eligible; start an App Store
   build for anything that will be submitted for review.
3. Later, after separate exact-build approval, use the canonical verifier-backed
   Fastlane submission route for the matching Cloud build, metadata and review.
   Browser consoles are read-only verification, not an alternate mutation route.
   The existing French notes are approved; Dutch metadata is prepared as a
   translation and not represented as separately approved for store publication.
4. Store submission, backend deploys and rules deploys each need Jan's explicit approval.

## Build-number source of truth

- Xcode Cloud is the live product-wide counter; run 535 was observed read-only on
  2026-10-30. `scripts/bump_version.sh` freshly read it for the 1.28.0+536
  reservation. Recheck before any later approved build; do not reuse stale numbers.
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
