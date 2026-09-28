# CalyMob Android 1.23.1 (215) — production release record

## Completed release

- **Date:** 2026-09-28 (Europe/Brussels)
- **Source:** `36403e0a8351ce17478258ffeb60fd59d46d60f1`
- **Package:** `club.caly.calymob`
- **AAB:** `1.23.1` / versionCode `215`
- **AAB SHA-256:** `0e237e24f18403a8ea429cff692718f91cf2eeb885c60fef1325862faa767a30`
- **Upload:** production AAB uploaded at 18:44 CEST through the authorised
  `google-play-deploy@calycompta.iam.gserviceaccount.com` service account.
- **Production rollout:** completed at 18:52 CEST, full rollout (`1.0`).

The final Google Play API read-back was made through a temporary edit that was
deleted afterwards. It reported versionCode `215`, status `completed`, and no
`userFraction` (completed/full rollout). VersionCode `208` is superseded.

## Play Console display-label anomaly

Google Play retained the prior internal release label `1.22.2` for the
versionCode-215 release even after the Fastlane in-place update requested
`version_name: 1.23.1`. This is a Console display-label anomaly only: the
shipped artifact was independently verified as `versionName 1.23.1` and
`versionCode 215`. No further Play mutation was made solely to rename that
label.

## Scope exclusions

This release did not change `minSupportedVersion`, Firestore boutique settings,
or any Firebase deployment/configuration.
