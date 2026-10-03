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
