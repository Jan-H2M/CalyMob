# Unread cursor v1 rollout runbook

Status: written in Phase 6; **do not execute without Jan's explicit approval**.

## Preconditions and approvals

Require reviewed local commit, green emulator/device evidence, backup storage,
Firebase deploy approval, production migration approval, feature-flag approval,
and release approval. Pilot membership is the reviewed
`unreadCursorV1PilotMemberIds` list; only those UIDs receive effective ON while
the shared mode remains shadow.

## Ordered rollout

1. From the reviewed CalyMob checkout, after Jan approves each command:

   ```sh
   firebase deploy --only firestore:rules --project <project>
   firebase deploy --only firestore:indexes --project <project>
   firebase firestore:indexes --project <project> # Console must show READY
   firebase deploy --only functions:onAnnouncementWritten,functions:onNewAnnouncementReply,functions:onReadStateWritten,functions:onReadStateScopeWritten,functions:onNewAnnouncement,functions:onNewEventMessage,functions:onNewTeamMessage,functions:onNewSessionMessage --project <project>
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
