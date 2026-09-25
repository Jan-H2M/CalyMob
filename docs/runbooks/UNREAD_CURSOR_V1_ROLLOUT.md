# Unread cursor v1 rollout runbook

Status: Part 1 executed on 2026-09-25 with Jan's explicit approval; the cursor
feature remains disabled/off. Do not advance the flag or deploy rules without a
separate rollout approval.

## Preconditions and approvals

Require reviewed local commit, green emulator/device evidence, backup storage,
Firebase deploy approval, production migration approval, feature-flag approval,
and release approval. Pilot membership is the reviewed
`unreadCursorV1PilotMemberIds` list; only those UIDs receive effective ON while
the shared mode remains shadow.

## Ordered rollout

1. From the reviewed CalyMob checkout, after Jan approves each command:

   ```sh
   # Do not deploy CalyMob/firestore.rules. CalyCompta is the source of truth;
   # deploy its reviewed rules only at the shadow gate after comparing them to
   # the retained live-rules backup (CalyCompta PR #96).
   firebase deploy --only firestore:indexes --project <project>
   firebase firestore:indexes --project <project> # Console must show READY
   firebase deploy --only functions:onAnnouncementWritten,functions:onNewAnnouncementReply,functions:onReadStateWritten,functions:onReadStateScopeWritten,functions:onNewAnnouncement,functions:onNewEventMessage,functions:onNewTeamMessage,functions:onNewSessionMessage,functions:onNewOperation --project <project>
   ```
2. Deploy Functions with flag document
   `clubs/calypso/settings/feature_flags` set to
   `{ "unreadCursorV1Enabled": false, "unreadCursorV1Mode": "off" }`. Verify exports and
   logs; legacy behaviour remains authoritative.
3. Run announcement normalization, in this exact order, only after approval:

   ```sh
   node scripts/migrate-unread-read-state-v1.cjs --normalize-announcements --dry-run --project <project>
   node scripts/migrate-unread-read-state-v1.cjs --normalize-announcements --verify --project <project>
   node scripts/migrate-unread-read-state-v1.cjs --normalize-announcements --apply --project <project> --confirm-production <project>
   ```

4. Run read-state migration. Backups are written under `CalyMob/tmp/` by
   default and must be independently retained/reviewed before apply:

   ```sh
   node scripts/migrate-unread-read-state-v1.cjs --dry-run --project <project>
   node scripts/migrate-unread-read-state-v1.cjs --apply --project <project> --confirm-production <project>
   node scripts/migrate-unread-read-state-v1.cjs --verify --project <project>
   ```
5. Release a cursor-capable version/build with the flag OFF and store notes.
   Set shadow with `{ "unreadCursorV1Enabled": true, "unreadCursorV1Mode":
   "shadow", "unreadCursorV1PilotMemberIds": [] }` for at least seven days.
   Proceed only when `unread_cursor_shadow_diff` is below 1% of sampled
   refreshes, cursor/count errors are below 0.1%, and the iOS zero-badge
   checklist scenario is observed. Pilot with shadow plus approved UIDs:
   `{ "unreadCursorV1Enabled": true, "unreadCursorV1Mode": "shadow",
   "unreadCursorV1PilotMemberIds": ["<uid>"] }`; then global ON is
   `{ "unreadCursorV1Enabled": true, "unreadCursorV1Mode": "on" }`.
   Monitor Function latency, `unread_cursor_shadow_diff`, invalid-token cleanup,
   badge reconciliation and device results for 2–4 weeks.

6. The existing forced-update policy is `settings/app_version` (global, not
   club-scoped): set `minSupportedVersion` only after adoption approval; the
   client reads it in `lib/services/app_update_service.dart`. The later cleanup
   release removes LocalReadTracker authority, client `unread_counts` sync,
   legacy counter Functions and `read_by` rules only after that gate.

## Rollback

Set `{ "unreadCursorV1Enabled": false, "unreadCursorV1Mode": "off" }`;
retain cursor docs and backups. If only APNs is wrong,
disable canonical APNs reconciliation while retaining in-app cursor counts.
Restore normalized announcement fields only from the timestamped migration
backup through a separately reviewed Admin script—never manually by bulk UI.

## Commands requiring Jan approval

`firebase deploy`, any real-project migration command, production flag write,
store build/upload/release, minimum-version change, restore, and legacy cleanup.

## Execution log 2026-09-25

- **Superseded (2026-09-25 12:35):** canonical team unread counting now
  includes the same fallback channel IDs exposed by `TeamChannelService` when
  a `team_channels/{id}` parent document is absent, and formation access
  mirrors Flutter's explicit-target / `plongeur_code` rules. Jan approved and
  deployed this correction to production with the scoped Functions below.
- **Superseded (2026-09-25 12:35):** `onAnnouncementWritten` now skips
  hard-delete events safely. The production hard-delete correction was deployed
  with Jan's approval; the prior one-failed-invocation risk is superseded.

- CalyMob Firestore rules were **not** deployed. CalyCompta remains the source
  of truth; [CalyCompta PR #96](https://github.com/Jan-H2M/CalyCompta/pull/96)
  is reserved for the shadow gate after comparison with the retained live
  ruleset backup.
- Firestore index deployment was additive: **67 → 68** indexes, preserving two
  field overrides. The new `announcements` composite index
  (`visibility ASC`, `last_activity_at ASC`) is CREATING.
- Nine Functions from CalyMob commit `0886b17` were deployed in
  `europe-west1` on Node.js 22: the three `document.v1.written` maintenance /
  reconciliation triggers and six `document.v1.created` notification triggers,
  including `onNewOperation`.
- `clubs/calypso/settings/feature_flags` remains
  `unreadCursorV1Enabled: false`, `unreadCursorV1Mode: "off"`; the pilot list
  contains Jan's UID `nvDVlhglO1eGXPBVRd7NbJ2Uevn2` only.
- Migration applied and verified: 27 announcement normalizations and 364 root
  cursors for 91 active members. Backups are retained at
  `../outputs/unread-v1-rollout-2026-09-25-backups/`.
- iOS **1.23.0 (213)** was uploaded from commit `e547dd9` to TestFlight and is
  `VALID` / `IN_BETA_TESTING`. It is available to the internal **CalyMob
  Testing team** group, which has automatic access to all builds and contains
  `jan@andriessens.be`. No App Store or beta-review submission was made.
- Android **1.23.0 (213)** internal-track upload from commit `e547dd9` failed:
  `Google Api Error: Invalid request - The caller does not have permission`.
  Evidence: `/tmp/calymob-android-internal-213.log`. The internal track remains
  version code **184**. Do not retry until Jan grants the Play service account
  the necessary release permission in Play Console.
- **Production server review fixes — 12:33–12:35 Brussels:** Jan approved the
  targeted deployment after PR #85 `payment-integrity` passed. The checkout
  was PR tip `0124ec3`; Functions code was unchanged from `e547dd9`. Deployed
  Functions: `onAnnouncementWritten`, `onNewAnnouncement`,
  `onNewAnnouncementReply`, `onNewEventMessage`, `onNewOperation`,
  `onNewSessionMessage`, `onNewTeamMessage`, `onReadStateWritten`, and
  `onReadStateScopeWritten`. All nine are ACTIVE Firestore v2 triggers in
  `europe-west1`.
- **Verification and log limitation:** isolated `smoke-1` and `smoke-2`
  announcements under `clubs/zz-smoke-unread-20260925` were hard-deleted; the
  collection ended with zero documents. `smoke-2` received the expected
  `visibility: published` and `last_activity_at` normalization, proving
  `onAnnouncementWritten` ran. Firebase CLI logs were stale for every Function
  (including that proven invocation) and Cloud Logging read was denied for
  `jan.andriessens@gmail.com`, so CLI logs could not independently show the
  `onNewAnnouncement` invocation. `Empty Authorization header` warnings
  immediately after Cloud Run startup probes are benign rollout noise.
- **Rollback record:** pre-deploy inventory is
  `tmp/unread-v1-rollout-2026-09-25/prod-functions-before-fixes.txt`; rollback
  is `git checkout 0886b17 && firebase deploy --only` the same nine Functions
  with `--project calycompta`. No feature flags, Firestore rules, or indexes
  changed. There is no CalyMob `dev` branch and no DEV Firebase project.
