# COM-155 — Firebase inventory and manifest alignment

Read-only observation: 2026-11-02T13:28:35.024539+00:00. Project: `calycompta`. This change inventories
existing deployments and proposes source alignment; it does not deploy, remove,
invoke, activate or change any function. The JSON registry is an **inventory**,
not a Firebase deployment manifest. `firebase.json` and `functions/index.js`
remain unchanged.

## Verified state

The item was still unfinished when checked: the 15 Firebase functions below are
live and exported on `dev`, but absent from `main`'s `functions/index.js`.
No existing COM-155 implementation or PR was found in the inspected branches/PRs.

| Set | Count | Evidence |
|---|---:|---|
| Live Cloud Functions | 127 | Authenticated `gcloud functions list`, all ACTIVE |
| Firebase-managed Gen2 | 126 | `cli-firebase` deployment labels, Node 22 |
| CalyMob `main` exports | 111 | `6d278fa0434d16a45ade9bdceb6f41673c87e1b0` |
| Live Firebase functions absent from `main` | 15 | Listed below; all already exported on `dev` |
| CalyMob `dev` exports | 127 | `3a7a5b148e5c6cf64f5ef14262971dd4a0aab6ba` |
| `dev` function absent from live | 1 | `dailyMedicalExpiryReminder` |
| Separately managed Gen1 | 1 | `confirmResolution`, `cli-gcloud`, Node 22 |

Every `main` export exists live. All 126 live Firebase function names exist on
`dev`; there are no missing Firebase implementations to recreate there.
The union contains 128 names: 127 live plus the one repo-only scheduled function.
`inMainAtAudit` / `inDevAtAudit` in the registry refer to **CalyMob** exports at
the recorded commits, not to every repository and not to future branch state.

### The 15 functions needing main alignment

| Function | Existing source on CalyMob dev |
|---|---|
| `assignApneePoolCourse` | `functions/src/training/assignApneePoolCourse.js` |
| `boutiquePhysicalOperations` | `functions/src/boutique/physicalOperations.js` |
| `correctPoolStudentGroup` | `functions/src/training/correctPoolStudentGroup.js` |
| `getPoolFormationOverviewV1` | `functions/src/progression/getPoolFormationOverview.js` |
| `manageApneeTraining` | `functions/src/training/apnee/training.js` |
| `manageFormationEnrollment` | `functions/src/training/formationEnrollment.js` |
| `onNotificationHistoryWritten` | `functions/src/notifications/onReadStateWritten.js` |
| `onQrTrainingGroupCreated` | `functions/src/training/assignQrTrainingGroup.js` |
| `queueBugResolutionFeedbackV1` | `functions/src/notifications/bugResolutionFeedback.js` |
| `recordOfficialFormationResult` | `functions/src/training/officialFormationResults.js` |
| `recordPoolQrAttendance` | `functions/src/training/poolQrAttendance.js` |
| `respondToBugResolutionFeedbackV1` | `functions/src/notifications/bugResolutionFeedback.js` |
| `sendBoutiquePickupNotification` | `functions/src/boutique/pickupNotifications.js` |
| `setPersonalExerciseProgress` | `functions/src/training/personalExerciseProgress.js` |
| `updateEventRegistration` | `functions/src/inscription/eventWaitlist.js` |

### Separate ownership and the repo-only schedule

`confirmResolution` is tracked in [CalyCompta's source](https://github.com/Jan-H2M/CalyCompta/blob/1ab07574d254be70ef24774a2cab02a15553361d/functions/src/index.ts)
and has an [isolated Gen1 package/manifest builder](https://github.com/Jan-H2M/CalyCompta/blob/1ab07574d254be70ef24774a2cab02a15553361d/scripts/bug-automation/deployment/build-confirm-resolution.cjs).
It belongs outside CalyMob's `default` Firebase codebase. Do not add its export to
CalyMob or deploy CalyCompta's full historical `functions/lib/index.js`, which also
contains unrelated functions. Its generation, region and deployment ownership
are recorded explicitly in the registry.

`dailyMedicalExpiryReminder` is intentionally recorded as **repo-only** because
no live endpoint was found. This audit does not establish why it is absent and
does not authorize its activation or any reminder delivery.

## Alignment proposal

1. Merge this inventory/checker to `dev`. It accounts for every existing live
   function and the repo-only schedule without altering deployable exports.
2. Prepare a separate, narrowly reviewed `main` backport of the 15 existing
   `dev` exports and their required source/helper/test changes. The current
   `main..dev` Functions diff includes other behavior changes; copying only
   `index.js`, merging all of `dev`, or adding stub handlers is insufficient.
   Source/manifest alignment in Git does not require a Cloud Functions deploy.
3. Keep `confirmResolution` under its existing CalyCompta Gen1 builder. Do not
   adopt it into the Firebase codebase. Keep the absent medical schedule an
   explicit exception until its separate release decision.
4. Before any later runtime release, refresh the read-only inventory, compare
   recovered deployed source/configuration with the exact proposed source and
   request Jan's approval for the explicit function names and behavior changes.
   This registry proves names/ownership/source-file presence, **not byte-for-byte
   parity with deployed artifacts**. A broad `firebase deploy --only functions`
   is not part of COM-155 and must not be used to reconcile this difference.

Jan's production OK is needed for any actual production function deployment,
configuration change, deletion or activation, including
`dailyMedicalExpiryReminder`. **This PR needs no production action.** No Linear
card should be marked Résolu: `main` alignment and production source parity are
still pending. There is no runtime change to deploy to DEV; the merged DEV commit
is validated with the offline inventory command and CI instead.

## Repeat the read-only comparison

From an account authorized to read the Calypso production project:

```sh
# Keep the raw response outside Git: it can contain env values and signed URLs.
gcloud functions list --project=calycompta --format=json > /tmp/com155-live-functions.json
node scripts/audit-firebase-inventory.cjs --live-json /tmp/com155-live-functions.json
```

The checker reads only allowlisted metadata, compares identity (region/name),
generation, runtime, entry point, trigger type, active state, deployment tool and
update timestamp, and emits no environment/configuration values. It performs no
network request and never imports a function handler. Current source mappings
are checked statically against the CommonJS entrypoint and source-file presence.
The reader deliberately rejects unsupported export syntax; update it when
refactoring that entrypoint. This is not a full JavaScript AST or dependency
closure/source-parity check. CI uses the snapshot only and has no cloud credentials.

```sh
node --test scripts/audit-firebase-inventory.test.cjs
node scripts/audit-firebase-inventory.cjs
# Expected to fail until main is aligned (15 live names + repo-only schedule):
node scripts/audit-firebase-inventory.cjs --repo-ref origin/main
```

A new deployment, removal or timestamp change makes the live comparison fail;
review and refresh the snapshot from a fresh read, rather than treating this
dated file as current production proof. Update the inventory with future export
changes. Raw cloud responses and credentials must never be committed.
