# MOB-026 organizer identity and handover

## Phase 1 rules mirror

This file mirrors the staged organizer invariant documented in CalyCompta.

- `organisateur_id` identifies the current organizer.
- `organisateur_nom` is a display projection of that member identity.
- `creator_user_id` identifies the original creator and stays unchanged during
  a handover.

The Phase 1 Firestore rule allows administrators and validators to create an
event for another existing club member. Ordinary users and members with the
Organisateur badge remain restricted to themselves. Final strict name and
creator validation is deferred until the compatibility phase so older CalyMob
versions are not locked out.

## Phase 2 handover rules mirror

The web handover flow selects the target from the member list and writes the
member id and canonical name together. The Firestore mirror now enforces these
authorization boundaries for direct clients:

- `creator_user_id` is immutable after creation;
- admins and validators keep their normal event update rights;
- the current organizer and the original creator may hand over an event to an
  existing member, but that narrow write may change only `organisateur_id`,
  `organisateur_nom`, and `updated_at`;
- unrelated members cannot perform a handover.

Name equality is deliberately not enforced in this phase. Older CalyMob
versions still write the denormalized name directly; Phase 3 will canonicalize
it server-side without locking those clients out.
