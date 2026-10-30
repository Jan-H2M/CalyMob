# MOB-STORES-BTQ-20261017

Jan requested publication of the Boutique version on both public stores.
Live read-only checks on 2026-10-17 show App Store 1.26.1 READY_FOR_SALE,
no editable/in-review version, and Play production version code 226.
The latest successful Xcode Cloud run is 521, source 7894cf3; its binary
is INTERNAL_ONLY and cannot be submitted to the App Store.

## Candidate

- Version 1.26.2+522 on both platforms. Reuses the complete reviewed Boutique
  implementation from 7894cf3 and its unchanged native dependencies/signing.
- Reuse the existing manual workflow D11B66EC-6E95-43A4-B345-727D1992D72A.
  Change its archive audience to APP_STORE_ELIGIBLE, retain required native
  tests, pinned toolchains, clean workers and all automatic triggers disabled.
- Apple servers perform all native iOS compilation, signing and upload.
  A successful required TEST and ARCHIVE run, exact source provenance and
  processed VALID/App Store eligible binary are prerequisites for submission.
- Android uses the clean-source release script and external signing files.
- Identical proposed French public notes are committed for both stores.
  These are a proposal, not an approval. Internal TestFlight approval does
  not stand in for approval of public release notes or public submission.
- Exact public release approval, independent reviews, artifact hashes and
  actual build/test provenance must be recorded in the external schema-v2
  release manifest. Public submission uses the verifier-backed Fastlane lanes.

## Boundaries

No backend, Firestore rules, feature-flag, production stock, buyer notification,
certificate, secret or published minimum-version change is part of this release.
The real physical device test remains unconfirmed; yesterday's cloud simulator
and fictitious Flutter-web preview are separate evidence.
Existing unrelated worktrees and branches are preserved. This document makes
no claim that 1.26.2 is built, uploaded, submitted, approved or available yet.
