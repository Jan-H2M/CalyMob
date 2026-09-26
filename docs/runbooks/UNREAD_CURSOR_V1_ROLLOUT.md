# Unread cursor v1/v2 rollout runbook

This runbook is a plan only. Every deploy, production write, minimum-version
change, restore, build, upload and store release needs separate authorization.
The implementation commit does not perform any of those actions.

## Non-negotiable sources and gates

- **Firestore rules are deployed only from the reviewed CalyCompta checkout.**
  Never deploy `CalyMob/firestore.rules` or this worktree's whole rules file.
  It is a test mirror and contains unrelated divergence.
- Port only the reviewed unread/session/team/Bureau/Gonflage hunks into the
  canonical CalyCompta rules, compare against the live rules backup, then run
  the consolidated CalyCompta emulator suite and this repository's
  `npm run test:rules:read-state` against the exact candidate.
- Deploy the CalyCompta web writers for event messages, announcement roots and
  announcement replies before timestamp-v2 becomes required. A marker may be
  `backfilled` with `writer_contract=optional_legacy`; it must not become
  `enforcing`/`complete` with `writer_contract=required` until all supported web
  and mobile writers submit the canonical server timestamp fields.
- Keep `unreadCursorV1Mode=off` while infrastructure, markers and clients are
  prepared. An unread timestamp v2 flag/marker remains off or shadow until its
  create-time backfill is complete and its shadow comparison is accepted.
- Retain every generated backup and manifest outside the checkout before the
  next phase. A non-zero verify, divergent marker or ambiguous cohort stops the
  rollout.

## Candidate evidence before any production action

Run from the reviewed candidate:

```sh
cd functions && npm test -- --runInBand
cd ..
flutter test
flutter analyze
node --test scripts/record-unread-cursor-v1-migration-baseline.test.cjs \
  scripts/backfill-session-chat-acl.test.cjs \
  scripts/backfill-unread-timestamps-v2.test.cjs \
  scripts/test-unread-web-writers.cjs
npm run build:check
npm run test:rules:read-state
```

The rules test must prove self-only cursor writes, all server-only marker
documents, optional-versus-required timestamp writers, assignment-scoped
session chat, Bureau BS-only confidentiality, exact team/formation mapping and
Gonflage normalization. Event discussion access intentionally keeps the
existing club-member rule in this release; participant-only ACL is a separate
security/product change, not part of this unread rollout.

## Ordered rollout

Use `<project>`, `<club>` and `<backup-dir>` literally as operator-supplied
values; do not infer them in a script.

### 1. Backup and deploy additive indexes

Back up live rules, indexes, all three migration markers and the feature flag.
From the reviewed source, deploy only the additive indexes and wait until every
new index is `READY`. Do not change flags or rules in this step.

### 2. Deploy the compatible server layer

Deploy the reviewed CalyCompta web bundle containing:

- `src/services/eventMessageService.ts`: `created_at` and
  `unread_created_at` are `serverTimestamp()`;
- `src/services/annonceService.ts`: announcement roots write `created_at`,
  `unread_created_at` and `unread_activity_at`; replies write `created_at` and
  `unread_created_at`.

Then deploy the complete, reviewed Function set. The set must include the
callables/triggers below; deploying only the old nine-function set is unsafe:

```text
bootstrapUnreadCursorV1
acknowledgeVisibleUnreadCursorV1
onReadStateWritten
onReadStateScopeWritten
onAnnouncementWritten
onAnnouncementReplyDeleted
onNewAnnouncement
onNewAnnouncementReply
onNewEventMessage
onNewTeamMessage
onNewSessionMessage
onNewOperation
ensurePiscineSessionChatAcl
onPiscineSessionChatAclWritten
onAnnouncementUnreadTimestampCreated
onAnnouncementReplyUnreadTimestampCreated
onEventMessageUnreadTimestampCreated
onTeamMessageUnreadTimestampCreated
onSessionMessageUnreadTimestampCreated
```

The badge helper is shared by non-unread pushes. Redeploy every caller whose
bundle must stop overwriting an effective-ON canonical badge:

```text
birthdayNotification
dailyExerciseDeclarationDigest
onExerciceDeclared
onMedicalCertStatusChange
sessionReminder
onClaimRejected
onLogbookDiveBuddiesChanged
```

Also deploy changed recipient-bound push producers
`onPiscineTaskAssigned`, `processFormationTaskReminders` and the event waitlist
callables (`registerForEvent`, `unregisterFromEvent`, `joinEventWaitlist`,
`leaveEventWaitlist`, `promoteEventWaitlistEntry`, `addGuestToEvent`). Verify
exports, regions (`europe-west1`), retry policy for reconciliation triggers and
logs before continuing.

### 3. Establish or repair cursor-v1 trusted baseline

For a truly empty cohort, the normal migration is dry-run, apply, verify:

```sh
node scripts/migrate-unread-read-state-v1.cjs --dry-run \
  --project <project> --club <club> --backup-dir <backup-dir>
node scripts/migrate-unread-read-state-v1.cjs --apply \
  --project <project> --club <club> --backup-dir <backup-dir> \
  --confirm-production <project>
node scripts/migrate-unread-read-state-v1.cjs --verify \
  --project <project> --club <club> --backup-dir <backup-dir>
```

The normal migration deliberately refuses a missing marker when any read-state
root already exists. For the known earlier migration, use the strict repair
tool only. It must prove every selected active non-pilot member has four valid,
identical roots in one unique cohort and must match the operator-supplied
baseline exactly:

```sh
node scripts/record-unread-cursor-v1-migration-baseline.cjs --dry-run \
  --project <project> --club <club> \
  --expected-baseline <exact-ISO-baseline> --backup-dir <backup-dir>
node scripts/record-unread-cursor-v1-migration-baseline.cjs --apply \
  --project <project> --club <club> \
  --expected-baseline <exact-ISO-baseline> --backup-dir <backup-dir> \
  --confirm-production <project>
```

Do not use `--force` to bypass an ambiguous existing cohort.

### 4. Materialize and verify session chat ACLs

Deploy the ACL derivation trigger/callable first, then:

```sh
node scripts/backfill-session-chat-acl.cjs --dry-run \
  --project <project> --club <club> --backup-dir <backup-dir>
node scripts/backfill-session-chat-acl.cjs --apply \
  --project <project> --club <club> --backup-dir <backup-dir> \
  --confirm-production <project>
node scripts/backfill-session-chat-acl.cjs --verify \
  --project <project> --club <club> --backup-dir <backup-dir>
```

If apply is interrupted, read the exact `run_id` and `manifest` from
`settings/session_chat_acl_v1_migration`. Resume only that run:

```sh
node scripts/backfill-session-chat-acl.cjs --apply \
  --resume-run-id <exact-run-id> --project <project> --club <club> \
  --backup-dir <backup-dir> --confirm-production <project>
```

To restore a running or completed owned run, use its exact change manifest.
The tool refuses divergent session data, creates a pre-restore backup, restores
the original `chat_acl` states and restores/deletes the marker exactly:

```sh
node scripts/backfill-session-chat-acl.cjs --restore \
  --manifest <exact-manifest-path> --project <project> --club <club> \
  --backup-dir <backup-dir> --confirm-production <project>
```

### 5. Port and deploy the compatible CalyCompta rules candidate

Selectively port these reviewed rule changes into the canonical CalyCompta
rules file; do not copy the whole mobile mirror:

- protect `unread_cursor_v1_migration`, `unread_timestamp_v2_migration` and
  `session_chat_acl_v1_migration` from every client/admin write;
- self-only, monotone, request-time `read_state` roots and announcement/event/
  team/session scope documents; server-only per-member bootstrap markers;
- timestamp creates remain optional unless the server-only timestamp marker is
  `enforcing|complete` and `writer_contract=required`; supplied canonical
  timestamps must always equal `request.time`, and clients cannot update them;
- session chat uses server-derived `chat_acl` per concrete accueil/encadrant/
  level assignment and clients cannot edit that ACL;
- Bureau is BS-only with no admin/CA bypass; team channel id/type and exact
  formation-active mapping match mobile/Functions;
- Gonflage matching is trimmed/case-normalized and physical loan management is
  Gonflage-only.

Run both emulator suites against the exact merged CalyCompta rules candidate,
compare it with the live backup, then deploy **that one rules file**. At this
stage timestamp marker status is absent or `backfilled/optional_legacy`, so
live 1.22.4 writes remain accepted.

### 6. Backfill server-authoritative unread timestamps

The reconciliation triggers must already be live. The backfill uses Firestore
`DocumentSnapshot.createTime` for all historical documents and reports device
clock skew examples; it never trusts legacy client timestamps.

```sh
node scripts/backfill-unread-timestamps-v2.cjs --dry-run \
  --project <project> --club <club> --backup-dir <backup-dir>
node scripts/backfill-unread-timestamps-v2.cjs --apply \
  --project <project> --club <club> --backup-dir <backup-dir> \
  --confirm-production <project>
node scripts/backfill-unread-timestamps-v2.cjs --verify \
  --project <project> --club <club> --backup-dir <backup-dir>
```

Stop if imports/restores create material skew outliers. A successful apply
leaves marker `backfilled`, authority `document_create_time`, missing count
zero and `writer_contract=optional_legacy`.

### 7. Release clients, shadow, then enforce writer contract

Release the cursor/timestamp-capable mobile build while cursor and timestamp
flags are OFF. Observe legacy behaviour first. Enable timestamp shadow only
after the marker is backfilled; missing marker, flag or query failures must
retain the last complete/legacy result and must never publish a canonical zero.

Only after:

1. the verified CalyCompta web writers are live;
2. the required mobile version is available and adopted;
3. `settings/app_version.minSupportedVersion` safely excludes 1.22.4 and every
   other writer that omits canonical timestamps;
4. shadow counts and timestamp coverage meet the approved thresholds;

may the timestamp contract be finalized:

```sh
node scripts/backfill-unread-timestamps-v2.cjs --finalize \
  --project <project> --club <club> --backup-dir <backup-dir> \
  --confirm-production <project> --confirm-writer-contract required
```

Finalize first writes `enforcing|required`, then performs a fresh full scan,
and writes `complete|required` only when zero repairs remain. If the scan finds
an old-writer race, it stays enforcing and refuses completion; repair and rerun
verification before retrying finalize.

### 8. Cursor shadow, pilot and global ON

Use only a separately approved field-masked feature-flag write:

1. `unreadCursorV1Enabled=false`, mode `off`;
2. enabled `true`, mode `shadow`, pilot list empty;
3. mode `shadow` with explicitly approved pilot UIDs;
4. mode `on` globally only after device, Function, badge and query evidence is
   accepted.

Effective ON owns aggregate, rows and every APNs badge source. It never shows
legacy/cache `99+` during flag/bootstrap/query transitions. Mark-all must set
the canonical badge to zero and cancel pending local notifications. Monitor
per-recipient count/send/history errors independently; one recipient failure
must not retry or duplicate another recipient's successful push.

## Rollback and restore order

Rollback is fail-safe and ordered:

1. field-mask cursor and timestamp feature modes to OFF; preserve pilot lists;
2. if rules enforcement is implicated, deploy the retained prior **CalyCompta**
   ruleset before rolling back compatible writers;
3. retain cursor, ACL and timestamp documents unless a separately approved
   restore is required; they are safe while flags are OFF;
4. restore timestamp changes only with the exact manifest:

   ```sh
   node scripts/backfill-unread-timestamps-v2.cjs \
     --restore <exact-change-manifest> --project <project> --club <club> \
     --backup-dir <backup-dir> --confirm-production <project>
   ```

5. restore session ACL only with the exact command in step 4;
6. roll back Functions/web code last, after rules accept the older writers.

Never lower a real user acknowledgement, manually edit a migration marker, or
bulk-delete read-state documents. OFF rollback keeps LocalReadTracker mirrored
with canonical acknowledgements, so reads made during ON do not resurrect.

## Explicitly deferred work

- Event discussion Firestore access remains the existing club-member policy.
  Registration-bound confidentiality needs separate product/security approval
  and an atomic ACL migration; it is not silently bundled into unread work.
- Broader all-formation access for Encadrants is not authorized. UI, push and
  counting follow the existing Firestore intersection; changing that policy is
  a separate product decision.
- Legacy counters/read-by fields may be removed only in a later cleanup after
  the minimum-version gate, rollback window and adoption period are complete.

## Historical production fact (do not treat as authorization)

iOS 1.23.0 (213) was previously uploaded to TestFlight and exposed the
legacy-to-cursor handover failure. The original rollout seeded 364 root cursors
for 91 active members at one baseline but did not create the trusted marker.
Those facts explain the strict marker-repair path above; they do not authorize
any new deploy, production write, build or store action.
