# Unread cursor v1 — device checklist

Status: Phase-6 device protocol. Phase-7 Part 1 prerequisites were deployed on
2026-09-25, but the production cursor flag remains disabled/off; do not change
it while using this document without Jan's separate approval.

## Prerequisites

- Use a non-production Firebase project or an explicitly approved pilot club,
  two test members and two physical devices (one iOS, one Android where
  possible). Record app version/build and device OS below.
- Deploy the reviewed rules/indexes/Functions to that non-production project
  first. Start `clubs/{clubId}/settings/feature_flags` with
  `unreadCursorV1Enabled: true, unreadCursorV1Mode: 'shadow'`; put only the
  approved pilot UID in `unreadCursorV1PilotMemberIds` to give it effective ON.
  Do not use a production club for this
  checklist without Jan's separate approval.
- Keep an old released build available for coexistence checks. Use Xcode device
  logs / Android logcat and search Functions logs for
  `unread_cursor_shadow_diff` and `unread_cursor_*` events.

## iOS and Android checks

- [ ] **Flag OFF regression:** legacy badges and navigation behave as before.
- [ ] **Shadow/pilot:** non-pilot remains legacy while the listed pilot receives
      canonical UI and APNs badges; remove UID and confirm immediate fallback.
- [ ] **Reinstall/new device:** after cursor migration, no historical 2024
      flood; tiles and app icon converge to current unread only.
- [ ] **Two devices:** mark one conversation read on A; B converges after
      refresh/resume without reopening the tile.
- [ ] **Events:** message inside end + 7 Brussels calendar days counts; one
      after expiry does not. Confirm canceled, waitlisted and withdrawn
      registrations do not count.
- [ ] **Announcements:** create, reply, then soft-delete; activity appears,
      reply becomes unread, deletion disappears. Confirm a short maintenance
      delay cannot miss a reply.
- [ ] **Roles:** add/remove CA, Encadrant and Accueil; team/session scopes
      appear/disappear without stale counts.
- [ ] **Offline:** open a conversation offline, reconnect, then confirm one
      monotonic cursor write and correct final count.
- [ ] **Push:** foreground, background and cold start; iOS APNs badge rises and
      receives an explicit zero after mark-read while the app is killed.
- [ ] **Actions:** opening either landing tile clears nothing; each confirmed
      *Tout marquer comme lu* clears only its section; cancel clears nothing.
- [ ] **Coexistence:** old and cursor-v1 builds for the same member do not let
      old `unread_counts` change cursor-mode tiles/APNs.

## Results

| Date | Project/club | Device + OS | Build | Flag mode | Scenario | Result / logs / defect |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

Rollout note (2026-09-25): 27 announcement documents and 364 cursor roots for
91 active members were migrated and verified. The iOS 1.23.0+213 IPA is pending
local build; TestFlight upload and any shadow/pilot activation remain gated by
Jan's release-manifest approval.
