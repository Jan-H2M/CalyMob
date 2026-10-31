# AV-MED-001 — annual administrative expiry (DEV only)

Member profile/scanner and certificate presentation use calendar-day validity,
inclusive through the final Brussels date. An administrator's issue date adds
one calendar year (29 February clamps to 28 February); an earlier explicit
validity date wins. If issue is absent, retain only an explicit approved expiry,
never infer a physician's visit from file upload. Invalid/future/conflicting
dates stay unknown. This is administrative status, not clinical fitness.

The own-member summary is read when presenting an approved certificate. Its
issue date is joined only if the explicit expiry matches that certificate.
Conflict stays unknown. No new document approval or member-date write occurs.
The restricted operational projection carries issue date, never the directory.
Existing projections are not backfilled by this change.

`dailyMedicalExpiryReminder` is candidate code, not an activated production job.
Daily 10:00 Europe/Brussels; at most one push in days 30–8 and one in days 7–1,
per actual annual expiry. Respect active member, existing push/medical opt-out,
pending renewal, and token availability. Lockscreen text is generic. Transaction
rechecks current member and consumes a unique receipt before dispatch. A second
read checks renewal/opt-out immediately before dispatch. An FCM outcome cannot
be atomic with database updates: ambiguous/error outcomes are not auto-retried.
Logs contain aggregate counts only. History/badge helper remains canonical.

No production activation, notifications, credentials, login, member write,
migration or store action is part of DEV delivery. A future approved deployment
must explicitly scope `dailyMedicalExpiryReminder` and `syncMemberProjections`,
with existing canonical credentials; no blanket Functions deploy. Review the
30/7 cadence and generic notification text with Jan before activation. Rollback:
disable/delete only the new scheduled function and restore previous projection
code; never erase delivery receipts, and never backfill member attestations.

Local: targeted Flutter model/widget tests and mocked runner tests. Isolated
Chrome scenario `?scenario=medical-expiry` uses a fixed fictional clock and no
Firebase initialization; it is not proof of real device push delivery.
