# Member data privacy rollout

The private `clubs/{clubId}/members/{memberId}` document is no longer a club
directory. It remains readable by the member themselves and by administrators.
Member-facing lists use two generated projections:

- `member_directory`: name, diving level/club functions, active state, and only
  explicitly shared contact/photo fields. All club members may read it.
- `member_operational_status`: membership, medical certificate, insurance and
  pending-medical state. The member can read their own document; administrators,
  organisers, encadrants and accueil staff can read it for activity operations.

Neither projection is client-writable. `syncMemberProjections` creates, updates
and deletes both documents when the private member source changes. It rereads
the current private source transactionally, so delayed or retried events cannot
restore an older public projection. It does not log source fields or member
identifiers.

## COM-146 compatibility clarification (22 October 2026)

> **SUPERSEDED INTERPRETATION:** the earlier wording “only explicitly shared”
> must not be read as treating a missing `share_email` or `share_phone` field
> as an opt-out. That interpretation conflicts with the established
> `ProfilePage` contract for legacy member documents.

For contact fields, an explicit `false` is the only opt-out. Missing preference
fields retain the legacy sharing default, while the projection still publishes
only the minimal `email` and canonical `phone_number` values. The phone builder
accepts, in order, `phone_number`, `phoneNumber`, then legacy `telephone`.
No backfill is part of this compatibility change: pre-existing directory cards
are refreshed only by a separately authorised projection rebuild.

## Decision — 2026-10-23 (Jan Andriessens)

**Explicit owner choice:** members without a `share_email` or `share_phone`
preference are shown in Who is Who. An explicit opt-out remains hidden.
Reviewers treat this legacy-default contact policy as accepted.

## Event participant phone display (MOB-039, 2026-10-16)

> **SUPERSEDED UI ASSUMPTION:** directory readability alone is not sufficient
> authority for CalyMob to render a participant phone action in an event.

The event participant list exposes the phone action only to event staff: the
original creator, the current organiser, or a member with the exact club status
`encadrant`/`encadrants`. The lookup uses the participant's exact member ID in
`member_directory`; it never falls back to the private `members` document or a
name match. The display boundary checks `share_phone` again and fails closed
for guests, missing/mismatched IDs, absent numbers, or revoked consent.

Birthday sharing is changed through the authenticated
`updateBirthdaySharing` callable. The callable validates that the requested
member is the caller and atomically writes both the private preference and the
public directory projection. Turning sharing off writes
`share_birthday: false`, `birth_month: null`, and `birth_day: null` together.

## Staged rollout (no automatic production action)

Deploying restrictive rules before projections exist would empty member lists.
Use this order when Jan explicitly authorises a production rollout:

1. Deploy `syncMemberProjections` and `updateBirthdaySharing` from
   `CalyMob/functions`. Keep the existing direct member-field rule during this
   compatibility phase.
2. From `CalyCompta`, run the dry-run, then a five-member canary and verify it:
   `node scripts/backfill-member-projections.mjs --club=calypso`,
   `node scripts/backfill-member-projections.mjs --apply --limit=5 --club=calypso`,
   `node scripts/backfill-member-projections.mjs --verify --limit=5 --club=calypso`.
3. Run the full idempotent backfill and verify all projection pairs:
   `node scripts/backfill-member-projections.mjs --apply --club=calypso`, then
   `node scripts/backfill-member-projections.mjs --verify --club=calypso`.
   Verification reports aggregate counts only and checks that non-consented
   contact/photo values and private source fields did not enter the directory.
4. Release the CalyMob mobile/web version that reads `member_directory` and
   uses `updateBirthdaySharing`; verify callable adoption and the opt-out path.
5. Only after supported clients have adopted the callable, deploy the
   source-of-truth `CalyCompta/firestore.rules` that removes direct
   `share_birthday` writes. Old clients then fail closed instead of creating a
   private/public race.

Rollback is non-destructive: restore the prior rules/app reader while leaving
the derived projection collections in place. They contain no additional source
data and can be rebuilt from `members`.
