# CalyMob Xcode Cloud / TestFlight

## Confirmed scope

Jan requested Apple-hosted iOS builds on 2026-10-16. Local Fastlane compilation
is superseded for this release. Backend deployment, rules and minimum-version
changes remain forbidden; Jan explicitly reconfirmed that boundary.

## Verified identity and source

- Apple app: CalyMob, 6755293289, be.calypsodc.calymob, French metadata.
- Registered bundle seed/team: 53455KKD9G; push and associated domains enabled.
- Existing cloud product E3154008-9EFD-4FC5-864B-808B1CEC4CD3 is connected to
  Jan-H2M/CalyMob and that exact app record. No new repository connection needed.
- Reuse workflow D11B66EC-6E95-43A4-B345-727D1992D72A (formerly Default).
- Baseline f1d8a9fa79266f7b8280af90bc9765a789a8b204 is the recorded source of
  uploaded 1.26.1 (226), verified VALID in App Store Connect. Add the independently
  reviewed Boutique commits c584860, 16361dc, 989a77e, 19987ad on that baseline.
  Preserve both function exports when resolving their one additive conflict.

## Cloud configuration

The API payload is versioned at ci_scripts/xcode-cloud-workflow.json. It selects
Xcode 26.6 (17F113), macOS Tahoe 26.5.1 (25F80), Runner.xcworkspace and shared
Runner scheme; Release archive; a required iPhone 15 / iOS 17.5 native test action;
INTERNAL_ONLY distribution. All automatic triggers are removed. Start manually
only after Jan approves the French TestFlight notes. Do not change to Distribution
None and describe that as a TestFlight release.

Both supported post-clone locations run the same script. Flutter 3.38.9 is pinned
by tag and exact revision; CocoaPods 1.16.2 and committed Dart/Pod lockfiles are
enforced. Ruby 3.3.11 is installed and checked on the cloud worker because Apple's
system Ruby 2.6 cannot install the current native gem dependencies. Configuration
generation does not compile an iOS app. Apple performs
native compilation/signing/distribution. No credentials belong in these scripts.

Both Apple actions in build 517 installed all 84 Pods successfully, then the lock
drift check stopped on identical local-podspec checksum normalization. The checked
in checksum entries now match this fixed cloud toolchain. Parsed lock comparison
confirms every resolved dependency version, source and Podfile checksum is
unchanged. Keep the strict deployment and lock-drift checks enabled.

Gitleaks 8.30.1 classified the generated firebase_auth and local_auth_darwin
podspec SHA-1 entries as generic API keys. The two exact commit/file/rule/line
fingerprints are recorded in .gitleaksignore; no path, rule or future checksum
change is broadly excluded. The same official scanner, with its release archive
SHA-256 verified, scanned all 10 release commits (178,321 bytes) with no remaining
findings. This CI-only follow-up does not change the app being built as 518 from
fd68bb52ba7371c86426bf7f4c9f1d42910c1030.

Build 518 completed dependency setup, lock-drift checks and all 68 Flutter tests
on Apple's test worker. Its native build-for-testing failed because the existing
mobile_scanner 6.0.11 pod excludes arm64 simulator slices while Runner attempted
to import its generated x86_64 Swift header into an arm64 simulator build.
Debug Runner and RunnerTests now exclude arm64 only for iphonesimulator. The
required cloud test destination uses the available iOS 17.5 / iPhone 15 runtime,
which supports the dependency's x86_64 simulator slice. Release/device arm64,
dependency versions, signing, entitlements and required tests remain unchanged.

Marketing version stays 1.26.1. The generated configuration uses CI_BUILD_NUMBER
from Apple's existing product-wide counter (last observed 514), which must exceed
226; report the actual run number rather than the pubspec fallback number.

Use existing internal group CalyMob Testing team (e55ae21d-1ae0-4467-8bf4-7d1b4f8943fd),
which already has access to all builds. Do not add the external CA Testers group
or submit to beta review/App Store without separate authorization.

## French test notes — approved by Jan in this chat

Préparation du scan QR de la Boutique : sélection de plusieurs articles,
déplacements groupés et remise des colis. Ces nouvelles actions restent
désactivées dans cette version de test, dans l’attente de l’activation du service
Boutique. Merci de vérifier la connexion, la navigation Boutique et l’ouverture
des QR imprimés avec l’appareil photo.

Jan approved these exact notes and upload to the existing internal group. The
same text is committed in ios/TestFlight/WhatToTest.fr-FR.txt, beside the selected
workspace, for automatic discovery. Verify its import before testing. This approval does not
authorize backend activation, external testing or App Store publication.

Build 518's Release archive uploaded successfully as 1.26.1 (518), processed VALID
with INTERNAL_ONLY audience, despite its failed native test action. It was not
assigned to the internal group and was explicitly expired (then re-read as
EXPIRED). A successful archive alone is insufficient. Require all required cloud
actions to pass, verify the exact approved French notes and then explicitly
assign the successful build to the approved group. The group's all-builds setting
did not automatically include this Xcode Cloud build.

Apple did not import the notes for build 518. The existing TestFlight text file
is now also referenced by a TestFlight group in the Xcode project, following
Apple's documented project layout. This is a metadata reference only, without
target or resource membership. For the current release, also read the localized
TestFlight notes through the API and set the approved text if absent before group
assignment. This follow-up does not change the app compiled by build 519 from
74702e070203afe32836485a46eeef68e5a2b4e6.

The production print inspection found a separate UX omission: the supplier detail
dialog originally offered preparation sheets while received-piece QR sheets were
elsewhere. Jan separately authorized publishing the supplier print fix. It is
tracked and deployed from the dedicated web worktree, not this iOS source; see the
final result below. No receipt or stock data was changed during verification.

## Verification and limits

Local shell syntax, diff hygiene and the release-source widget suite are checked
before push. Native bundle/camera-permission configuration is checked by
RunnerTests on Apple's simulator. The actual Flutter FirebaseOptions identity is
checked in the required post-clone Flutter suite. Camera hardware and physical handover are
separate from simulator success. A reachable Jan’s iPhone 16 Pro was observed;
do not claim physical camera proof without an actual run and observed scan.
The feature guard remains off unless the production flag and required functions
already exist. No backend activation is authorized in this release.

Build 519 passed native build-for-testing and ran RunnerTests on iPhone 15/iOS
17.5. The bundle ID, camera and encryption checks passed, but the added test's
assumption of a bundled GoogleService-Info.plist was incorrect. CalyMob explicitly
lets firebase_core initialize from DefaultFirebaseOptions.currentPlatform in
main.dart. Check the exact iOS Firebase project/app/bundle identity in the Flutter
suite instead of requiring a file the app does not use. Keep the native bundle
checks and all existing 68 Flutter tests; the required cloud suite now has 69.
No app initialization, Firebase configuration or backend behavior is changed.


## Final release result — 2026-10-16

- Version 1.26.1 (520), source 2b1c377fe80d98cb041b911a76dca66ef06f2ecb,
  on codex/mob-xcode-cloud-20261016. Marketing version remains unchanged.
- Reused workflow CalyMob iOS — TestFlight; run
  0ea75e78-b971-4817-9781-3c389d40f72a completed SUCCEEDED at
  2026-10-16T11:30:11.658Z. Required TEST and ARCHIVE both COMPLETE/SUCCEEDED.
- Both Apple workers passed all 69 Flutter tests and strict dependency checks.
  Native RunnerTests.testProductionBundleConfiguration passed on iPhone 15 /
  iOS 17.5. The archive log records ARCHIVE SUCCEEDED.
- Actual internal TestFlight upload, build
  5154ad42-5a42-428a-a70f-fbfff61a4586, processed VALID, INTERNAL_ONLY,
  non-expired. No local native build/archive was used.
- Approved French notes were explicitly saved and read back because automatic
  note discovery still returned empty notes. The exact approved existing group
  CalyMob Testing team now contains build 520; a separate read verifies
  IN_BETA_TESTING and the approved fr-FR text. No external group was added.
- Verify membership through GET /v1/betaGroups/{groupId}/builds. Apple's inverse
  GET /v1/builds/{buildId}/betaGroups rejects GET_RELATED (403); the first release
  attempt stopped before group mutation. The narrowly repaired verifier received
  independent review before retrying. The approved group's full list had 198
  builds before assignment, below the checked page limit of 200.
- Earlier builds 518 and 519 remain expired after native test failures. A separate
  read confirms build 519 expired=true and internal state EXPIRED. Neither was
  assigned to the approved group.
- Production backend/functions, Firestore rules, feature flags and published
  minimum version were not changed. New Boutique QR grouped actions remain off.
  Existing certificates were not revoked and keys were not replaced.
- Physical phone installation/login/navigation feedback was requested after
  TestFlight availability. Do not equate cloud simulator success with a physical
  camera test. The printed QR's reported iPhone landing issue remains unconfirmed;
  the actual piece resolves in the authenticated desktop web account.

Separate authorized web publication: supplier-dossier QR printing is live on
caly.club from CalyCompta source 0486044b3094aabd38eef78fbfebeef326df0666,
production deployment dpl_FVMh1goTk96WAuXNqyhS3ibNvP7A. Live Articles & receipts
shows the received-piece QR button; its actual A4 preview includes the correct
physical-piece QR. Printing does not register receipt or change stock. See the
web worktree's BTQ-SUPPLIER-QR-PRINT-20261016 QA note. Customer screenshots stay
outside Git.
