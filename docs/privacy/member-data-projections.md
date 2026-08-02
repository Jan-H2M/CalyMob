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
and deletes both documents when the private member source changes. It does not
log source fields or member identifiers.

## Staged rollout (no automatic production action)

Deploying restrictive rules before projections exist would empty member lists.
Use this order when Jan explicitly authorises a production rollout:

1. Deploy `syncMemberProjections` from `CalyMob/functions`.
2. From `CalyCompta`, run the dry-run, then a five-member canary and verify it:
   `node scripts/backfill-member-projections.mjs --club=calypso`,
   `node scripts/backfill-member-projections.mjs --apply --limit=5 --club=calypso`,
   `node scripts/backfill-member-projections.mjs --verify --limit=5 --club=calypso`.
3. Run the full idempotent backfill and verify all projection pairs:
   `node scripts/backfill-member-projections.mjs --apply --club=calypso`, then
   `node scripts/backfill-member-projections.mjs --verify --club=calypso`.
   Verification reports aggregate counts only and checks that non-consented
   contact/photo values and private source fields did not enter the directory.
4. Release the CalyMob version that reads `member_directory`.
5. Deploy the source-of-truth `CalyCompta/firestore.rules`.

Rollback is non-destructive: restore the prior rules/app reader while leaving
the derived projection collections in place. They contain no additional source
data and can be rebuilt from `members`.
